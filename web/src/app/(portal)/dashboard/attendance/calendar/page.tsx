import { requireDashboardPage } from "@/core/session/server";
import AttendanceCalendarWorkspace from "@/modules/attendance/AttendanceCalendarWorkspace";

export default async function AttendanceCalendarPage() {
  const user = await requireDashboardPage("/dashboard/attendance/calendar");
  const canManage = user.permissions.includes("attendance:calendar-manage");

  return <AttendanceCalendarWorkspace canManage={canManage} />;
}
