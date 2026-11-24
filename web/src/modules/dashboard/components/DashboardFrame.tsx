// src/modules/dashboard/components/DashboardFrame.tsx
import type { ReactNode } from "react";
import { roleLabel, type CurrentUser } from "@/core/authorization/roles";

import { DashboardShell } from "@/modules/dashboard/components/DashboardShell";
import { modulesForPermissions } from "./Navigation";

export function DashboardFrame({
  children,
  user,
}: {
  children: ReactNode;
  user: CurrentUser;
}) {
  return (
    <DashboardShell
      modules={modulesForPermissions(user.permissions)}
      user={{
        displayName: user.displayName,
        roleLabel: roleLabel(user),
      }}
    >
      {children}
    </DashboardShell>
  );
}
