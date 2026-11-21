import { requireDashboardPage } from "@/core/session/server";
import StudentsWorkspace from "@/modules/admissions/StudentsWorkspace";

export default async function StudentsPage() {
  await requireDashboardPage("/dashboard/Admission-Enrollment/students");

  return <StudentsWorkspace />;
}
