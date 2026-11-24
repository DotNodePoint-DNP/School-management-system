import { requireDashboardPage } from "@/core/session/server";
import AttendanceReportsWorkspace from "@/modules/attendance/AttendanceReportsWorkspace";

export default async function AttendanceReportsPage() {
  await requireDashboardPage("/dashboard/attendance/reports");

  return <AttendanceReportsWorkspace />;
}
