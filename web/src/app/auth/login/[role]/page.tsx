import { notFound } from "next/navigation";
import { isRole, roles, type Role } from "@/core/authorization/roles";
import { RoleLogin } from "@/modules/auth/components/RoleLogin";

export function generateStaticParams() {
  return roles.map((role) => ({ role }));
}

export default async function AuthLoginPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!isRole(role)) notFound();

  return <RoleLogin role={role as Role} />;
}
