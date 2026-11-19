import { modulesForPermissions } from "@/modules/dashboard/components/Navigation";
import { describe, expect, it } from "vitest";
import { currentUserFromApi } from "@/core/authorization/roles";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";

describe("backend role and permission mapping", () => {
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
