import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import PendingAttendanceWorkspace from "@/modules/attendance/PendingAttendanceWorkspace";

export default async function PendingAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      [
        "attendance:read-all",
        "attendance:mark-any",
        "attendance:correct",
      ].includes(permission),
    )
  ) {
    notFound();
  }

  return <PendingAttendanceWorkspace />;
}
