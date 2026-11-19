import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import FiscalYearsWorkspace from "@/modules/finance/FiscalYearsWorkspace";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some(
      (p) => p === "fees:read" || p === "fees:fiscal-manage",
    )
  )
    notFound();
  return <FiscalYearsWorkspace permissions={user.permissions} />;
}
