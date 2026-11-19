import { requireDashboardPage } from "@/core/session/server";
import GuardiansWorkspace from "@/modules/students/GuardiansWorkspace";

export default async function ParentDirectoryPage() {
  const user = await requireDashboardPage("/dashboard/student-info/parent-directory");
  return <GuardiansWorkspace permissions={user.permissions} />;
}
