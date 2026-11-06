import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import ExamWorkflowWorkspace from "@/modules/examination-gradebook/ExamWorkflowWorkspace";

export default async function MarksLockingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      ["marks:read-all", "exams:lock", "exams:publish"].includes(permission),
    )
  ) notFound();

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
