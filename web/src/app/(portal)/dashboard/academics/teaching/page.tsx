import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import TeachingWorkspace from "@/modules/academics/TeachingWorkspace";

export default async function TeachingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "academics")) notFound();
  if (!user.permissions.includes("teaching:read")) notFound();
  return <TeachingWorkspace permissions={user.permissions} />;
}
