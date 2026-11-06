import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import ExamSetupWorkspace from "@/modules/examination-gradebook/ExamSetupWorkspace";

export default async function ExamSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!user.permissions.includes("exams:read")) notFound();

  return (
    <ExamSetupWorkspace canManage={user.permissions.includes("exams:manage")} />
  );
}