import { requireDashboardPage } from "@/core/session/server";
import TeachingWorkspace from "@/modules/academics/TeachingWorkspace";

export default async function TeachingPage() {
  const user = await requireDashboardPage("/dashboard/academics/teaching");
  return <TeachingWorkspace permissions={user.permissions} />;
}
