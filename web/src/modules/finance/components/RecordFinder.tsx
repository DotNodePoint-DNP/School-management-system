"use client";
import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buttonClass,
  Field,
  inputClass,
  Failure,
} from "@/components/ui/WorkspaceFields";
import {
  lookupPermission,
  lookupRecords,
  searchable,
  type Choice,
} from "../services/lookups";
import { financeLabel } from "../services/presentation";
import type { Options } from "./WorkflowFields";

export const LookupContext = createContext({
  permissions: [] as string[],
  year: "",
  enrollment: "",
  reminders: false,
  remember: (_key: string, _r: Choice) => {
    void _key;
    void _r;
  },
});
export function RecordPicker({
  fieldKey,
  value,
  change,
  options,
  required,
  multiple,
}: {
  fieldKey: string;
  value: unknown;
  change: (v: unknown) => void;
  options: Options;
  required?: boolean;
  multiple: boolean;
}) {
  const ctx = useContext(LookupContext);
  const key = fieldKey
    .replace(/Ids$/, "Id")
    .replace(/^(from|to)PeriodId$/, "periodId");
  const billed =
    ctx.permissions.includes("fees:read") &&
    ((key === "studentId" &&
      !ctx.permissions.includes("students:read") &&
      !ctx.permissions.includes("students:read-all")) ||
      (key === "enrollmentId" &&
        (!ctx.permissions.includes("enrollments:read") ||
          !options.yearId.length ||
          !options.sectionId.length)));
  const source = billed
    ? key === "studentId"
      ? "billedStudent"
      : "billedEnrollment"
    : key === "runId"
      ? ctx.reminders
        ? "reminderRun"
        : "fineRun"
      : key;
  const label = financeLabel(fieldKey);
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(1),
    [opened, setOpened] = useState(false);
  const [pickedYear, setYear] = useState(""),
    [section, setSection] = useState("");
  const year = ctx.year || pickedYear;
  const needsYear = source === "enrollmentId" || source === "periodId";
  const needsSection = source === "enrollmentId";
  const canSearch =
    ctx.permissions.includes(lookupPermission[source]) ||
    (source === "studentId" && ctx.permissions.includes("students:read-all"));
  const ready =
    canSearch &&
    (!needsYear || !!year) &&
    (!needsSection || !!section) &&
    (source !== "assignmentId" || !!ctx.enrollment);
  const result = useQuery({
    queryKey: [
      "finance",
      "record-options",
      source,
      term,
      page,
      year,
      section,
      ctx.enrollment,
    ],
    enabled: opened && ready,
    queryFn: () =>
      lookupRecords(source, term, page, year, section, ctx.enrollment),
    retry: false,
  });
  const selected = String(value ?? "")
    .split(",")
    .filter(Boolean);
  const remembered = options[key] ?? [];
  const local = remembered.filter(
    (r) =>
      !lookupPermission[source] ||
      selected.includes(r.id) ||
      key === "cashierId",
  );
  const choices = [
    ...new Map(
      [...local, ...(result.data?.items ?? [])].map((r) => [r.id, r]),
    ).values(),
  ];
  const choose = (id: string) => {
    const r = choices.find((item) => item.id === id);
    if (r) ctx.remember(key, r);
    change(
      multiple
        ? [...new Set([...selected, id])].filter(Boolean).join(",")
        : id || undefined,
    );
  };
  const scopeSelect = (
    caption: string,
    current: string,
    items: Choice[],
    set: (s: string) => void,
  ) => (
    <Field label={caption}>
      <select
        className={inputClass}
        value={current}
        onChange={(e) => {
          set(e.target.value);
          setOpened(true);
          setPage(1);
        }}
      >
        <option value="">Choose {caption.toLowerCase()}</option>
        {items.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const restricted =
    (!canSearch && !choices.length) ||
    (needsYear && !year && !options.yearId?.length) ||
    (needsSection && !options.sectionId?.length);
  return (
    <div className="space-y-2">
      {needsYear &&
        canSearch &&
        !ctx.year &&
        scopeSelect("Academic year", pickedYear, options.yearId ?? [], (v) => {
          setYear(v);
          setSection("");
        })}
      {needsSection &&
        canSearch &&
        scopeSelect(
          "Class and section",
          section,
          options.sectionId ?? [],
          setSection,
        )}
      {searchable.has(source) && canSearch && (
        <Field label={"Find " + label.toLowerCase()}>
          <input
            className={inputClass}
            value={term}
            placeholder={
              billed
                ? "Admission or invoice number"
                : source === "studentId"
                  ? "Name or admission number"
                  : source === "invoiceId" || source === "paymentId"
                    ? "Number or reference"
                    : "Search by name"
            }
            onFocus={() => setOpened(true)}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(1);
              setOpened(true);
            }}
          />
        </Field>
      )}
      <Field label={label + (required ? " *" : "")}>
        <select
          className={inputClass}
          value={multiple ? "" : (selected[0] ?? "")}
          required={required && !selected.length}
          onFocus={() => setOpened(true)}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">
            {result.isFetching
              ? "Loading…"
              : multiple
                ? "Add " + financeLabel(key).toLowerCase()
                : "Choose " + label.toLowerCase()}
          </option>
          {!multiple &&
            selected[0] &&
            !choices.some((r) => r.id === selected[0]) && (
              <option value={selected[0]}>
                Selected {label.toLowerCase()}
              </option>
            )}
          {choices.map((r) => (
            <option
              key={r.id}
              value={r.id}
              disabled={multiple && selected.includes(r.id)}
            >
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      {multiple &&
        selected.map((id, i) => (
          <button
            type="button"
            key={id}
            className={buttonClass}
            onClick={() => change(selected.filter((s) => s !== id).join(","))}
          >
            {choices.find((r) => r.id === id)?.name ??
              "Selected " +
                financeLabel(key).toLowerCase() +
                " " +
                (i + 1)}{" "}
            ×
          </button>
        ))}
      {result.isSuccess && !result.data.items.length && (
        <p className="text-sm text-muted">No matching records.</p>
      )}
      <Failure error={result.error} retry={() => void result.refetch()} />
      {result.data && result.data.pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className={buttonClass}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          {page} / {result.data.pages}
          <button
            type="button"
            className={buttonClass}
            disabled={page >= result.data.pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {source === "assignmentId" && !ctx.enrollment && (
        <p className="text-sm text-muted">Choose an enrollment first.</p>
      )}
      {(restricted || result.isError) && (
        <details>
          <summary className="cursor-pointer text-sm">
            Use a supplied record reference
          </summary>
          <Field label={label + " reference"}>
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              value={String(value ?? "")}
              onChange={(e) => change(e.target.value)}
            />
          </Field>
        </details>
      )}
    </div>
  );
}
