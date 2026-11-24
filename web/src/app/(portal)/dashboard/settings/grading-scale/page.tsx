import { requireDashboardPage } from "@/core/session/server";
import GradingScaleBuilder from "@/modules/settings/components/GradingScaleBuilder";

const GradingScale = async () => {
  const user = await requireDashboardPage("/dashboard/settings/grading-scale");

  return (
    <GradingScaleBuilder canManage={user.permissions.includes("exams:manage")} />
  );
};

export default GradingScale;