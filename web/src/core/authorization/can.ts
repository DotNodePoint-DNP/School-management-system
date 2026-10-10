import { rolePermissions, type Permission } from "./permissions";
import type { Role } from "./roles";

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export type { Permission } from "./permissions";
