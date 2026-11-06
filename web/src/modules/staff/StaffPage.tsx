import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import StaffWorkspace from "./StaffWorkspace";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const permissions = user.permissions;
  const canRead = permissions.includes("staff:read");
  const canManage = permissions.includes("staff:manage");
  const canCreateLogin = permissions.includes("staff:create-login");
  const canReadRoles = permissions.includes("roles:read");

  if (!canRead && !canManage) notFound();

  return (
    <StaffWorkspace
      canCreateLogin={canCreateLogin}
      canManage={canManage}
      canRead={canRead}
      canReadRoles={canReadRoles}
    />
  );
}
