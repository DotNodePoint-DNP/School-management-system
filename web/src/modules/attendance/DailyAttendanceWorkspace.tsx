"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listAcademicYears,
  listSchoolClasses,
} from "@/modules/settings/services/academic-setup";
import {
  changeAttendanceRecord,
  getAttendanceRoster,
  submitAttendance,
  type AttendanceRoster,
  type AttendanceStatus,
} from "./services/attendance";
import {
  AttendanceHeader,
  ATTENDANCE_STATUSES,
  EmptyBox,
  ErrorBox,
  Field,
  formatDate,
  inputClass,
  LoadingBox,
  localDate,
  SelectField,
  StatusPill,
  STATUS_COLORS,
} from "./components/shared";

type DraftRecord = { status: AttendanceStatus | null; note: string };
type AttendancePermission = { canMark: boolean };
type Props = {
  permissions: AttendancePermission;
  initialYearId?: string;
  initialSectionId?: string;
  initialDate?: string;
};

function daysAgo(date: string): number {
  const today = new Date(`${localDate()}T00:00:00Z`).getTime();
  const target = new Date(`${date}T00:00:00Z`).getTime();
  return Math.floor((today - target) / 86_400_000);
}

export default function DailyAttendanceWorkspace({
  permissions,
  initialYearId = "",
  initialSectionId = "",
  initialDate = localDate(),
}: Props) {
  const queryClient = useQueryClient();
  const [yearSelection, setYearSelection] = useState(initialYearId);
  const [sectionSelection, setSectionSelection] = useState(initialSectionId);
  const [date, setDate] = useState(initialDate);
  const [draftState, setDraftState] = useState<{
    key: string;
    records: Record<string, DraftRecord>;
  }>({ key: "", records: {} });
  const [reasonState, setReasonState] = useState({ key: "", reason: "" });

  const yearsQuery = useQuery({
    queryKey: ["attendance", "years"],
    queryFn: listAcademicYears,
  });
  const classesQuery = useQuery({
    queryKey: ["attendance", "classes"],
    queryFn: listSchoolClasses,
  });
  const years = yearsQuery.data ?? [];
  const yearId =
    yearSelection ||
    (years.find((item) => item.status === "ACTIVE") ?? years[0])?.id ||
    "";
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
  const sectionId = sections.some((section) => section.id === sectionSelection)
    ? sectionSelection
    : (sections[0]?.id ?? "");
  const section = sections.find((item) => item.id === sectionId);
  const rosterQuery = useQuery({
    queryKey: ["attendance", "roster", yearId, sectionId, date],
    queryFn: () => getAttendanceRoster(yearId, sectionId, date),
    enabled: Boolean(yearId && sectionId && date),
    retry: false,
  });
  const roster = rosterQuery.data;
  const draftKey = `${yearId}|${sectionId}|${date}|${roster?.session?.id ?? "new"}`;
  const defaultDrafts = useMemo(
    () =>
      Object.fromEntries(
        (roster?.students ?? []).map((student) => [
          student.enrollmentId,
          { status: student.status, note: student.note ?? "" },
        ]),
      ),
    [roster],
  );
  const drafts =
    draftState.key === draftKey ? draftState.records : defaultDrafts;
  const reason = reasonState.key === draftKey ? reasonState.reason : "";
  const updateDrafts = (
    update:
      | Record<string, DraftRecord>
      | ((current: Record<string, DraftRecord>) => Record<string, DraftRecord>),
  ) => {
    setDraftState((current) => {
      const currentDrafts =
        current.key === draftKey ? current.records : defaultDrafts;
      return {
        key: draftKey,
        records: typeof update === "function" ? update(currentDrafts) : update,
      };
    });
  };
  const outsideWindow = Boolean(
    roster && daysAgo(date) > roster.editWindowDays,
  );
  const markedCount =
    roster?.students.filter((student) => drafts[student.enrollmentId]?.status)
      .length ?? 0;
  const dirty = Boolean(
    roster?.session &&
    roster.students.some((student) => {
      const draft = drafts[student.enrollmentId];
      return (
        draft &&
        (draft.status !== student.status ||
          draft.note.trim() !== (student.note ?? ""))
      );
    }),
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!roster || !roster.editableByMe) {
        throw new Error("You can’t edit attendance for this date.");
      }
      if (
        roster.students.some((student) => !drafts[student.enrollmentId]?.status)
      ) {
        throw new Error("Mark attendance for every student before saving.");
      }
      if (outsideWindow && reason.trim().length < 10) {
        throw new Error("Enter a correction reason of at least 10 characters.");
      }
      if (!roster.session) {
        return submitAttendance(
          yearId,
          sectionId,
          date,
          roster.students.map((student) => {
            const draft = drafts[student.enrollmentId];
            return {
              enrollmentId: student.enrollmentId,
              status: draft.status!,
              ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
            };
          }),
          outsideWindow ? reason.trim() : undefined,
        );
      }
      const changed = roster.students.filter((student) => {
        const draft = drafts[student.enrollmentId];
        return (
          draft &&
          (draft.status !== student.status ||
            draft.note.trim() !== (student.note ?? ""))
        );
      });
      if (!changed.length)
        throw new Error("There are no attendance changes to save.");
      const results = await Promise.allSettled(
        changed.map((student) => {
          const draft = drafts[student.enrollmentId];
          return changeAttendanceRecord(
            yearId,
            sectionId,
            date,
            student.enrollmentId,
            {
              ...(draft.status !== student.status && draft.status
                ? { status: draft.status }
                : {}),
              ...(draft.note.trim() !== (student.note ?? "")
                ? { note: draft.note.trim() }
                : {}),
              ...(outsideWindow ? { reason: reason.trim() } : {}),
            },
          );
        }),
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) {
        await queryClient.invalidateQueries({
          queryKey: ["attendance", "roster", yearId, sectionId, date],
        });
        throw failed.reason;
      }
      return getAttendanceRoster(yearId, sectionId, date);
    },
    onSuccess: async () => {
      toast.success("Attendance saved.");
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "The request failed.",
      ),
  });

  const canSave =
    Boolean(roster?.editableByMe) &&
    markedCount === (roster?.students.length ?? 0) &&
    (roster?.session ? dirty : Boolean(roster?.students.length)) &&
    (!outsideWindow || reason.trim().length >= 10) &&
    !saveMutation.isPending;

  if (yearsQuery.isPending || classesQuery.isPending) {
    return <LoadingBox>Loading attendance register…</LoadingBox>;
  }
  if (yearsQuery.isError) {
    return (
      <ErrorBox
        error={yearsQuery.error}
        retry={() => void yearsQuery.refetch()}
      />
    );
  }
  if (classesQuery.isError) {
    return (
      <ErrorBox
        error={classesQuery.error}
        retry={() => void classesQuery.refetch()}
      />
    );
  }
  if (!years.length) {
    return (
      <EmptyBox title="No academic year available">
        Create an academic year before taking attendance.
      </EmptyBox>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AttendanceHeader
        title="Daily attendance"
        description="Take a complete class register and record authorized changes."
      />
      <div className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-3">
        <SelectField
          label="Academic year"
          onChange={setYearSelection}
          value={yearId}
        >
          {years.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.status}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Class and section"
          onChange={setSectionSelection}
          value={sectionId}
        >
          {sections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.className} · {item.name}
            </option>
          ))}
        </SelectField>
        <Field label="Attendance date · AD">
          <input
            className={inputClass}
            max={localDate()}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </Field>
      </div>
      {rosterQuery.isPending ? (
        <LoadingBox>Loading student register…</LoadingBox>
      ) : rosterQuery.isError ? (
        <ErrorBox
          error={rosterQuery.error}
          retry={() => void rosterQuery.refetch()}
        />
      ) : !sectionId ? (
        <EmptyBox title="No active sections">
          Add an active class section to start taking attendance.
        </EmptyBox>
      ) : roster ? (
        <RegisterPanel
          canMark={permissions.canMark}
          canSave={canSave}
          date={date}
          drafts={drafts}
          markedCount={markedCount}
          onMarkAll={() =>
            updateDrafts(
              Object.fromEntries(
                roster.students.map((student) => [
                  student.enrollmentId,
                  {
                    status: "PRESENT",
                    note:
                      drafts[student.enrollmentId]?.note ?? student.note ?? "",
                  },
                ]),
              ),
            )
          }
          onClear={() =>
            updateDrafts(
              Object.fromEntries(
                roster.students.map((student) => [
                  student.enrollmentId,
                  {
                    status: null,
                    note:
                      drafts[student.enrollmentId]?.note ?? student.note ?? "",
                  },
                ]),
              ),
            )
          }
          onReasonChange={(value) =>
            setReasonState({ key: draftKey, reason: value })
          }
          onSave={() => saveMutation.mutate()}
          onUpdate={(id, value) =>
            updateDrafts((current) => ({ ...current, [id]: value }))
          }
          outsideWindow={outsideWindow}
          reason={reason}
          saving={saveMutation.isPending}
          sectionLabel={`${section?.className ?? ""} · ${section?.name ?? ""}`}
          roster={roster}
        />
      ) : null}
    </main>
  );
}

