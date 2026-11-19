"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, CalendarCheck, Wallet, BookOpen } from "lucide-react";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";

const shortcuts = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/Admission-Enrollment", label: "Admissions", icon: Users },
  { href: "/dashboard/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/dashboard/finance", label: "Finance", icon: Wallet },
  { href: "/dashboard/family", label: "Family", icon: BookOpen },
];

export function QuickAccessBar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Quick access"
      className="flex shrink-0 justify-center gap-1 border-t border-line bg-panel px-2 pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      {shortcuts
        .filter((s) => hasDashboardAccess(s.href, permissions))
        .map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href + "/"));
          return (
            <Link
              aria-current={active ? "page" : undefined}
              key={href}
              href={href}
              className={
                "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-md px-1 text-[10px] " +
                (active ? "bg-mint font-semibold text-ink" : "text-muted")
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}
