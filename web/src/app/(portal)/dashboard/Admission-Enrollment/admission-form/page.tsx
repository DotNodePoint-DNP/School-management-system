import { requireDashboardPage } from "@/core/session/server";
import AdmissionIntakeWorkspace from "@/modules/admissions/AdmissionIntakeWorkspace";

export default async function AdmissionFormPage() {
  const user = await requireDashboardPage("/dashboard/Admission-Enrollment/admission-form");

  return (
    <AdmissionIntakeWorkspace
      canManageEnrollments={user.permissions.includes("enrollments:manage")}
    />
  );
}
