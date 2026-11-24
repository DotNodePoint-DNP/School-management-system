import { requireDashboardPage } from "@/core/session/server";
import { PageHeader } from "@/modules/dashboard/components/PageHeader";
import WebsiteWorkspace from "@/modules/website/admin/WebsiteWorkspace";
export default async function Page() {
  await requireDashboardPage("/dashboard/website");
  return (
    <>
      <PageHeader
        title="Website CMS"
        description="Manage public school content and respond to submissions."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }]}
      />
      <WebsiteWorkspace />
    </>
  );
}
