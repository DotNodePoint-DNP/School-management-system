import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import StaffWorkspace from "./StaffWorkspace";

export default function StaffPage() { return <StaffDirectory/>; }

export async function StaffDirectory({teachingOnly=false,initialId}:{teachingOnly?:boolean; initialId?:string}) {
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
      canReadPayroll={permissions.includes("payroll:read")}
      teachingOnly={teachingOnly}
      initialId={initialId}
      canCreateLogin={canCreateLogin}
      canLinkLogin={user.roles.includes("ADMIN") && canCreateLogin && permissions.includes("users:read")}
      canManage={canManage}
      canRead={canRead}
      canReadRoles={canReadRoles}
    />
  );
}
