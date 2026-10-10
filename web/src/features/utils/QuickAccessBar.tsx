"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  UserPlus,
  CalendarCheck,
  Wallet,
  Bell,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

type QuickAccessItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

const quickAccessItems: QuickAccessItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Students",
    href: "/students",
    icon: Users,
  },
  {
    label: "Admission",
    href: "/admission",
    icon: UserPlus,
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: CalendarCheck,
  },
  {
    label: "Finance",
    href: "/finance",
    icon: Wallet,
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    badge: 3,
  },
];

export function QuickAccessBar() {
  const pathname = usePathname();

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <nav
        className="
          flex items-center gap-1 rounded-2xl border
          bg-background/95 p-2 shadow-lg backdrop-blur
        "
        aria-label="Quick access"
      >
        {quickAccessItems.map((item) => {
          const Icon = item.icon;

          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`
                group relative flex h-11 w-11 items-center justify-center
                rounded-xl transition-colors
                ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }
              `}
            >
              <Icon className="h-5 w-5" />

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className="
                    absolute -right-0.5 -top-0.5 flex h-4 min-w-4
                    items-center justify-center rounded-full
                    bg-destructive px-1 text-[10px] font-medium
                    text-destructive-foreground
                  "
                >
                  {item.badge}
                </span>
              )}

              {/* Tooltip */}
              <span
                className="
                  pointer-events-none absolute bottom-full left-1/2 mb-2
                  -translate-x-1/2 translate-y-1 opacity-0
                  whitespace-nowrap rounded-md bg-foreground
                  px-2 py-1 text-xs text-background
                  transition-all duration-150
                  group-hover:translate-y-0 group-hover:opacity-100
                "
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          aria-label="More"
          className="
            group relative flex h-11 w-11 items-center justify-center
            rounded-xl text-muted-foreground
            hover:bg-muted hover:text-foreground
          "
        >
          <MoreHorizontal className="h-5 w-5" />

          <span
            className="
              pointer-events-none absolute bottom-full left-1/2 mb-2
              -translate-x-1/2 translate-y-1 opacity-0
              whitespace-nowrap rounded-md bg-foreground
              px-2 py-1 text-xs text-background
              transition-all duration-150
              group-hover:translate-y-0 group-hover:opacity-100
            "
          >
            More
          </span>
        </button>
      </nav>
    </div>
  );
}