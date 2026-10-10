import type { Role } from "./roles";

export const permissions = [
  "students:read",
  "students:write",
  "attendance:read",
  "attendance:write",
  "academics:read",
  "academics:write",
  "finance:read",
  "finance:write",
  "reports:read",
  "staff:read",
  "settings:write",
] as const;

export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  teacher_staff: [
    "students:read",
    "attendance:read",
    "attendance:write",
    "academics:read",
    "academics:write",
    "reports:read",
  ],
  school_admin: permissions,
  accountant: ["students:read", "finance:read", "finance:write", "reports:read"],
  parent: ["students:read", "attendance:read", "academics:read", "reports:read"],
};