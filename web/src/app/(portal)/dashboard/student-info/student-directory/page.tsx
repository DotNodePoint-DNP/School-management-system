import { requireDashboardPage } from "@/core/session/server";
import StudentsWorkspace from "@/modules/admissions/StudentsWorkspace";

export default async function StudentDirectoryPage() {
  const user = await requireDashboardPage("/dashboard/student-info/student-directory");
  return <StudentsWorkspace permissions={user.permissions} />;
}
