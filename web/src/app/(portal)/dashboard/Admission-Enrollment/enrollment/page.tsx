import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import EnrollmentWorkspace from "@/modules/admissions/EnrollmentWorkspace";

export default async function EnrollmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const permissions = user.permissions;
  const canManage = permissions.includes("enrollments:manage");
  const canReadStudents = permissions.some((permission) =>
    ["students:read", "students:read-all"].includes(permission),
  );
  const canReadRoster = canReadStudents || permissions.includes("enrollments:read");
  const canReadOccupancy = permissions.includes("enrollments:read");
  if (!canManage && !canReadRoster && !canReadOccupancy) notFound();

  return (
    <EnrollmentWorkspace
      canManage={canManage}
      canReadStudents={canReadStudents}
      canReadRoster={canReadRoster}
      canReadOccupancy={canReadOccupancy}
    />
  );
}
