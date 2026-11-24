import { requireDashboardPage } from "@/core/session/server";
import MarksEntryWorkspace from "@/modules/examination-gradebook/MarksEntryWorkspace";

export default async function MarksEntryPage() {
  const user = await requireDashboardPage("/dashboard/Examination-Gradebook/marks-entry");

  return (
    <MarksEntryWorkspace
      permissions={user.permissions}
      canCorrect={user.permissions.includes("marks:correct")}
      canReopen={user.permissions.includes("marks:reopen")}
    />
  );
}
