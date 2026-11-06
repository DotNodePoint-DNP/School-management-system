import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import PromotionWorkspace from "@/modules/academics/PromotionWorkspace";

export default async function PromotionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "academics")) notFound();
  if (!user.permissions.some((permission) => ["promotion:read", "promotion:manage", "promotion:apply"].includes(permission))) notFound();
  return <PromotionWorkspace permissions={user.permissions} />;
}
