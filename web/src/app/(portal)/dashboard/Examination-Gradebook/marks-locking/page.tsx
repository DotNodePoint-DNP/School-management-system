import { requireDashboardPage } from "@/core/session/server";
import ExamWorkflowWorkspace from "@/modules/examination-gradebook/ExamWorkflowWorkspace";

export default async function MarksLockingPage() {
  const user = await requireDashboardPage("/dashboard/Examination-Gradebook/marks-locking");

  return (
    <ExamWorkflowWorkspace
      canLock={user.permissions.includes("exams:lock")}
      canPublish={user.permissions.includes("exams:publish")}
      canReviewAll={user.permissions.includes("marks:read-all")}
      canReadChanges={user.permissions.some((permission) =>
        ["marks:read-all", "marks:correct"].includes(permission),
      )}
    />
  );
}
