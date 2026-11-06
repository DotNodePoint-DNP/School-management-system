import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import AttendanceWorkspace from "@/modules/attendance/AttendanceWorkspace";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const permissions = user.permissions;
  const isOffice = permissions.some((permission) =>
    [
      "attendance:read-all",
      "attendance:mark-any",
      "attendance:correct",
    ].includes(permission),
  );
  const canRead = isOffice || permissions.includes("attendance:read");
  const canMark = permissions.some((permission) =>
    ["attendance:mark", "attendance:mark-any", "attendance:correct"].includes(
      permission,
    ),
  );
  const canManageCalendar = permissions.includes("attendance:calendar-manage");
  const canReadChanges = permissions.some((permission) =>
    ["attendance:read-all", "attendance:correct"].includes(permission),
  );
  const canViewPending = isOffice;
  if (!canRead && !canMark && !canManageCalendar && !canReadChanges) notFound();

  return (
    <AttendanceWorkspace
      canRead={canRead}
      canMark={canMark}
      canManageCalendar={canManageCalendar}
      canReadChanges={canReadChanges}
      canViewPending={canViewPending}
    />
  );
}