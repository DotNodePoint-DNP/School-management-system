import { requireDashboardPage } from "@/core/session/server";
import { FamilyRecordSection } from "@/modules/family/FamilyRecordSection";

export default async function Page() {
  await requireDashboardPage("/dashboard/family/balance");
  return <FamilyRecordSection section="balance" />;
}
