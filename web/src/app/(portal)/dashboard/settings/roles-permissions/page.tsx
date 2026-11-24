import { requireDashboardPage } from "@/core/session/server";
import { RolesPermissionMatrix } from "@/modules/settings/components/roles-permissions/RolesPermissionMatrix";

export default async function RolePermissionsPage() {
  const user = await requireDashboardPage("/dashboard/settings/roles-permissions");
  return <RolesPermissionMatrix canManage={user.permissions.includes("roles:manage")} />;
}
