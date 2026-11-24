import { matchDashboardPath, modulesForPermissions } from "@/modules/dashboard/components/Navigation";

export function hasDashboardAccess(pathname: string, permissions: readonly string[]) {
  const path = pathname.replace(/\/+$/, "");
  return path === "/dashboard" || path === "/dashboard/access-denied" ||
    Boolean(matchDashboardPath(modulesForPermissions(permissions), path));
}
