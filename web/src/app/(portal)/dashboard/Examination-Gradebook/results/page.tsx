import { requireDashboardPage } from "@/core/session/server";
import ResultsWorkspace from "@/modules/examination-gradebook/ResultsWorkspace";

export default async function ResultsPage() {
  const user = await requireDashboardPage("/dashboard/Examination-Gradebook/results");
  const canPreview = user.permissions.includes("results:preview");
  const canReadResults = user.permissions.some((permission) =>
    ["results:read", "results:read-all"].includes(permission),
  );
  const canManagePolicy = user.permissions.includes("exams:manage");
  const canReadRemarks = user.permissions.some((permission) =>
    ["results:read-all", "remarks:enter-any", "remarks:enter"].includes(permission),
  );
  const canEnterRemarks = user.permissions.some((permission) =>
    ["remarks:enter", "remarks:enter-any"].includes(permission),
  );

  return (
    <ResultsWorkspace
      canEnterRemarks={canEnterRemarks}
      canManagePolicy={canManagePolicy}
      canPreview={canPreview}
      canReadAll={user.permissions.includes("results:read-all")}
      canReadRemarks={canReadRemarks}
      canReadResults={canReadResults}
    />
  );
}
