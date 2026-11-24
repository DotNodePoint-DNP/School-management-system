import { requireDashboardPage } from "@/core/session/server";
import ClassSectionManager from "@/modules/settings/components/ClassSectionManager";

const ClassSectionSetup = async () => {
  const user = await requireDashboardPage("/dashboard/settings/class-section-setup");

  return (
    <ClassSectionManager canManage={user.permissions.includes("classes:manage")} />
  );
};

export default ClassSectionSetup;