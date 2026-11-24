import { requireDashboardPage } from "@/core/session/server";
import AdmissionWorkspace from "@/modules/admissions/AdmissionWorkspace";

export default async function AdmissionOverviewPage() {
  const user = await requireDashboardPage("/dashboard/Admission-Enrollment/overview");
  const permissions = user.permissions;
  const canCreate = permissions.includes("students:create");
  const canReadStudents = permissions.some((permission) =>
    ["students:read", "students:read-all"].includes(permission),
  );
  const canReadOccupancy = permissions.includes("enrollments:read");
  const canManageEnrollments = permissions.includes("enrollments:manage");

  return (
    <AdmissionWorkspace
      canCreate={canCreate}
      canReadStudents={canReadStudents}
      canReadOccupancy={canReadOccupancy}
      canManageEnrollments={canManageEnrollments}
    />
  );
}
