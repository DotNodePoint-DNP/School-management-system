import { requireDashboardPage } from "@/core/session/server";
import StaffAttendanceWorkspace from "@/modules/staff-attendance/StaffAttendanceWorkspace";

export default async function StaffAttendancePage() {
  const user = await requireDashboardPage("/dashboard/staff/attendance");
  return (
    <StaffAttendanceWorkspace
      userId={user.id}
      self={user.permissions.includes("staff-attendance:self")}
      review={user.permissions.includes("staff-attendance:review")}
      admin={
        user.roles.includes("ADMIN") &&
        user.permissions.includes("school:manage")
      }
    />
  );
}
