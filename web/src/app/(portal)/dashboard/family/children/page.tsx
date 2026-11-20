import { requireDashboardPage } from "@/core/session/server";
import FamilyChildren from "@/modules/family/FamilyChildren";

export default async function Page() {
  await requireDashboardPage("/dashboard/family/children");
  return <FamilyChildren />;
}
