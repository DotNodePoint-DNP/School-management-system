
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule, sectionHref } from "@/modules/dashboard/components/Navigation";

export default async function StudentInfo() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const navModule = findModule(user.role, "student-info");
  if (!navModule) notFound();

  redirect(sectionHref(navModule, navModule.sections[0]));
}