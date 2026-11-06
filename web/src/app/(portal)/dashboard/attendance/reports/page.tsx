import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import AttendanceReportsWorkspace from "@/modules/attendance/AttendanceReportsWorkspace";

export default async function AttendanceReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      [
        "attendance:read",
        "attendance:read-all",
        "attendance:mark-any",
        "attendance:correct",
      ].includes(permission),
    )
  ) {
    notFound();
  }

  return <AttendanceReportsWorkspace />;
}
