import { requireDashboardPage } from "@/core/session/server";
import StudentsWorkspace from "@/modules/admissions/StudentsWorkspace";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireDashboardPage("/dashboard/student-info/student-directory");
  const { id } = await params;
  return <StudentsWorkspace permissions={user.permissions} initialSelectedId={id} />;
}
