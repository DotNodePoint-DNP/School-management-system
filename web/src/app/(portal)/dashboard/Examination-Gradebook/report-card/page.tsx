import { requireDashboardPage } from "@/core/session/server";
import ReportCardsWorkspace from "@/modules/examination-gradebook/ReportCardsWorkspace";

export default async function ReportCardPage() {
  const user = await requireDashboardPage("/dashboard/Examination-Gradebook/report-card");

  return (
    <ReportCardsWorkspace
      canPrintSigned={user.permissions.includes("reportcards:print-signed")}
    />
  );
}
