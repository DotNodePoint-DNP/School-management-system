import { requireDashboardPage } from "@/core/session/server";
import EnrollmentWorkspace from "@/modules/admissions/EnrollmentWorkspace";

export default async function EnrollmentPage() {
  const user = await requireDashboardPage("/dashboard/Admission-Enrollment/enrollment");
  const permissions = user.permissions;
  const canManage = permissions.includes("enrollments:manage");
  const canReadStudents = permissions.some((permission) =>
    ["students:read", "students:read-all"].includes(permission),
  );
  const canReadRoster = canReadStudents || permissions.includes("enrollments:read");
  const canReadOccupancy = permissions.includes("enrollments:read");

  return (
    <EnrollmentWorkspace
      canManage={canManage}
      canReadStudents={canReadStudents}
      canReadRoster={canReadRoster}
      canReadOccupancy={canReadOccupancy}
    />
  );
}
