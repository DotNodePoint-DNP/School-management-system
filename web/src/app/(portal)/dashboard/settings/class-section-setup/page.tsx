import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import ClassSectionManager from "@/modules/settings/components/ClassSectionManager";

const ClassSectionSetup = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "settings")) notFound();

  return (
    <ClassSectionManager canManage={user.permissions.includes("classes:manage")} />
  );
};

export default ClassSectionSetup;