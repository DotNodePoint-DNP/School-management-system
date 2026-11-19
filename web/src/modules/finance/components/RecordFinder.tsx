"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listStudents } from "@/modules/admissions/services/students";
import { listSectionEnrollments } from "@/modules/admissions/services/enrollments";
import { createApiClient } from "@/lib/api/client";
import {
  buttonClass,
  Failure,
  Field,
  inputClass,
} from "@/components/ui/WorkspaceFields";
import type { Options } from "./WorkflowFields";

interface Match {
  id: string;
  name: string;
}
type Source = "student" | "enrollment" | "period" | "invoice" | "payment";
const labels: Record<Source, string> = {
  student: "Student",
  enrollment: "Enrollment",
  period: "Billing period",
  invoice: "Invoice",
  payment: "Receipt",
};

export function RecordFinder({
  options,
  permissions,
  choose,
}: {
  options: Options;
  permissions: string[];
  choose: (key: string, record: Match) => void;
}) {
  const sources = (Object.keys(labels) as Source[]).filter((s) =>
    s === "student"
      ? permissions.includes("students:read") ||
        permissions.includes("students:read-all")
      : s === "enrollment"
        ? permissions.includes("enrollments:read")
        : permissions.includes("fees:read"),
  );
  const [selected, setSelected] = useState<Source>();
  const source = selected ?? sources[0];
  const [term, setTerm] = useState("");
  const [year, setYear] = useState("");
  const [section, setSection] = useState("");
  const [page, setPage] = useState(1);
  const [run, setRun] = useState(false);
  const results = useQuery({
    queryKey: ["finance", "find", source, term, year, section, page],
    enabled: run && !!source,
    queryFn: async (): Promise<{ items: Match[]; pages: number }> => {
      if (source === "student") {
        const rows = await listStudents({ search: term, page, pageSize: 10 });
        return {
          items: rows.items.map((s) => ({
            id: s.id,
            name:
              s.admissionNo +
              " · " +
              [s.firstName, s.lastName].filter(Boolean).join(" "),
          })),
          pages: rows.meta.totalPages,
        };
      }
      if (source === "enrollment") {
        const rows = await listSectionEnrollments(year, section);
        return {
          items: rows.map((s) => ({
            id: s.enrollmentId,
            name: s.name + " · " + s.admissionNo,
          })),
          pages: 1,
        };
      }
      if (source === "period") {
        const rows = await createApiClient().get<Match[]>(
          "/academic-years/" + encodeURIComponent(year) + "/billing-periods",
        );
        return { items: rows, pages: 1 };
      }
      const rows = await createApiClient().getPaginated<{
        id: string;
        number?: string;
        receiptNo?: string;
      }>(
        `/${source === "invoice" ? "invoices" : "payments"}?` +
          new URLSearchParams({
            search: term,
            page: String(page),
            pageSize: "10",
          }),
      );
      return {
        items: rows.items.map((r) => ({
          id: r.id,
          name: r.number ?? r.receiptNo ?? r.id,
        })),
        pages: rows.meta.totalPages,
      };
    },
  });
  if (!source) return null;
  const roster = source === "enrollment",
    needsYear = roster || source === "period";
  return (
    <details className="rounded-xl border border-line bg-panel p-4">
      <summary className="cursor-pointer font-semibold">Find a record</summary>
      <form
        className="my-4 grid gap-3 sm:grid-cols-2"
        onChange={() => {
          setRun(false);
          setPage(1);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          setRun(true);
          if (run) void results.refetch();
        }}
      >
        <Field label="Record type">
          <select
            className={inputClass}
            value={source}
            onChange={(e) => setSelected(e.target.value as Source)}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </Field>
        {needsYear ? (
          <Field label="Academic year">
            {options.yearId.length ? (
              <select
                className={inputClass}
                value={year}
                required
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Select year</option>
                {options.yearId.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                value={year}
                required
                onChange={(e) => setYear(e.target.value)}
              />
            )}
          </Field>
        ) : (
          <Field
            label={
              source === "student"
                ? "Name or admission number"
                : "Number or reference"
            }
          >
            <input
              className={inputClass}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </Field>
        )}
        {roster && (
          <Field label="Section">
            {options.sectionId.length ? (
              <select
                required
                className={inputClass}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                <option value="">Select section</option>
                {options.sectionId.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required
                className={inputClass}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
            )}
          </Field>
        )}
        <button className={buttonClass + " self-end"}>Search</button>
      </form>
      {run && (
        <>
          <Failure error={results.error} retry={() => void results.refetch()} />
          {results.isFetching && <p>Searching…</p>}
          {!results.isFetching && results.data?.items.length === 0 && (
            <p>No records found.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {results.data?.items.map((r) => (
              <button
                className={buttonClass}
                key={r.id}
                onClick={() => choose(source + "Id", r)}
              >
                Use {r.name}
              </button>
            ))}
          </div>
          {results.data && results.data.pages > 1 && (
            <div className="mt-3 flex gap-2">
              <button
                className={buttonClass}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className={buttonClass}
                disabled={page >= results.data.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </details>
  );
}
