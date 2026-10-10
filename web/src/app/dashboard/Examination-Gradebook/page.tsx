// src/app/dashboard/settings/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule, sectionHref } from "@/modules/dashboard/components/Navigation";

export default async function SettingsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const navModule = findModule(user.role, "Examination-Gradebook");
  if (!navModule) notFound();

  redirect(sectionHref(navModule, navModule.sections[0]));
}