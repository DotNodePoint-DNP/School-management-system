// src/modules/dashboard/components/DashboardShell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Book,
  ChevronLeft,
  Menu,
  Settings,
  Users,
  Wallet,
  X,
  UserCog,
  CalendarFold,
  UserShield,
  type LucideIcon,
} from "lucide-react";
import {
  DASHBOARD_HREF,
  moduleHref,
  sectionHref,
  type IconName,
  type NavModule,
} from "@/modules/dashboard/components/Navigation";

const ICONS: Record<IconName, LucideIcon> = {
  users: Users,
  userCog: UserCog,
  calandarFold: CalendarFold,
  book: Book,
  wallet: Wallet,
  settings: Settings,
  UserShield: UserShield,
};

type ShellUser = { displayName: string; roleLabel: string };

/* Replaced hardcoded hover/focus backgrounds with theme-aware tokens */
const row =
  "flex h-12 w-full min-w-0 items-center gap-3 px-5 text-[15px] outline-none transition-colors " +
  "focus-visible:bg-line focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal/50";

export function DashboardShell({
  modules,
  user,
  header,
  children,
}: {
  modules: NavModule[];
  user: ShellUser;
  header?: ReactNode; // Slot for AppHeader / DashboardHeader
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Source of truth URL parsing: /dashboard/<module>/<section>
  const moduleSlug = pathname.split("/").filter(Boolean)[1];
  const activeModule = modules.find((m) => m.slug === moduleSlug);

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const sidebar = (
    <SidebarContent
      modules={modules}
      activeModule={activeModule}
      pathname={pathname}
      user={user}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-ink transition-colors duration-200">
      {/* Desktop sidebar: Theme-aware panel background and line border */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel md:flex lg:w-72">
        {sidebar}
      </aside>

      {/* Mobile drawer with backdrop */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-line bg-panel shadow-xl">
            <button
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-md p-2 text-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-co">
        {/* Render header if provided; show mobile menu button when collapsed */}
        <div className="sticky top-0 z-30 flex items-center border-b border-line bg-panel/90 backdrop-blur-md">
          <div className="flex h-16 items-center px-3 md:hidden">
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-md p-2 text-muted hover:bg-line hover:text-ink"
            >
              <Menu className="size-5" />
            </button>
          </div>
          <div className="flex-1">{header}</div>
        </div>

        <main className="flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  modules,
  activeModule,
  pathname,
  user,
}: {
  modules: NavModule[];
  activeModule?: NavModule;
  pathname: string;
  user: ShellUser;
}) {
  return (
    <>
      {/* Header section in sidebar */}
      <div className="flex h-16 shrink-0 items-center border-b border-line px-2">
        {activeModule ? (
          <Link
            href={DASHBOARD_HREF}
            aria-label={`Back to dashboard from ${activeModule.label}`}
            className={`${row} font-semibold text-ink hover:text-teal`}
          >
            <ChevronLeft className="size-4 shrink-0 text-muted" />
            <span className="truncate">{activeModule.label}</span>
          </Link>
        ) : (
          <Link href={DASHBOARD_HREF} className={`${row} font-semibold text-ink`}>
            <span className="truncate">Dashboard</span>
          </Link>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        aria-label={activeModule ? `${activeModule.label} sections` : "Modules"}
        className="flex-1 overflow-y-auto py-2"
      >
        {activeModule
          ? activeModule.sections.map((section) => {
              const href = sectionHref(activeModule, section);
              const active = pathname === href;
              const Icon = ICONS[section.icon ?? activeModule.icon];
              return (
                <Link
                  key={section.slug}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`${row} ${
                    active
                      ? "bg-mint/80 font-bold text-navy dark:bg-mint/20 dark:text-teal"
                      : "text-muted hover:bg-line/50 hover:text-ink"
                  }`}
                >
                  <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{section.label}</span>
                </Link>
              );
            })
          : modules.map((module) => {
              const Icon = ICONS[module.icon];
              return (
                <Link
                  key={module.slug}
                  href={moduleHref(module)}
                  className={`${row} text-muted hover:bg-line/50 hover:text-ink`}
                >
                  <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{module.label}</span>
                </Link>
              );
            })}
      </nav>

      {/* Footer User Profile Summary in Sidebar */}
      <div className="flex items-center gap-3 border-t border-line px-5 py-3.5 bg-panel">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-xs font-bold text-navy dark:bg-mint/20 dark:text-teal">
          {user.displayName.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink">
            {user.displayName}
          </p>
          <p className="truncate text-xs font-medium text-muted">{user.roleLabel}</p>
        </div>
      </div>
    </>
  );
}