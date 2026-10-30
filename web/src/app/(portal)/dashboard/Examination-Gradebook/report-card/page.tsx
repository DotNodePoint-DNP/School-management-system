import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import ReportCardsWorkspace from "@/modules/examination-gradebook/ReportCardsWorkspace";

export default async function ReportCardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      ["reportcards:print", "reportcards:print-signed"].includes(permission),
    )
  ) notFound();

  return (
    <ReportCardsWorkspace
      canPrintSigned={user.permissions.includes("reportcards:print-signed")}
    />
  );
}
