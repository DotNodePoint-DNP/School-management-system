import { requireDashboardPage } from "@/core/session/server";
import FamilyChildren from "@/modules/family/FamilyChildren";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    student?: string | string[];
    view?: string | string[];
  }>;
}) {
  await requireDashboardPage("/dashboard/family/children");
  const { student, view } = await searchParams;
  return (
    <FamilyChildren
      student={typeof student === "string" ? student : undefined}
      view={typeof view === "string" ? view : undefined}
    />
  );
}
