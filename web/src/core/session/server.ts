import { redirect } from "next/navigation";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";
import {
  findModule,
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
  const workspace = findModule(user.permissions, slug);
  if (!workspace?.sections.length) redirect("/dashboard/access-denied");
  redirect(sectionHref(workspace, workspace.sections[0]));
}
