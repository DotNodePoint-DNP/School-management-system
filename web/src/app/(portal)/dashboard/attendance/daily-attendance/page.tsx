import { requireDashboardPage } from "@/core/session/server";
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
  const user = await requireDashboardPage("/dashboard/attendance/daily-attendance");
  const params = await searchParams;
  const canMark = user.permissions.some((permission) =>
    ["attendance:mark", "attendance:mark-any", "attendance:correct"].includes(
      permission,
    ),
  );

  return (
    <DailyAttendanceWorkspace
      initialDate={params.date}
      initialSectionId={params.sectionId}
      initialYearId={params.yearId}
      permissions={{ canMark }}
    />
  );
}
