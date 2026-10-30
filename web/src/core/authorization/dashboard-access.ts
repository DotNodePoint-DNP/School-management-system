const MODULE_PERMISSIONS: Record<string, readonly string[]> = {
  settings: ["academic-years:manage", "roles:manage", "users:assign-roles"],
  "student-info": ["students:read", "students:read-all"],
  "Admission-Enrollment": ["students:create", "enrollments:manage"],
  admissions: ["students:create", "enrollments:manage"],
  academic: [
    "classes:read",
    "subjects:read",
    "exams:read",
    "results:read",
    "results:read-all",
  ],
  academics: [
    "classes:read",
    "subjects:read",
    "exams:read",
    "results:read",
    "results:read-all",
  ],
  Attendance: [
    "attendance:read",
    "attendance:read-all",
    "attendance:mark",
    "attendance:mark-any",
    "attendance:correct",
    "attendance:calendar-manage",
  ],
  attendance: [
    "attendance:read",
    "attendance:read-all",
    "attendance:mark",
    "attendance:mark-any",
    "attendance:correct",
    "attendance:calendar-manage",
  ],
  staff: ["staff:read"],
  "Examination-Gradebook": [
    "exams:read",
    "marks:read",
    "marks:read-all",
    "results:read",
    "results:read-all",
  ],
};

export function hasDashboardAccess(
  pathname: string,
  permissions: readonly string[],
): boolean {
  if (pathname === "/dashboard") return true;

  const moduleName = (pathname.split("/")[2] ?? "")
    .replace(/%20/gi, " ")
    .trim();
  const required = MODULE_PERMISSIONS[moduleName];
  return Boolean(required?.some((permission) => permissions.includes(permission)));
}

export function permissionsForDashboardModule(
  moduleName: string,
): readonly string[] {
  return MODULE_PERMISSIONS[moduleName.trim()] ?? [];
}
