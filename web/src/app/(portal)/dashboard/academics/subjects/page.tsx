import { requireDashboardPage } from "@/core/session/server";
import SubjectsWorkspace from "@/modules/academics/SubjectsWorkspace";

export default async function SubjectsPage() {
  const user = await requireDashboardPage("/dashboard/academics/subjects");
  return <SubjectsWorkspace permissions={user.permissions} />;
}
