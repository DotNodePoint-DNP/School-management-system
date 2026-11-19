import { requireDashboardPage } from "@/core/session/server";
import FamilyWorkspace from "@/modules/family/FamilyWorkspace";

export default async function Page() {
  await requireDashboardPage("/dashboard/family");
  return <FamilyWorkspace />;
}
