import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { ExamReleases } from "@/modules/examination-gradebook/ExamReleases";
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!user.permissions.includes("exams:release")) notFound();
  return (
    <ExamReleases
      canListYears={user.permissions.includes("academic-years:read")}
    />
  );
}
