import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import SignatoriesWorkspace from "@/modules/settings/components/SignatoriesWorkspace";

export default async function SignatoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "settings")) notFound();
  if (!user.permissions.includes("school:manage-signatories")) notFound();
  return <SignatoriesWorkspace permissions={user.permissions} />;
}
