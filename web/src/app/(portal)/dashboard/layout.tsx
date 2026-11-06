import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { DashboardFrame } from "@/modules/dashboard/components/DashboardFrame";
import DashboardHeader from "@/components/ui/DashboardHeader";
import { QuickAccessBar } from "@/features/utils/QuickAccessBar";
import { AuthSessionBootstrap } from "@/modules/auth/components/AuthSessionBootstrap";
import { QueryProvider } from "@/providers/QueryProvider";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return (
    <QueryProvider>
      <div className="h-screen flex flex-col">
        <AuthSessionBootstrap />
        <DashboardHeader user={{ ...user, email: user.email ?? "" }} />
        <DashboardFrame user={user}>{children}</DashboardFrame>
        <QuickAccessBar />
      </div>
    </QueryProvider>
  );
}
