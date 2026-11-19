import { requireDashboardPage } from "@/core/session/server";
import FiscalYearsWorkspace from "@/modules/finance/FiscalYearsWorkspace";

export default async function Page() {
  const user = await requireDashboardPage("/dashboard/finance/fiscal-years");
  return <FiscalYearsWorkspace permissions={user.permissions} />;
}
