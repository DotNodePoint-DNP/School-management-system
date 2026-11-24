import { requireDashboardPage } from "@/core/session/server";
import AttendanceWorkspace from "@/modules/attendance/AttendanceWorkspace";

export default async function AttendancePage() {
  const user = await requireDashboardPage("/dashboard/attendance");
  return <AttendanceWorkspace permissions={user.permissions} />;
}
