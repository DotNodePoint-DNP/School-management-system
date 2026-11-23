import { requireDashboardPage } from "@/core/session/server";
import AdmissionIntakeWorkspace from "@/modules/admissions/AdmissionIntakeWorkspace";

export default async function AdmissionFormPage() {
  const user = await requireDashboardPage("/dashboard/Admission-Enrollment/admission-form");

  return (
    <AdmissionIntakeWorkspace
      canManageGuardians={user.permissions.includes("guardians:manage")}
      canSetAdmissionNumber={user.permissions.includes("students:set-admission-no")}
      canReadGuardians={user.permissions.includes("guardians:read")}
      canManageEnrollments={user.permissions.includes("enrollments:manage")}
    />
  );
}
