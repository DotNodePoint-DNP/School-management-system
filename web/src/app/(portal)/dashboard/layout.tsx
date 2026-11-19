import { roleLabel } from "@/core/authorization/roles";
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
    <QueryProvider key={user.id}>
      <div className="flex h-dvh min-w-0 flex-col">
        <AuthSessionBootstrap user={user} />
        <DashboardHeader user={{ displayName: user.displayName, roleLabel: roleLabel(user), email: user.email ?? "" }} />
        <DashboardFrame user={user}>{children}</DashboardFrame>
        <QuickAccessBar permissions={user.permissions}/>
      </div>
    </QueryProvider>
  );
}
