import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import AuditLogWorkspace from "@/modules/settings/components/AuditLogWorkspace";

export default async function AuditLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "settings")) notFound();
  if (!user.permissions.includes("audit-logs:read")) notFound();
  return <AuditLogWorkspace />;
}
