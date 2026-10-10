// src/app/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { PageHeader } from "@/modules/dashboard/components/PageHeader";
import { modulesForRole, moduleHref, type IconName } from "@/modules/dashboard/components/Navigation";
import {
  Book,
  CalendarFold,
  Settings,
  UserCog,
  Users,
  UserShield,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<IconName, LucideIcon> = {
  users: Users,
  userCog: UserCog,
  calandarFold: CalendarFold,
  book: Book,
  wallet: Wallet,
  settings: Settings,
  UserShield: UserShield,
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const modules = modulesForRole(user.role);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Select a module below or from the sidebar navigation."
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-4">
        {modules.map((module) => {
          const Icon = ICONS[module.icon];
          return (
            <Link
              key={module.slug}
              href={moduleHref(module)}
              className="group min-w-0 rounded-xl border border-line bg-panel p-5 outline-none transition-all hover:border-teal/50 hover:bg-line/20 hover:shadow-xs focus-visible:ring-2 focus-visible:ring-teal/50"
            >
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-background text-muted transition-colors group-hover:border-teal/30 group-hover:text-teal">
                    <Icon className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-ink group-hover:text-teal">
                    {module.label}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted">
                    {module.sections.length}{" "}
                    {module.sections.length === 1 ? "section" : "sections"}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}