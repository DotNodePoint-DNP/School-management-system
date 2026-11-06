import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import ExamScheduleWorkspace from "@/modules/examination-gradebook/ExamScheduleWorkspace";

export default async function ExamSchedulePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!user.permissions.includes("exams:read")) notFound();

  return <ExamScheduleWorkspace />;
}
