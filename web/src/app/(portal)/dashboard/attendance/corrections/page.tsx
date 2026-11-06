import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import AttendanceCorrectionsWorkspace from "@/modules/attendance/AttendanceCorrectionsWorkspace";

export default async function AttendanceCorrectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      ["attendance:read-all", "attendance:correct"].includes(permission),
    )
  ) {
    notFound();
  }

  return <AttendanceCorrectionsWorkspace />;
}
