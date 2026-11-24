import { requireDashboardPage } from "@/core/session/server";
import GuardiansWorkspace from "@/modules/students/GuardiansWorkspace";

export default async function GuardianDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireDashboardPage("/dashboard/student-info/parent-directory");
  const { id } = await params;
  return <GuardiansWorkspace permissions={user.permissions} initialSelectedId={id} />;
}
