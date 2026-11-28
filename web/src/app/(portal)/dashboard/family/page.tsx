import { requireDashboardPage } from "@/core/session/server";
import { FamilyOverview } from "@/modules/family/FamilyOverview";
export default async function FamilyPage() {
  await requireDashboardPage("/dashboard/family");
  return <FamilyOverview />;
}
