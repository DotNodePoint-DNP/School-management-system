import { requireDashboardPage } from "@/core/session/server";
import StudentsWorkspace from "@/modules/admissions/StudentsWorkspace";

export default async function StudentDirectoryPage() {
  await requireDashboardPage("/dashboard/student-info/student-directory");
  return <StudentsWorkspace />;
}
