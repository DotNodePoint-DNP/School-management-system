import { Injectable } from '@nestjs/common';
import { CursorPaginated } from '../../common/dto/pagination.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';

const AUDIT_SELECT = {
  id: true,
  occurredAt: true,
  actorId: true,
  actorName: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  ipAddress: true,
  userAgent: true,
} satisfies Prisma.AuditLogSelect;

export type AuditLogResponse = Prisma.AuditLogGetPayload<{
  select: typeof AUDIT_SELECT;
}>;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListAuditLogsQueryDto,
  ): Promise<CursorPaginated<AuditLogResponse>> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.from || query.to) {
      where.occurredAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1, // one extra row tells us whether another page exists
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: AUDIT_SELECT,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return new CursorPaginated(items, {
      limit: query.limit,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    });
  }
}
