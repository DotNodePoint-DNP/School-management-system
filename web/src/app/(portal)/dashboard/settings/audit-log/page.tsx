import { requireDashboardPage } from "@/core/session/server";
import AuditLogWorkspace from "@/modules/settings/components/AuditLogWorkspace";

export default async function AuditLogPage() {
  await requireDashboardPage("/dashboard/settings/audit-log");
  return <AuditLogWorkspace />;
}
