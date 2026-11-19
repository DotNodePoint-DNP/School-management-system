import { requireDashboardPage } from "@/core/session/server";
import { ExamReleases } from "@/modules/examination-gradebook/ExamReleases";
export default async function Page() {
  const user = await requireDashboardPage("/dashboard/Examination-Gradebook/releases");
  return (
    <ExamReleases
      canListYears={user.permissions.includes("academic-years:read")}
    />
  );
}
