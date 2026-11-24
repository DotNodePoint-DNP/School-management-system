import { requireDashboardPage } from "@/core/session/server";
import { DirectoryProfile } from "@/modules/admissions/DirectoryProfile";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireDashboardPage("/dashboard/student-info/student-directory");
  const { id } = await params;
  return <DirectoryProfile key={id} permissions={user.permissions} selectedId={id} />;
}
