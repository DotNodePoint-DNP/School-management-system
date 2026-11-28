import { requireDashboardPage } from "@/core/session/server";
import DocumentWorkspace from "@/modules/documents/DocumentWorkspace";
export default async function Page(){
 const user=await requireDashboardPage("/dashboard/documents/register");
 return <DocumentWorkspace permissions={user.permissions} office="register"/>;
}
