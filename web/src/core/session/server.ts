import { redirect } from "next/navigation";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";
import {
  matchDashboardPath,
  modulesForPermissions,
  sectionHref,
} from "@/modules/dashboard/components/Navigation";
import { cookies } from "next/headers";
import { verifySession, sessionCookieName } from "./token";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(sessionCookieName)?.value);
}

export async function requireDashboardPage(path: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!hasDashboardAccess(path, user.permissions))
    redirect("/dashboard/access-denied");
  return user;
}

export async function openFirstSection(slug: string): Promise<never> {
  const user = await requireDashboardPage("/dashboard/" + slug);
  const match = matchDashboardPath(modulesForPermissions(user.permissions), "/dashboard/" + slug);
  if (!match) redirect("/dashboard/access-denied");
  redirect(sectionHref(match.module, match.section ?? match.module.sections[0]));
}
