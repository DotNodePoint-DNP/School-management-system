import { requireDashboardPage } from "@/core/session/server";
import ExamSetupWorkspace from "@/modules/examination-gradebook/ExamSetupWorkspace";

export default async function ExamSetupPage() {
  const user = await requireDashboardPage("/dashboard/Examination-Gradebook/exam-setup");

  return (
    <ExamSetupWorkspace canManage={user.permissions.includes("exams:manage")} />
  );
}