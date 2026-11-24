import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { financeSections } from "@/modules/finance/sections";
import FinanceWorkspace from "@/modules/finance/FinanceWorkspace";

export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const { section } = await params;
  const feature = financeSections.find(
    (s) =>
      s.slug === section &&
      s.permissions.some((p) => user.permissions.includes(p)),
  );
  if (!feature) notFound();
  return (
    <FinanceWorkspace
      section={section}
      title={feature.label}
      permissions={user.permissions}
    />
  );
}
