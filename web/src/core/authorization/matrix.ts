import { permissions, rolePermissions, type Permission } from "./permissions";
import { roles, roleDetails, type Role } from "./roles";

type ParsedPermission = { key: Permission; module: string; action: string };

export function parsePermissions(): ParsedPermission[] {
  return permissions.map((p) => {
    const [module, action] = p.split(":") as [string, string];
    return { key: p, module, action };
  });
}

export function groupByModule(parsed: ParsedPermission[]) {
  return parsed.reduce<Record<string, ParsedPermission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});
}

export function isAllowed(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export { roles, roleDetails };