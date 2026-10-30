// src/app/dashboard/settings/school-profile/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import AcademicYearManager from "@/modules/settings/components/AcademicYearManager";

export default async function SchoolProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const navModule = findModule(user.permissions, "settings");
  if (!navModule) notFound();
  return (
    <>
      <AcademicYearManager canManage={user.permissions.includes("academic-years:manage")} />
    </>
  );
}