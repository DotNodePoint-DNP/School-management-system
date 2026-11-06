"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  GraduationCap,
  UserPlus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listAcademicYears } from "@/modules/settings/services/academic-setup";
import { getSectionOccupancy } from "./services/enrollments";
import { listStudents } from "./services/students";
import {
  AdmissionEmpty,
  AdmissionError,
  AdmissionHeader,
  AdmissionLoading,
  AdmissionMetric,
} from "./components/shared";

type Props = {
  canCreate: boolean;
  canReadStudents: boolean;
  canReadOccupancy: boolean;
  canManageEnrollments: boolean;
};

const WORKSPACES = [
  {
    href: "/dashboard/Admission-Enrollment/admission-form",
    title: "Register a student",
    description: "Create a student record, add guardian details and optionally place them in a class.",
    icon: UserPlus,
    visible: (props: Props) => props.canCreate,
  },
  {
    href: "/dashboard/Admission-Enrollment/enrollment",
    title: "Enrollment & class rosters",
    description: "Place existing students, review class capacity and assign section roll numbers.",
    icon: GraduationCap,
    visible: (props: Props) => props.canManageEnrollments || props.canReadOccupancy,
  },
  {
    href: "/dashboard/Admission-Enrollment/students",
    title: "Student admissions",
    description: "Search and review student records returned by the school register.",
    icon: ClipboardList,
    visible: (props: Props) => props.canReadStudents,
  },
];

export default function AdmissionWorkspace(props: Props) {
  const yearsQuery = useQuery({
    queryKey: ["admissions", "years"],
    queryFn: listAcademicYears,
    enabled: props.canReadOccupancy,
  });
  const years = yearsQuery.data ?? [];
  const year = years.find((item) => item.status === "ACTIVE") ?? years[0];
  const studentsQuery = useQuery({
    queryKey: ["admissions", "student-count"],
    queryFn: () => listStudents({ page: 1, pageSize: 1, status: "ACTIVE" }),
    enabled: props.canReadStudents,
  });
  const occupancyQuery = useQuery({
    queryKey: ["admissions", "occupancy", year?.id],
    queryFn: () => getSectionOccupancy(year!.id),
    enabled: Boolean(year?.id && props.canReadOccupancy),
  });
  const occupancy = occupancyQuery.data ?? [];
  const activeSections = occupancy.filter((section) => section.isActive);
  const enrolled = activeSections.reduce((sum, section) => sum + section.enrolled, 0);
  const capacity = activeSections.reduce(
    (sum, section) => sum + (section.capacity ?? 0),
    0,
  );
  const availableSeats = occupancy.reduce(
    (sum, section) =>
      sum + (section.isActive && section.capacity !== null
        ? Math.max(section.capacity - section.enrolled, 0)
        : 0),
    0,
  );
  const workspaces = WORKSPACES.filter((item) => item.visible(props));

  if (props.canReadOccupancy && yearsQuery.isPending) return <AdmissionLoading>Loading admissions dashboard…</AdmissionLoading>;
  if (props.canReadOccupancy && yearsQuery.isError) return <AdmissionError error={yearsQuery.error} retry={() => void yearsQuery.refetch()} />;
  if (!workspaces.length) {
    return <AdmissionEmpty title="No admission tools available">Your account does not have admission or enrollment permissions.</AdmissionEmpty>;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AdmissionHeader
        eyebrow="Student services · admissions"
        title="Admission & enrollment"
        description="Register students, manage placement into academic-year sections and keep class rosters accurate."
      />
      {props.canReadOccupancy && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-muted">Current academic year</p>
          <p className="mt-1 text-sm font-semibold text-ink">{year?.name ?? "No academic year configured"}</p>
        </div>
        {year && <span className={`rounded-full px-3 py-1 text-xs font-bold ${year.status === "ACTIVE" ? "bg-mint text-teal" : "bg-amber/20 text-ink"}`}>{year.status}</span>}
      </div>}
      {(props.canReadStudents || props.canReadOccupancy) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {props.canReadStudents && (
            studentsQuery.isError ? (
              <div className="sm:col-span-2"><AdmissionError error={studentsQuery.error} retry={() => void studentsQuery.refetch()} /></div>
            ) : (
              <AdmissionMetric
                label="Active students"
                value={studentsQuery.data?.meta.total ?? (studentsQuery.isPending ? "…" : "—")}
                detail="Student records with active status"
              />
            )
          )}
          {props.canReadOccupancy && (
            occupancyQuery.isError ? (
              <div className="sm:col-span-2"><AdmissionError error={occupancyQuery.error} retry={() => void occupancyQuery.refetch()} /></div>
            ) : (
              <>
                <AdmissionMetric label="Enrolled this year" value={occupancyQuery.isPending ? "…" : enrolled} detail={`${activeSections.length} active sections`} />
                <AdmissionMetric label="Section capacity" value={occupancyQuery.isPending ? "…" : capacity || "—"} detail="Sum of configured capacities" />
                <AdmissionMetric label="Available seats" value={occupancyQuery.isPending ? "…" : availableSeats || "—"} detail="Across sections with a capacity limit" />
              </>
            )
          )}
        </div>
      )}
      {props.canReadOccupancy && !year && <AdmissionEmpty title="Set up an academic year first">Create an academic year and class sections before placing students.</AdmissionEmpty>}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaces.map(({ href, title, description, icon: Icon }) => (
          <Link
            className="group rounded-lg border border-line bg-panel p-5 transition-colors hover:border-teal/40 hover:bg-mint/20"
            href={href}
            key={href}
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint text-teal"><Icon className="h-5 w-5" /></span>
            <h2 className="mt-4 flex items-center justify-between font-semibold text-ink">{title}<ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1 group-hover:text-teal" /></h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
