import { findModule } from "@/modules/dashboard/components/Navigation";

export function hasDashboardAccess(
  pathname: string,
  permissions: readonly string[],
) {
  const [root, slug, section, ...detail] = pathname.split("/").filter(Boolean);
  if (root !== "dashboard") return false;
  if (!slug || pathname === "/dashboard/access-denied") return true;
  if (pathname === "/dashboard/settings/fee-structure")
    return hasDashboardAccess("/dashboard/finance/fee-heads", permissions);
  if (pathname === "/dashboard/student-info/admissions")
    return hasDashboardAccess(
      "/dashboard/Admission-Enrollment/overview",
      permissions,
    );
  const workspace = findModule(permissions, slug);
  if (!workspace) return false;
  if (!section) return true;
  if (
    detail.length &&
    !(
      detail.length === 1 &&
      slug === "student-info" &&
      ["student-directory", "teacher-directory", "parent-directory"].includes(
        section,
      )
    )
  )
    return false;
  const target =
    slug === "Examination-Gradebook" && section === "grade-book"
      ? "results"
      : section;
  return workspace.sections.some((item) => item.slug === target);
}
