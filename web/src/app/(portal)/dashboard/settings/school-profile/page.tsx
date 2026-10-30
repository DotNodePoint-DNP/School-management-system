import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { PageHeader } from "@/modules/dashboard/components/PageHeader";
import { findModule, moduleHref } from "@/modules/dashboard/components/Navigation";
import SchoolProfileForm from "@/modules/settings/components/SchoolProfileForm";

export default async function SchoolProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const navModule = findModule(user.permissions, "settings");
  if (!navModule) notFound();

  return (
    <>
      <PageHeader
        title="School profile"
        description="Basic details shown on invoices, reports and parent communications."
        crumbs={[{ label: navModule.label, href: moduleHref(navModule) }]}
      />
      <main className="p-2   min-h-screen">
        <SchoolProfileForm canManage={user.permissions.includes("school:manage")} />
      </main>
    </>
  );
}