import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import GradingScaleBuilder from "@/modules/settings/components/GradingScaleBuilder";

const GradingScale = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "settings")) notFound();
  if (!user.permissions.includes("exams:read")) notFound();

  return (
    <GradingScaleBuilder canManage={user.permissions.includes("exams:manage")} />
  );
};

export default GradingScale;