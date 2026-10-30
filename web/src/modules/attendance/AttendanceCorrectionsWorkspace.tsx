"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listSchoolClasses } from "@/modules/settings/services/academic-setup";
import { useQuery } from "@tanstack/react-query";
import {
  getAttendanceChanges,
  type AttendanceChange,
} from "./services/reports";
import {
  AttendanceHeader,
  EmptyBox,
  ErrorBox,
  Field,
  formatDate,
  inputClass,
  LoadingBox,
  localDate,
  SelectField,
  StatusPill,
} from "./components/shared";

export default function AttendanceCorrectionsWorkspace() {
  const [sectionSelection, setSectionSelection] = useState("all");
  const [date, setDate] = useState(localDate);
  const classesQuery = useQuery({
    queryKey: ["attendance", "classes"],
    queryFn: listSchoolClasses,
  });
  const sections = useMemo(
    () =>
      (classesQuery.data ?? []).flatMap((schoolClass) =>
        schoolClass.sections
          .filter((section) => section.isActive)
          .map((section) => ({
            ...section,
            className: schoolClass.name,
          })),
      ),
    [classesQuery.data],
  );
  const changesQuery = useInfiniteQuery({
    queryKey: ["attendance", "changes", sectionSelection, date],
    queryFn: ({ pageParam }) =>
      getAttendanceChanges({
        sectionId: sectionSelection === "all" ? undefined : sectionSelection,
        date,
        limit: 30,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    retry: false,
  });
  const changes = changesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (classesQuery.isPending)
    return <LoadingBox>Loading section filters…</LoadingBox>;
  if (classesQuery.isError)
    return (
      <ErrorBox
        error={classesQuery.error}
        retry={() => void classesQuery.refetch()}
      />
    );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AttendanceHeader
        title="Attendance corrections"
        description="Review the audit trail for changes made to saved attendance records."
      />
      <div className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-2">
        <SelectField
          label="Filter section"
          onChange={setSectionSelection}
          value={sectionSelection}
        >
          <option value="all">All sections</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.className} · {section.name}
            </option>
          ))}
        </SelectField>
        <Field label="Attendance date · AD">
          <input
            className={inputClass}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </Field>
      </div>
      {changesQuery.isPending ? (
        <LoadingBox>Loading correction history…</LoadingBox>
      ) : changesQuery.isError ? (
        <ErrorBox
          error={changesQuery.error}
          retry={() => void changesQuery.refetch()}
        />
      ) : changes.length ? (
        <section className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-background text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Updated by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {changes.map((change: AttendanceChange) => (
                  <tr key={change.id}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold">
                        {change.studentName ?? "Unknown student"}
                      </p>
                      <p className="text-xs text-muted">
                        {change.admissionNo ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDate(change.date)}
                      {change.dateBs ? (
                        <span className="mt-1 block">BS {change.dateBs}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">
                        {change.fromStatus ?? "—"}
                      </span>
                      <span className="mx-1.5">→</span>
                      <StatusPill status={change.toStatus} />
                      <span
                        className={`ml-2 text-[10px] ${change.withinWindow ? "text-teal" : "text-coral"}`}
                      >
                        {change.withinWindow ? "Within window" : "Correction"}
                      </span>
                    </td>
                    <td className="max-w-56 px-4 py-3 text-xs text-muted">
                      {change.reason || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {change.changedByName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-line sm:hidden">
            {changes.map((change) => (
              <article className="space-y-2 p-4" key={change.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {change.studentName ?? "Unknown student"}
                  </p>
                  <StatusPill status={change.toStatus} />
                </div>
                <p className="text-xs text-muted">
                  {formatDate(change.date)} · {change.fromStatus ?? "—"} to{" "}
                  {change.toStatus}
                </p>
                <p className="text-xs text-muted">
                  {change.reason || "No reason recorded"} ·{" "}
                  {change.changedByName ?? "—"}
                </p>
              </article>
            ))}
          </div>
          {changesQuery.hasNextPage && (
            <button
              className="w-full border-t border-line py-3 text-xs font-semibold text-teal hover:bg-background disabled:opacity-50"
              disabled={changesQuery.isFetchingNextPage}
              onClick={() => void changesQuery.fetchNextPage()}
              type="button"
            >
              {changesQuery.isFetchingNextPage
                ? "Loading…"
                : "Load more changes"}
            </button>
          )}
        </section>
      ) : (
        <EmptyBox title="No corrections found">
          No attendance changes match the selected date and section.
        </EmptyBox>
      )}
    </main>
  );
}
