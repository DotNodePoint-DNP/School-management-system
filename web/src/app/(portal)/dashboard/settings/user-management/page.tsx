import { requireDashboardPage } from "@/core/session/server";
import UsersWorkspace from "@/modules/settings/components/UsersWorkspace";

export default async function UserManagementPage() {
  const user = await requireDashboardPage("/dashboard/settings/user-management");

  return <UsersWorkspace permissions={user.permissions} />;
}