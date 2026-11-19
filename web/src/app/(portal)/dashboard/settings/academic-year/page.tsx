import { notFound } from "next/navigation";
// src/app/dashboard/settings/school-profile/page.tsx
import { requireDashboardPage } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import AcademicYearManager from "@/modules/settings/components/AcademicYearManager";

export default async function SchoolProfilePage() {
  const user = await requireDashboardPage("/dashboard/settings/academic-year");

  const navModule = findModule(user.permissions, "settings");
  if (!navModule) notFound();
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