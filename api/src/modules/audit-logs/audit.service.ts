import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '../../common/constants/audit-actions.js';
import { requestContext } from '../../common/context/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AuditEntry {
  actor?: { id: string; fullName?: string | null } | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|hash|cookie|authorization/i;
const MAX_DETAILS_BYTES = 8_192;

function sanitize(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 5) return '[truncated]';
  if (Array.isArray(value))
    return value.map((item) =>
      sanitize(item, depth + 1),
    ) as Prisma.InputJsonArray;
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key)
        ? '[redacted]'
        : sanitize(item, depth + 1);
    }
    return out as Prisma.InputJsonObject;
  }
  return String(value);
}

function buildDetails(
  details: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (!details) return undefined;
  const clean = sanitize(details);
  if (clean === null) return undefined;
  return JSON.stringify(clean).length > MAX_DETAILS_BYTES
    ? { truncated: true }
    : clean;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort: a failed audit write is logged but never fails the user's request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.recordIn(this.prisma, entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log "${entry.action}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Writes inside the caller's transaction and throws on failure. Use for money and marks. */
  async recordIn(
    db: Pick<Prisma.TransactionClient, 'auditLog'>,
    entry: AuditEntry,
  ): Promise<void> {
    const context = requestContext.getStore();
    await db.auditLog.create({
      data: {
        actorId: entry.actor?.id,
        actorName: entry.actor?.fullName ?? undefined,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: buildDetails(entry.details),
        ipAddress: context?.ipAddress ?? undefined,
        userAgent: context?.userAgent ?? undefined,
      },
    });
  }
}
