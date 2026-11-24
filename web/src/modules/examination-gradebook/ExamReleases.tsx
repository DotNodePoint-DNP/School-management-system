"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAcademicYears } from "@/modules/settings/services/academic-setup";
import {
  listExamReleases,
  setExamRelease,
  type Release,
} from "./services/releases";
import {
  Failure,
  Field,
  inputClass,
  buttonClass,
  panelClass,
} from "@/components/ui/WorkspaceFields";

function ReleaseRow({ exam, year }: { exam: Release; year: string }) {
  const cache = useQueryClient();
  const [clear, setClear] = useState(false);
  const change = useMutation({
    mutationFn: (form: FormData) =>
      setExamRelease(exam.id, {
        ...(clear ? { clear: true } : { releaseOn: String(form.get("date")) }),
        reason: String(form.get("reason") ?? "").trim() || undefined,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["exam-releases", year] }),
  });
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-semibold">{exam.name}</h2>
      <p className="mb-4 text-sm text-muted">
        {exam.status} ·{" "}
        {exam.visibleToParents
          ? "Visible to parents"
          : exam.releaseOn
            ? "Scheduled " + exam.releaseOn
            : "Unreleased"}
      </p>
      {exam.status === "PUBLISHED" && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (window.confirm("Update parent access to " + exam.name + "?"))
              change.mutate(new FormData(e.currentTarget));
          }}
        >
          <Field label="Action">
            <select
              className={inputClass}
              value={clear ? "withdraw" : "schedule"}
              onChange={(e) => setClear(e.target.value === "withdraw")}
            >
              <option value="schedule">Set release date</option>
              {exam.releaseOn && (
                <option value="withdraw">Withdraw release</option>
              )}
            </select>
          </Field>
          {!clear && (
            <Field label="Release date (AD)">
              <input
                type="date"
                required
                name="date"
                className={inputClass}
                defaultValue={exam.releaseOn ?? ""}
              />
            </Field>
          )}
          <Field label="Reason for withdrawal or postponement">
            <input
              className={inputClass}
              name="reason"
              minLength={10}
              maxLength={300}
              required={clear && exam.visibleToParents}
            />
          </Field>
          <button
            className={buttonClass + " self-end"}
            disabled={change.isPending}
          >
            Save release
          </button>
          <Failure error={change.error} />
        </form>
      )}
    </section>
  );
}
export function ExamReleases({ canListYears }: { canListYears: boolean }) {
  const years = useQuery({
    queryKey: ["examination", "years"],
    queryFn: listAcademicYears,
    enabled: canListYears,
  });
  const [selection, setSelection] = useState("");
  const year =
    selection ||
    years.data?.find((y) => y.status === "ACTIVE")?.id ||
    years.data?.[0]?.id ||
    "";
  const rows = useQuery({
    queryKey: ["exam-releases", year],
    queryFn: () => listExamReleases(year),
    enabled: !!year,
  });
  return (
    <section className="mx-auto max-w-4xl space-y-4 text-ink">
      <h1 className="text-3xl font-semibold">Parent result releases</h1>
      <Field label="Academic year">
        {canListYears ? (
          <select
            className={inputClass}
            value={year}
            onChange={(e) => setSelection(e.target.value)}
          >
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={inputClass}
            aria-label="Academic year ID"
            onBlur={(e) => setSelection(e.target.value.trim())}
          />
        )}
      </Field>
      <Failure
        error={years.error || rows.error}
        retry={() => {
          if (canListYears) void years.refetch();
          if (year) void rows.refetch();
        }}
      />
      {rows.isFetching && <p>Loading releases…</p>}
      {rows.data?.length === 0 && <p>No exams in this year.</p>}
      {rows.data?.map((exam) => (
        <ReleaseRow key={exam.id + exam.releaseOn} exam={exam} year={year} />
      ))}
    </section>
  );
}
