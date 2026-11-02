import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import AdmissionIntakeWorkspace from "@/modules/admissions/AdmissionIntakeWorkspace";

export default async function AdmissionFormPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!user.permissions.includes("students:create")) notFound();

  return (
    <AdmissionIntakeWorkspace
      canManageEnrollments={user.permissions.includes("enrollments:manage")}
    />
  );
}
