import { requireDashboardPage } from "@/core/session/server";
import DocumentWorkspace from "@/modules/documents/DocumentWorkspace";

export default async function DocumentTemplatePage() {
  const user = await requireDashboardPage("/dashboard/settings/document-template");
  return <DocumentWorkspace permissions={user.permissions} />;
}
