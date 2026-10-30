"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Check, ChevronRight, Users } from "lucide-react";
import { useState } from "react";
import { getPendingAttendance } from "./services/reports";
import {
  AttendanceHeader,
  EmptyBox,
  ErrorBox,
  Field,
  formatDate,
  inputClass,
  LoadingBox,
  localDate,
  SummaryCard,
} from "./components/shared";

export default function PendingAttendanceWorkspace() {
  const [date, setDate] = useState(localDate);
  const pendingQuery = useQuery({
    queryKey: ["attendance", "pending", date],
    queryFn: () => getPendingAttendance(date),
    retry: false,
  });
  const pending = pendingQuery.data;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AttendanceHeader
        title="Pending sections"
        description="Office overview of sections that have not submitted attendance for a school day."
      />
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Daily submission status</h2>
          <p className="mt-1 text-xs text-muted">
            Choose a date to review outstanding class registers.
          </p>
        </div>
        <Field label="School date · AD">
          <input
            className={inputClass}
            max={localDate()}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </Field>
      </div>
      {pendingQuery.isPending ? (
        <LoadingBox>Checking section status…</LoadingBox>
      ) : pendingQuery.isError ? (
        <ErrorBox
          error={pendingQuery.error}
          retry={() => void pendingQuery.refetch()}
        />
      ) : pending ? (
        <>
          {!pending.isSchoolDay && (
            <div className="rounded-lg border border-amber/40 bg-amber/10 p-4">
              <h2 className="text-sm font-semibold">
                No attendance expected for this date
              </h2>
              <p className="mt-1 text-xs text-muted">
                {pending.nonSchoolReason}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <SummaryCard
              label="Sections remaining"
              value={pending.sections.length}
              detail="Without a register"
            />
            <SummaryCard
              label="Students awaiting"
              value={pending.sections.reduce(
                (sum, section) => sum + section.enrolled,
                0,
              )}
              detail="Across pending sections"
            />
            <SummaryCard
              label="Date checked"
              value={formatDate(pending.date)}
              detail={pending.isSchoolDay ? "School day" : "Non-school day"}
            />
          </div>
          {pending.sections.length ? (
            <section className="overflow-hidden rounded-lg border border-line bg-panel">
              <div className="border-b border-line p-4">
                <h2 className="font-semibold">Registers to complete</h2>
                <p className="mt-1 text-xs text-muted">
                  Select a section to open its daily register.
                </p>
              </div>
              <div className="divide-y divide-line">
                {pending.sections.map((section) => (
                  <Link
                    className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-background/60"
                    href={`/dashboard/attendance/daily-attendance?yearId=${encodeURIComponent(pending.academicYearId ?? "")}&sectionId=${encodeURIComponent(section.sectionId)}&date=${encodeURIComponent(date)}`}
                    key={section.sectionId}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-mint text-teal">
                        <Users className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">
                          {section.className} · {section.sectionName}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {section.enrolled} students ·{" "}
                          {section.classTeacher
                            ? `Class teacher: ${section.classTeacher.name}`
                            : "No class teacher assigned"}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </Link>
                ))}
              </div>
            </section>
          ) : pending.isSchoolDay ? (
            <EmptyBox title="All caught up">
              Every active section has submitted attendance for this school day.
            </EmptyBox>
          ) : (
            <EmptyBox title="No registers due">
              There are no attendance registers expected on this date.
            </EmptyBox>
          )}
        </>
      ) : (
        <EmptyBox title="No pending attendance found">
          <Check className="mr-1 inline h-4 w-4" />
          No pending sections are available for this date.
        </EmptyBox>
      )}
    </main>
  );
}