function RegisterPanel({
  roster,
  drafts,
  sectionLabel,
  date,
  canMark,
  canSave,
  markedCount,
  outsideWindow,
  reason,
  saving,
  onUpdate,
  onMarkAll,
  onClear,
  onReasonChange,
  onSave,
}: {
  roster: AttendanceRoster;
  drafts: Record<string, DraftRecord>;
  sectionLabel: string;
  date: string;
  canMark: boolean;
  canSave: boolean;
  markedCount: number;
  outsideWindow: boolean;
  reason: string;
  saving: boolean;
  onUpdate: (id: string, value: DraftRecord) => void;
  onMarkAll: () => void;
  onClear: () => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
}) {
  const counts = roster.students.reduce(
    (result, student) => {
      const status = drafts[student.enrollmentId]?.status;
      if (status) result[status] += 1;
      return result;
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 },
  );
  const rate = markedCount
    ? Math.round(((counts.PRESENT + counts.LATE) / markedCount) * 100)
    : null;
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs text-muted">Students</p>
          <p className="mt-2 text-2xl font-bold">{roster.students.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs text-muted">Marked</p>
          <p className="mt-2 text-2xl font-bold">
            {markedCount} / {roster.students.length}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs text-muted">Present · late</p>
          <p className="mt-2 text-2xl font-bold">
            {counts.PRESENT} · {counts.LATE}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs text-muted">Attendance rate</p>
          <p className="mt-2 text-2xl font-bold">
            {rate === null ? "—" : `${rate}%`}
          </p>
        </div>
      </div>
      {!roster.isSchoolDay && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm">
          <p className="font-semibold text-ink">This is not a school day</p>
          <p className="mt-1 text-xs text-muted">
            {roster.nonSchoolReason ??
              "The selected date is not scheduled for attendance."}
          </p>
        </div>
      )}
      {roster.session && (
        <div className="rounded-lg border border-teal/20 bg-mint/60 p-4 text-xs text-ink">
          Register saved
          {roster.session.takenByName
            ? ` by ${roster.session.takenByName}`
            : ""}
          . Changes are recorded in correction history.
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="font-semibold">{sectionLabel}</h2>
            <p className="mt-1 text-xs text-muted">
              {formatDate(date)}
              {roster.dateBs ? ` · BS ${roster.dateBs}` : ""} ·{" "}
              {roster.students.length} students
            </p>
          </div>
          {canMark && (
            <div className="flex gap-2">
              <button
                className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-background disabled:opacity-50"
                disabled={!roster.editableByMe}
                onClick={onMarkAll}
                type="button"
              >
                Mark all present
              </button>
              <button
                className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-background disabled:opacity-50"
                disabled={!roster.editableByMe}
                onClick={onClear}
                type="button"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        {roster.students.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-background text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Admission no.</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {roster.students.map((student) => {
                  const draft = drafts[student.enrollmentId] ?? {
                    status: student.status,
                    note: student.note ?? "",
                  };
                  return (
                    <tr key={student.enrollmentId}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{student.name}</p>
                        <p className="text-xs text-muted">
                          Roll {student.rollNo ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {student.admissionNo || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {canMark ? (
                          <div className="flex flex-wrap gap-1">
                            {ATTENDANCE_STATUSES.map((status) => (
                              <button
                                aria-pressed={draft.status === status.value}
                                className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${draft.status === status.value ? `${STATUS_COLORS[status.value]} border-transparent` : "border-line text-muted"} disabled:opacity-50`}
                                disabled={!roster.editableByMe}
                                key={status.value}
                                onClick={() =>
                                  onUpdate(student.enrollmentId, {
                                    ...draft,
                                    status: status.value,
                                  })
                                }
                                type="button"
                              >
                                {status.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <StatusPill status={student.status} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Note for ${student.name}`}
                          className="h-9 w-full rounded-md border border-line bg-panel px-2 text-xs outline-none focus:border-teal disabled:opacity-60"
                          disabled={!canMark || !roster.editableByMe}
                          maxLength={255}
                          onChange={(event) =>
                            onUpdate(student.enrollmentId, {
                              ...draft,
                              note: event.target.value,
                            })
                          }
                          placeholder="Optional note"
                          value={draft.note}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted">
            No enrolled students found for this section.
          </p>
        )}
        {canMark && (
          <div className="flex flex-col gap-3 border-t border-line bg-background/40 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              {outsideWindow && (
                <Field
                  label={`Correction reason (required outside the ${roster.editWindowDays}-day edit window)`}
                >
                  <textarea
                    className={`${inputClass} min-h-20`}
                    maxLength={500}
                    minLength={10}
                    onChange={(event) => onReasonChange(event.target.value)}
                    value={reason}
                  />
                </Field>
              )}
              {!roster.editableByMe && (
                <p className="text-xs text-muted">
                  You don&apos;t have permission to change this register or the
                  date is outside your edit window.
                </p>
              )}
              {roster.editableByMe && !outsideWindow && (
                <p className="text-xs text-muted">
                  {roster.session
                    ? "Changes to this saved register will be recorded in correction history."
                    : `${roster.students.length - markedCount} student(s) still need a status.`}
                </p>
              )}
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-4 text-xs font-semibold text-white hover:bg-navy disabled:opacity-45"
              disabled={!canSave}
              onClick={onSave}
              type="button"
            >
              {saving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saving
                ? "Saving…"
                : roster.session
                  ? "Save changes"
                  : "Submit attendance"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
