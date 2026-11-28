import { requireDashboardPage } from "@/core/session/server";
import DocumentWorkspace from "@/modules/documents/DocumentWorkspace";
export default async function Page(){
 const user=await requireDashboardPage("/dashboard/documents/create");
 return <DocumentWorkspace permissions={user.permissions} office="create"/>;
}
