import { hasDashboardAccess } from "@/core/authorization/dashboard-access";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  FileClock,
  ListChecks,
  Users,
} from "lucide-react";
import { AttendanceHeader } from "./components/shared";


const WORKSPACES = [
  {
    href: "/dashboard/attendance/daily-attendance",
    title: "Daily attendance",
    description:
      "Open a class register, record student status and submit or correct attendance.",
    icon: ListChecks,
  },
  {
    href: "/dashboard/attendance/reports",
    title: "Attendance reports",
    description:
      "Explore section totals, individual histories and attendance trends.",
    icon: Users,
  },
  {
    href: "/dashboard/attendance/pending",
    title: "Pending sections",
    description:
      "See which active sections still need to submit their daily register.",
    icon: FileClock,
  },
  {
    href: "/dashboard/attendance/corrections",
    title: "Correction history",
    description:
      "Review recorded changes, reasons and the user who made each correction.",
    icon: FileClock,
  },
  {
    href: "/dashboard/attendance/calendar",
    title: "School calendar",
    description:
      "Manage holidays, weekly off days, working days and the edit window.",
    icon: CalendarDays,
  },
];

export default function AttendanceWorkspace({ permissions }: { permissions: string[] }) {
  const workspaces = WORKSPACES.filter((item) => hasDashboardAccess(item.href, permissions));
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AttendanceHeader
        eyebrow="Student services · attendance"
        title="Attendance management"
        description="Take accurate daily registers, follow attendance trends and keep the school calendar in sync."
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaces.map(({ href, title, description, icon: Icon }) => (
          <Link
            className="group rounded-lg border border-line bg-panel p-5 transition-colors hover:border-teal/40 hover:bg-mint/20"
            href={href}
            key={href}
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint text-teal">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 flex items-center justify-between font-semibold">
              {title}
              <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1 group-hover:text-teal" />
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
