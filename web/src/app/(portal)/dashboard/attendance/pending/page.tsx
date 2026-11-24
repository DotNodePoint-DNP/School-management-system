import { requireDashboardPage } from "@/core/session/server";
import PendingAttendanceWorkspace from "@/modules/attendance/PendingAttendanceWorkspace";

export default async function PendingAttendancePage() {
  await requireDashboardPage("/dashboard/attendance/pending");

  return <PendingAttendanceWorkspace />;
}
