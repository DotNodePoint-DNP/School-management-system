import { rolePermissions, type Permission } from "./permissions";
import type { Role } from "./roles";

export interface PortalNavigationItem {
  label: string;
  href: string;
  permission: Permission;
}

export const portalNavigation: readonly PortalNavigationItem[] = [
  { label: "Overview", href: "/dashboard", permission: "reports:read" },
  { label: "Admissions", href: "/dashboard/admissions", permission: "students:write" },
  { label: "Students", href: "/dashboard/students", permission: "students:read" },
  { label: "Academics", href: "/dashboard/academics", permission: "academics:read" },
  { label: "Attendance", href: "/dashboard/attendance", permission: "attendance:read" },
  { label: "Finance", href: "/dashboard/finance", permission: "finance:read" },
  { label: "Staff", href: "/dashboard/staff", permission: "staff:read" },
  { label: "School & Settings", href: "/dashboard/setting-setup", permission: "settings:write" },
];

export function navigationForRole(role: Role): PortalNavigationItem[] {
  return portalNavigation.filter((item) =>
    rolePermissions[role].includes(item.permission),
  );
}

export function permissionForDashboardPath(pathname: string): Permission | null {
  const match = portalNavigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.permission ?? null;
}
