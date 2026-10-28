// src/app/dashboard/settings/school-profile/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { PageHeader } from "@/modules/dashboard/components/PageHeader";
import { findModule, moduleHref } from "@/modules/dashboard/components/Navigation";
import AcademicYearManager from "@/modules/settings/components/AcademicYearManager";

export default async function SchoolProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const navModule = findModule(user.permissions, "settings");
  if (!navModule) notFound();
  return (
    <>
      {/* <PageHeader
        title="academic Setting"
        description="Manage your academic settings"
        crumbs={[{ label: navModule.label, href: moduleHref(navModule) }]}
      /> */}
      <AcademicYearManager />
    </>
  );
}