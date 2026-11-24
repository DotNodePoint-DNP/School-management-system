import { requireDashboardPage } from "@/core/session/server";
import ExamScheduleWorkspace from "@/modules/examination-gradebook/ExamScheduleWorkspace";

export default async function ExamSchedulePage() {
  await requireDashboardPage("/dashboard/Examination-Gradebook/exam-schedule");

  return <ExamScheduleWorkspace />;
}
