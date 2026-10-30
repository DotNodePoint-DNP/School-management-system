import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import AttendanceCalendarWorkspace from "@/modules/attendance/AttendanceCalendarWorkspace";

export default async function AttendanceCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const canManage = user.permissions.includes("attendance:calendar-manage");
  const canRead = user.permissions.some((permission) =>
    [
      "attendance:read",
      "attendance:read-all",
      "attendance:mark-any",
      "attendance:correct",
    ].includes(permission),
  );
  if (!canRead && !canManage) notFound();

  return <AttendanceCalendarWorkspace canManage={canManage} />;
}
