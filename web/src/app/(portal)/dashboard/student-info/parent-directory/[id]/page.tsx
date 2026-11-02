import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import GuardiansWorkspace from "@/modules/students/GuardiansWorkspace";

export default async function GuardianDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!user.permissions.includes("guardians:read")) notFound();
  const { id } = await params;
  return <GuardiansWorkspace permissions={user.permissions} initialSelectedId={id} />;
}
