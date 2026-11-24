import { requireDashboardPage } from "@/core/session/server";
import AcademicYearManager from "@/modules/settings/components/AcademicYearManager";

export default async function AcademicYearPage() {
  const user = await requireDashboardPage("/dashboard/settings/academic-year");

  return (
    <>
      <AcademicYearManager
        canManage={user.permissions.includes("academic-years:manage")}
        canAdjustDates={user.permissions.includes("academic-years:adjust-dates")}
        canAcknowledgeUnplaced={user.permissions.includes("promotion:apply")}
      />
    </>
  );
}
