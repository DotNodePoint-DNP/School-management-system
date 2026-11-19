import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import FeeHeadsWorkspace from "@/modules/finance/FeeHeadsWorkspace";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some(
      (p) => p === "fees:read" || p === "fees:structure-manage",
    )
  )
    notFound();
  return <FeeHeadsWorkspace permissions={user.permissions} />;
}
