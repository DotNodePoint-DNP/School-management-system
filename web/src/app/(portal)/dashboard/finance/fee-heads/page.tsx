import { requireDashboardPage } from "@/core/session/server";
import FeeHeadsWorkspace from "@/modules/finance/FeeHeadsWorkspace";

export default async function Page() {
  const user = await requireDashboardPage("/dashboard/finance/fee-heads");
  return <FeeHeadsWorkspace permissions={user.permissions} />;
}
