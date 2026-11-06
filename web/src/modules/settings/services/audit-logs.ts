import { createApiClient } from "@/lib/api/client";

export interface AuditLogRecord {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditLogQuery {
  limit?: number;
  cursor?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export async function listAuditLogs(query: AuditLogQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  const suffix = search ? `?${search}` : "";
  return createApiClient().getCursorPaginated<AuditLogRecord>(
    `/audit-logs${suffix}`,
  );
}
