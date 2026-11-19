import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import FamilyWorkspace from "@/modules/family/FamilyWorkspace";
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!user.permissions.includes("portal:access")) notFound();
  return <FamilyWorkspace />;
}
