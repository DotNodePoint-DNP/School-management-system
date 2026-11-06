import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import AdmissionWorkspace from "@/modules/admissions/AdmissionWorkspace";

export default async function AdmissionOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const permissions = user.permissions;
  const canCreate = permissions.includes("students:create");
  const canReadStudents = permissions.some((permission) =>
    ["students:read", "students:read-all"].includes(permission),
  );
  const canReadOccupancy = permissions.includes("enrollments:read");
  const canManageEnrollments = permissions.includes("enrollments:manage");
  if (!canCreate && !canReadStudents && !canReadOccupancy && !canManageEnrollments) {
    notFound();
  }

  return (
    <AdmissionWorkspace
      canCreate={canCreate}
      canReadStudents={canReadStudents}
      canReadOccupancy={canReadOccupancy}
      canManageEnrollments={canManageEnrollments}
    />
  );
}
