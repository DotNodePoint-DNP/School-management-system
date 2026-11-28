import { matchDashboardPath, modulesForPermissions } from "@/modules/dashboard/components/Navigation";
import { describe, expect, it } from "vitest";
import { currentUserFromApi } from "@/core/authorization/roles";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";

describe("backend role and permission mapping", () => {
  it("keeps visible modules in the agreed sidebar order", () => {
    const grants = ["audit-logs:read", "portal:access", "fees:read", "results:read",
      "attendance:read", "subjects:read", "staff:read", "guardians:read"];
    expect(modulesForPermissions(grants).map(module => module.label)).toEqual([
      "Students & Guardians", "Staff", "Academics", "Attendance", "Exams & Results",
      "Finance", "Family Portal", "Administration",
    ]);
    expect(modulesForPermissions(["portal:access", "staff:read"]).map(module => module.label))
      .toEqual(["Staff", "Family Portal"]);
  });

  it("lets issuing staff create and reprint documents while limiting template design to settings staff",()=>{
    const rights=["documents:issue"];
    expect(hasDashboardAccess("/dashboard/documents/create",rights)).toBe(true);
    expect(hasDashboardAccess("/dashboard/documents/register",rights)).toBe(true);
    expect(hasDashboardAccess("/dashboard/settings/document-template",rights)).toBe(false);
    expect(hasDashboardAccess("/dashboard/documents/create",["documents:design"])).toBe(false);
  });

  it("derives the workspace from backend roles, not user-selected input", () => {
    const user = currentUserFromApi({
      id: "admin-1",
      fullName: "Admin User",
      email: "admin@example.test",
      phone: null,
      mustChangePassword: false,
      roles: ["TEACHER", "ADMIN"],
      permissions: ["roles:manage"],
    });

    expect(user.role).toBe("school_admin");
    expect(user.permissions).toEqual(["roles:manage"]);
    expect(user.displayName).toBe("Admin User");
  });

  it("opens a custom registrar workspace using its effective permissions", () => {
    const user = currentUserFromApi({
      id: "custom-1",
      fullName: "Custom User",
      email: null,
      phone: null,
      mustChangePassword: false,
      roles: ["REGISTRAR"],
      permissions: ["students:read"],
    });
    expect(user.role).toBe("custom");
    expect(
      hasDashboardAccess(
        "/dashboard/student-info/student-directory/123",
        user.permissions,
      ),
    ).toBe(true);
    expect(hasDashboardAccess("/dashboard/settings", user.permissions)).toBe(
      false,
    );
  });

  it.each([
    ["audit-logs:read", "settings", "audit-log"],
    ["marks:enter", "Examination-Gradebook", "marks-entry"],
  ])("exposes just the granted section for %s", (grant, workspace, section) => {
    const modules = modulesForPermissions([grant]);
    expect(modules.map((item) => item.slug)).toEqual([workspace]);
    expect(modules[0].sections.map((item) => item.slug)).toEqual([section]);
    const path = "/dashboard/" + workspace + "/" + section;
    expect(hasDashboardAccess(path, [grant])).toBe(true);
    expect(hasDashboardAccess(path, [])).toBe(false);
    expect(hasDashboardAccess(path + "/unknown", [grant])).toBe(false);
  });

  it("opens Children first and guards each family section", () => {
    const grants = ["portal:access"];
    const family = modulesForPermissions(grants).find(item => item.slug === "family");
    expect(family?.sections.map(section => section.slug)).toEqual(["children", "balance", "account"]);
    for (const path of ["family", "family/children", "family/balance", "family/account"]) {
      expect(hasDashboardAccess("/dashboard/" + path, grants)).toBe(true);
      expect(hasDashboardAccess("/dashboard/" + path, [])).toBe(false);
    }
  });

  it.each([
    ["guardians:read", "/dashboard/student-info/parent-directory/123", "Students & Guardians"],
    ["students:read", "/dashboard/Admission-Enrollment/students", "Students & Guardians"],
    ["staff:read", "/dashboard/student-info/teacher-directory/123", "Staff"],
    ["academic-years:read", "/dashboard/settings/academic-year", "Academics"],
    ["exams:read", "/dashboard/settings/grading-scale", "Exams & Results"],
    ["audit-logs:read", "/dashboard/settings/audit-log", "Administration"],
  ])("resolves %s to its sidebar group and protects deep links", (grant, path, group) => {
    expect(matchDashboardPath(modulesForPermissions([grant]), path)?.module.label).toBe(group);
    expect(hasDashboardAccess(path, [grant])).toBe(true);
    expect(hasDashboardAccess(path, ["portal:access"])).toBe(false);
    expect(hasDashboardAccess(path + "/extra", [grant])).toBe(false);
  });

  it("keeps legacy module bookmarks usable with only a moved section grant", () => {
    const grants = modulesForPermissions(["classes:read"]);
    expect(grants.map(m => m.label)).toEqual(["Academics"]);
    expect(grants[0].sections.map(s => s.slug)).toEqual(["class-section-setup"]);
    expect(matchDashboardPath(grants, "/dashboard/settings")?.section?.slug).toBe("class-section-setup");
    expect(hasDashboardAccess("/dashboard/settings/school-profile", ["classes:read"])).toBe(false);
    expect(hasDashboardAccess("/dashboard/student-info", ["staff:read"])).toBe(true);
  });

  it("uses backend permissions for dashboard route access", () => {
    expect(
      hasDashboardAccess("/dashboard/Examination-Gradebook/results", [
        "results:read",
      ]),
    ).toBe(true);
    expect(
      hasDashboardAccess("/dashboard/settings/user-management", [
        "students:read-all",
      ]),
    ).toBe(false);
    expect(
      hasDashboardAccess("/dashboard/staff/directory", ["staff:manage"]),
    ).toBe(true);
    expect(
      hasDashboardAccess("/dashboard/staff/directory", ["staff:create-login"]),
    ).toBe(false);
  });
});
