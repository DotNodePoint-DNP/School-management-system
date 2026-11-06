import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import UsersWorkspace from "@/modules/settings/components/UsersWorkspace";

export default async function UserManagementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "settings")) notFound();

  return <UsersWorkspace permissions={user.permissions} />;
}