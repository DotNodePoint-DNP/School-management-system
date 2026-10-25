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

  it("fails closed when the backend role has no workspace mapping", () => {
    expect(() =>
      currentUserFromApi({
        id: "custom-1",
        fullName: "Custom User",
        email: null,
        phone: null,
        mustChangePassword: false,
        roles: ["CUSTOM"],
        permissions: ["students:read"],
      }),
    ).toThrow("This account does not have a supported workspace role.");
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
  });
});
