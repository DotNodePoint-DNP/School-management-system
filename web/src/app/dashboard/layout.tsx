import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { DashboardFrame } from "@/modules/dashboard/components/DashboardFrame";
import DashboardHeader from "@/components/ui/DashboardHeader";
import { QuickAccessBar } from "@/features/utils/QuickAccessBar";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return (
    <div className="h-screen flex flex-col">
      <DashboardHeader user={user} />
      <DashboardFrame user={user}>{children}</DashboardFrame>
      <QuickAccessBar/>
    </div>
  );
}
