import { requireDashboardPage } from "@/core/session/server";
import AttendanceCorrectionsWorkspace from "@/modules/attendance/AttendanceCorrectionsWorkspace";

export default async function AttendanceCorrectionsPage() {
  await requireDashboardPage("/dashboard/attendance/corrections");

  return <AttendanceCorrectionsWorkspace />;
}
