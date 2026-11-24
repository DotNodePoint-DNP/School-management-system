import { requireDashboardPage } from "@/core/session/server";
import PromotionWorkspace from "@/modules/academics/PromotionWorkspace";

export default async function PromotionPage() {
  const user = await requireDashboardPage("/dashboard/academics/promotion");
  return <PromotionWorkspace permissions={user.permissions} />;
}
