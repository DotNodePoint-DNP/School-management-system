import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { financeSections } from "@/modules/finance/sections";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const first = financeSections.find((s) =>
    s.permissions.some((p) => user.permissions.includes(p)),
  );
  if (!first) notFound();
  redirect("/dashboard/finance/" + first.slug);
}
