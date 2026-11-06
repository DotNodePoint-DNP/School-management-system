import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import DailyAttendanceWorkspace from "@/modules/attendance/DailyAttendanceWorkspace";

export default async function DailyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    yearId?: string;
    sectionId?: string;
    date?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const params = await searchParams;
  const canMark = user.permissions.some((permission) =>
    ["attendance:mark", "attendance:mark-any", "attendance:correct"].includes(
      permission,
    ),
  );
  const canRead = user.permissions.some((permission) =>
    [
      "attendance:read",
      "attendance:read-all",
      "attendance:mark-any",
      "attendance:correct",
    ].includes(permission),
  );
  if (!canRead && !canMark) notFound();

  return (
    <DailyAttendanceWorkspace
      initialDate={params.date}
      initialSectionId={params.sectionId}
      initialYearId={params.yearId}
      permissions={{ canMark }}
    />
  );
}
