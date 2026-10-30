"use client";

import type { ReactNode } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import type { AttendanceStatus } from "../services/attendance";
import type { AttendanceCounts } from "../services/reports";

export const ATTENDANCE_STATUSES: {
  value: AttendanceStatus;
  label: string;
}[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "LEAVE", label: "On leave" },
];

export const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: "bg-mint text-teal",
  ABSENT: "bg-coral/10 text-coral",
  LATE: "bg-amber/20 text-ink",
  LEAVE: "bg-navy/10 text-navy dark:text-mint",
};

export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(date: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

export function AttendanceHeader({
  eyebrow = "Attendance workspace",
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-line pb-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </header>
  );
}

export function StatusBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5 text-sm text-muted">
      {children}
    </div>
  );
}

export function LoadingBox({ children }: { children: ReactNode }) {
  return (
    <StatusBox>
      <span className="inline-flex items-center gap-2">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {children}
      </span>
    </StatusBox>
  );
}

export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="rounded-lg border border-coral/30 bg-coral/5 p-5 text-sm text-ink">
      <p className="font-semibold">We couldn&apos;t load this information.</p>
      <p className="mt-1 text-muted">{errorMessage(error)}</p>
      <button
        className="mt-3 rounded-md border border-line px-3 py-2 font-medium hover:bg-background"
        onClick={retry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

export function EmptyBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-ink">
      <span className="mb-1.5 block text-xs font-semibold text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Field label={label}>
      <span className="relative block">
        <select
          className="h-10 w-full appearance-none rounded-md border border-line bg-panel px-3 pr-9 text-sm text-ink outline-none focus:border-teal focus:ring-1 focus:ring-teal"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted"
        />
      </span>
    </Field>
  );
}

export const inputClass =
  "mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60";

export function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

export function StatusPill({
  status,
}: {
  status: AttendanceStatus | null;
}) {
  const option = ATTENDANCE_STATUSES.find((item) => item.value === status);
  return status && option ? (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLORS[status]}`}
    >
      {option.label}
    </span>
  ) : (
    <span className="text-xs text-muted">Not marked</span>
  );
}

export function SummaryBreakdown({ counts }: { counts: AttendanceCounts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ATTENDANCE_STATUSES.map((status) => (
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_COLORS[status.value]}`}
          key={status.value}
        >
          {status.label} · {counts[status.value]}
        </span>
      ))}
    </div>
  );
}
