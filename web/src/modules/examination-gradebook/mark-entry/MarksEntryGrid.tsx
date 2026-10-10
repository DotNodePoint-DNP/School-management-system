"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pagination } from "@/modules/examination-gradebook/mark-entry/Pagination";
import { usePagination } from "@/features/pagination/Usepagination";
import type {
  Component,
  MarkCell,
  MarkEntryProps,
  MarkSheet,
  RowFilter,
  RowStatus,
  Student,
} from "../types";
import {
  clearDraft,
  computeStats,
  draftKey,
  fmt,
  getDefaultSubject,
  getResult,
  loadDraft,
  parsePasteGrid,
  parseRow,
  percent,
  resolveScheme,
  saveDraft,
  setComponent,
  subjectsForClass,
} from "./gradingUtils";
import { downloadMarksCsv } from "./exportcsv";

const selectCls =
  "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal";
const cellBase = "flex h-9 items-center border-b border-r border-line";
const gutter: Record<RowStatus, string> = {
  pending: "border-l-transparent",
  valid: "border-l-teal",
  invalid: "border-l-coral",
  absent: "border-l-amber",
};

/* ---------- one spreadsheet cell ---------- */
interface CellProps {
  col: Component;
  label: string;
  value: string;
  absent: boolean;
  invalid: boolean;
  error?: string;
  disabled: boolean;
  onFocus: () => void;
  onChange: (raw: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}
function Cell({
  col,
  label,
  value,
  absent,
  invalid,
  error,
  disabled,
  onFocus,
  onChange,
  onKeyDown,
  onPaste,
}: CellProps) {
  return (
    <div
      role="gridcell"
      className={`${cellBase} ${invalid ? "bg-coral/15" : absent ? "bg-amber/20" : ""}`}
    >
      <input
        data-col={col}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid}
        title={error}
        value={absent ? "AB" : value}
        onFocus={(e) => {
          e.currentTarget.select();
          onFocus();
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={`h-full w-full bg-transparent px-2 text-right text-sm tabular-nums outline-none focus:bg-panel focus:ring-2 focus:ring-inset focus:ring-teal disabled:opacity-60 ${invalid ? "text-coral" : "text-ink"}`}
      />
    </div>
  );
}

export default function MarksEntryGrid({
  teacher,
  subjects,
  classes,
  exams,
  loadStudents,
  onSubmit,
}: MarkEntryProps) {
  /* ---------- selection ---------- */
  const myClasses = useMemo(
    () =>
      classes.filter((c) =>
        teacher.assignments.some((a) => a.classId === c.id),
      ),
    [classes, teacher],
  );
  const [classId, setClassId] = useState(myClasses[0]?.id ?? "");
  const subjectOptions = useMemo(
    () => subjectsForClass(teacher, subjects, classId),
    [teacher, subjects, classId],
  );
  const [subjectId, setSubjectId] = useState(
    () =>
      getDefaultSubject(
        teacher,
        subjectsForClass(teacher, subjects, myClasses[0]?.id ?? ""),
      )?.id ?? "",
  );
  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const exam = exams.find((e) => e.id === examId) ?? exams[0];
  const subject = subjects.find((s) => s.id === subjectId);
  const scheme = useMemo(
    () => (exam ? resolveScheme(subject, exam) : null),
    [subject, exam],
  );
  const cols: Component[] = scheme?.hasPractical
    ? ["theory", "practical"]
    : ["theory"];

  const onClassChange = (id: string) => {
    setClassId(id);
    const opts = subjectsForClass(teacher, subjects, id);
    if (!opts.some((s) => s.id === subjectId))
      setSubjectId(getDefaultSubject(teacher, opts)?.id ?? "");
  };

  /* ---------- data + history ---------- */
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<MarkSheet>({});
  const sheetRef = useRef<MarkSheet>({}); // always-current copy (avoids stale closures on fast typing/paste)
  const undoStack = useRef<MarkSheet[]>([]);
  const redoStack = useRef<MarkSheet[]>([]);
  const lastEdit = useRef({ k: "", t: 0 });
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const key = draftKey(classId, subjectId, examId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadStudents(classId).then((list) => {
      if (!cancelled) {
        setStudents(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [classId, loadStudents]);

  useEffect(() => {
    const d = loadDraft(key);
    sheetRef.current = d;
    setSheet(d);
    undoStack.current = [];
    redoStack.current = [];
    setDirty(false);
    setSubmitted(false);
    setConfirming(false);
    setError("");
  }, [key]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      saveDraft(key, sheet);
      setSavedAt(new Date());
      setDirty(false);
    }, 600);
    return () => clearTimeout(t);
  }, [sheet, dirty, key]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /** Every edit goes through here. Same-cell typing within 1s is one undo step. */
  const apply = (next: MarkSheet, coalesce?: string) => {
    const now = Date.now();
    const same =
      !!coalesce &&
      lastEdit.current.k === coalesce &&
      now - lastEdit.current.t < 1000;
    if (!same) {
      undoStack.current.push(sheetRef.current);
      if (undoStack.current.length > 50) undoStack.current.shift();
    }
    lastEdit.current = { k: coalesce ?? "", t: now };
    redoStack.current = [];
    sheetRef.current = next;
    setSheet(next);
    setDirty(true);
    setConfirming(false);
  };
  const commit = (patch: Record<string, MarkCell>, coalesce?: string) =>
    apply({ ...sheetRef.current, ...patch }, coalesce);
  const undo = () => {
    const p = undoStack.current.pop();
    if (!p) return;
    redoStack.current.push(sheetRef.current);
    sheetRef.current = p;
    setSheet(p);
    setDirty(true);
  };
  const redo = () => {
    const n = redoStack.current.pop();
    if (!n) return;
    undoStack.current.push(sheetRef.current);
    sheetRef.current = n;
    setSheet(n);
    setDirty(true);
  };

  /* ---------- filters / derived ---------- */
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [active, setActive] = useState<{ id: string; col: Component } | null>(
    null,
  );

  const stats = useMemo(
    () => (scheme ? computeStats(students, sheet, scheme) : null),
    [students, sheet, scheme],
  );

  const colStats = useMemo(() => {
    if (!scheme) return null;
    const t: number[] = [],
      p: number[] = [],
      tot: number[] = [];
    for (const s of students) {
      const r = parseRow(sheet[s.id], scheme);
      if (r.theory.status === "valid" && r.theory.score !== null)
        t.push(r.theory.score);
      if (r.practical?.status === "valid" && r.practical.score !== null)
        p.push(r.practical.score);
      if (r.total !== null) tot.push(r.total);
    }
    const avg = (a: number[]) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const hi = (a: number[]) => (a.length ? Math.max(...a) : null);
    return {
      theory: [avg(t), hi(t)],
      practical: [avg(p), hi(p)],
      total: [avg(tot), hi(tot)],
    } as Record<string, (number | null)[]>;
  }, [students, sheet, scheme]);

  const visible = useMemo(() => {
    if (!scheme) return [];
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (
        q &&
        !(s.name.toLowerCase().includes(q) || String(s.rollNo).includes(q))
      )
        return false;
      const st = parseRow(sheet[s.id], scheme).status;
      return filter === "pending"
        ? st === "pending"
        : filter === "invalid"
          ? st === "invalid"
          : true;
    });
  }, [students, sheet, scheme, query, filter]);

  /* ---------- pagination (shared) ---------- */
  const pg = usePagination("mark-entry", visible.length, {
    defaultPageSize: 50,
  });
  const pageItems = pg.slice(visible);
  const pageStart = Math.max(0, pg.from - 1);
  const resetPage = pg.reset;
  useEffect(() => {
    resetPage();
  }, [classId, subjectId, examId, query, filter, resetPage]);

  /* ---------- spreadsheet navigation ---------- */
  const gridRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ r: number; col: Component } | null>(null);

  const domFocus = (r: number, col: Component) => {
    const list = gridRef.current?.querySelectorAll<HTMLInputElement>(
      `input[data-col="${col}"]`,
    );
    if (!list?.length) return;
    list[r < 0 ? list.length - 1 : r]?.focus();
  };
  const canGo = (r: number) =>
    r < 0 ? pg.page > 1 : r >= pageItems.length ? pg.page < pg.pageCount : true;
  const focusCell = (r: number, col: Component) => {
    if (r >= pageItems.length) {
      if (pg.page < pg.pageCount) {
        pending.current = { r: 0, col };
        pg.next();
      }
      return;
    }
    if (r < 0) {
      if (pg.page > 1) {
        pending.current = { r: -1, col };
        pg.prev();
      }
      return;
    }
    domFocus(r, col);
  };
  useEffect(() => {
    const p = pending.current;
    if (p) {
      pending.current = null;
      domFocus(p.r, p.col);
    }
  }, [pg.page]);

  const change = (s: Student, col: Component, raw: string) => {
    const cell = sheetRef.current[s.id];
    const wasAbsent = col === "theory" ? cell?.absent : cell?.practicalAbsent;
    if (wasAbsent && raw.length > 2 && /^ab/i.test(raw)) raw = raw.slice(2); // typing over "AB"
    commit({ [s.id]: setComponent(cell, col, raw) }, `${s.id}:${col}`);
  };

  /** Ctrl+D: copy the cell above into this one (Excel behaviour). */
  const fillDown = (r: number, col: Component) => {
    const abs = pageStart + r;
    const src = visible[abs - 1],
      dst = visible[abs];
    if (!src || !dst) return;
    const c = sheetRef.current[src.id];
    const raw =
      col === "theory"
        ? c?.absent
          ? "AB"
          : (c?.value ?? "")
        : c?.practicalAbsent
          ? "AB"
          : (c?.practical ?? "");
    commit({ [dst.id]: setComponent(sheetRef.current[dst.id], col, raw) });
  };

  const onCellKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    r: number,
    col: Component,
  ) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0;
    const atEnd = el.selectionEnd === el.value.length;
    const ci = cols.indexOf(col);
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (mod && k === "d") {
      e.preventDefault();
      fillDown(r, col);
      return;
    }
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      redo();
      return;
    }

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        focusCell(r + (e.shiftKey ? -1 : 1), col);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusCell(r + 1, col);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCell(r - 1, col);
        break;
      case "ArrowRight":
        if (atEnd && ci < cols.length - 1) {
          e.preventDefault();
          focusCell(r, cols[ci + 1]);
        }
        break;
      case "ArrowLeft":
        if (atStart && ci > 0) {
          e.preventDefault();
          focusCell(r, cols[ci - 1]);
        }
        break;
      case "Tab":
        if (!e.shiftKey && ci === cols.length - 1 && canGo(r + 1)) {
          e.preventDefault();
          focusCell(r + 1, cols[0]);
        } else if (e.shiftKey && ci === 0 && canGo(r - 1)) {
          e.preventDefault();
          focusCell(r - 1, cols[cols.length - 1]);
        }
        break;
    }
  };

  const paste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    col: Component,
    r: number,
  ) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text.trim()) || !scheme) return; // single value -> normal typing
    e.preventDefault();
    const patch: Record<string, MarkCell> = {};
    parsePasteGrid(text).forEach((tokens, i) => {
      const target = visible[pageStart + r + i]; // flows across pages
      if (!target) return;
      let cell = sheetRef.current[target.id];
      if (col === "theory") {
        cell = setComponent(cell, "theory", tokens[0] ?? "");
        if (scheme.hasPractical && tokens[1] !== undefined)
          cell = setComponent(cell, "practical", tokens[1]);
      } else cell = setComponent(cell, "practical", tokens[0] ?? "");
      patch[target.id] = cell;
    });
    commit(patch);
  };

  const clearAll = () => {
    if (
      window.confirm(
        "Clear every mark on this sheet? You can undo with Ctrl+Z.",
      )
    )
      apply({});
  };

  /* ---------- submit ---------- */
  const canSubmit =
    !!stats &&
    stats.total > 0 &&
    stats.pending === 0 &&
    stats.invalid === 0 &&
    !submitted;
  const submit = async () => {
    if (!exam || !scheme) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        classId,
        subjectId,
        examId,
        teacherId: teacher.id,
        records: students.map((s) => {
          const r = parseRow(sheetRef.current[s.id], scheme);
          return {
            studentId: s.id,
            theoryScore: r.theory.score,
            practicalScore: r.practical?.score ?? null,
            total: r.total,
            theoryAbsent: r.theory.status === "absent",
            practicalAbsent: r.practical?.status === "absent",
          };
        }),
      });
      clearDraft(key);
      setSubmitted(true);
      setConfirming(false);
    } catch {
      setError(
        "Couldn't submit. Your marks are saved on this device — try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!exam || !scheme || !stats || !colStats) return null;

  const className = classes.find((c) => c.id === classId)?.name ?? "";
  const done = stats.entered + stats.absent;
  const pct = stats.total ? Math.round((done / stats.total) * 100) : 0;
  const template = scheme.hasPractical
    ? "3.5rem 13rem 7rem 7rem 5rem 4rem 4rem"
    : "3.5rem 13rem 8rem 4rem 4rem";
  const activeStudent = students.find((s) => s.id === active?.id);
  const pendingText = scheme.hasPractical
    ? `${stats.pendingTheory} theory · ${stats.pendingPractical} practical still pending`
    : `${stats.pending} student${stats.pending > 1 ? "s" : ""} still pending`;

  const head = (
    label: string,
    sub: string | null,
    on: boolean,
    align = "justify-end",
  ) => (
    <div
      role="columnheader"
      className={`${cellBase} ${align} gap-1 bg-background px-2 text-xs font-semibold ${on ? "text-teal" : "text-ink"}`}
    >
      {label}
      {sub && <span className="font-normal text-muted">{sub}</span>}
    </div>
  );
  const foot = (label: string, idx: number) => (
    <div
      role="row"
      className="grid bg-background"
      style={{ gridTemplateColumns: template }}
    >
      <div
        className={`${cellBase} sticky left-0 z-10 col-span-2 bg-background px-3 text-xs font-medium text-muted`}
      >
        {label}
      </div>
      <div
        className={`${cellBase} justify-end px-2 text-xs tabular-nums text-ink`}
      >
        {fmt(colStats.theory[idx])}
      </div>
      {scheme.hasPractical && (
        <div
          className={`${cellBase} justify-end px-2 text-xs tabular-nums text-ink`}
        >
          {fmt(colStats.practical[idx])}
        </div>
      )}
      {scheme.hasPractical && (
        <div
          className={`${cellBase} justify-end px-2 text-xs tabular-nums text-ink`}
        >
          {fmt(colStats.total[idx])}
        </div>
      )}
      <div className={`${cellBase} col-span-2`} />
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-6xl bg-background p-4 text-foreground sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Enter marks
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {teacher.name} · {teacher.department}
          </p>
        </div>
        <p className="text-sm text-muted">
          {done} of {stats.total} done
          {stats.absent > 0 && ` · ${stats.absent} absent`} · {pct}%
        </p>
      </header>

      <div className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-muted">
          Class
          <select
            className={selectCls}
            value={classId}
            onChange={(e) => onClassChange(e.target.value)}
          >
            {myClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">
          Subject
          <select
            className={selectCls}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.department === teacher.department
                  ? " (your department)"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">
          Exam
          <select
            className={selectCls}
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
          >
            {exams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} (out of {x.maxMarks})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 rounded-lg bg-mint px-3 py-2 text-sm text-ink">
        {scheme.hasPractical
          ? `Theory ${scheme.theoryMax} + Practical ${scheme.practicalMax} = ${scheme.totalMax}. Grade uses the combined total.`
          : subject?.practical
            ? `${exam.name} has no practical. Pick an exam that includes it to see the Practical column.`
            : `${subject?.name ?? "This subject"} has no practical configured, so only theory marks are entered.`}
      </p>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-mint"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Entry progress"
      >
        <div
          className="h-full rounded-full bg-teal transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or roll no."
          aria-label="Search students"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-teal sm:max-w-xs"
        />
        <div className="flex gap-1" role="group" aria-label="Filter rows">
          {(["all", "pending", "invalid"] as RowFilter[]).map((f) => {
            const count =
              f === "pending"
                ? stats.pending
                : f === "invalid"
                  ? stats.invalid
                  : 0;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`h-9 rounded-lg px-3 text-sm capitalize transition-colors ${filter === f ? "bg-navy text-white" : "border border-line bg-panel text-ink hover:bg-mint"}`}
              >
                {f}
                {count ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!undoStack.current.length}
            className="h-9 rounded-lg border border-line bg-panel px-3 text-sm text-ink hover:bg-mint disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!redoStack.current.length}
            className="h-9 rounded-lg border border-line bg-panel px-3 text-sm text-ink hover:bg-mint disabled:opacity-40"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() =>
              downloadMarksCsv({
                students,
                sheet,
                scheme,
                filename: `${className}-${subject?.name}-${exam.name}.csv`,
              })
            }
            className="h-9 rounded-lg border border-line bg-panel px-3 text-sm text-ink hover:bg-mint"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="h-9 rounded-lg px-3 text-sm text-coral hover:bg-coral/10"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Spreadsheet */}
      <div
        ref={gridRef}
        role="grid"
        aria-label="Marks sheet"
        aria-rowcount={visible.length}
        className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-line bg-panel"
      >
        <div className="min-w-max">
          <div
            role="row"
            className="sticky top-0 z-20 grid bg-background"
            style={{ gridTemplateColumns: template }}
          >
            <div
              role="columnheader"
              className={`${cellBase} sticky left-0 z-30 justify-center bg-background text-xs font-semibold text-muted`}
            >
              Roll
            </div>
            <div
              role="columnheader"
              className={`${cellBase} sticky left-14 z-30 bg-background px-2 text-xs font-semibold text-ink`}
            >
              Student
            </div>
            {head(
              scheme.hasPractical ? "Theory" : "Marks",
              `/ ${scheme.theoryMax}`,
              active?.col === "theory",
            )}
            {scheme.hasPractical &&
              head(
                "Practical",
                `/ ${scheme.practicalMax}`,
                active?.col === "practical",
              )}
            {scheme.hasPractical &&
              head("Total", `/ ${scheme.totalMax}`, false)}
            {head("%", null, false)}
            {head("Grade", null, false, "justify-center")}
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-muted">
              Loading students…
            </p>
          ) : pageItems.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">
              {students.length === 0
                ? "No students in this class yet."
                : "No students match. Clear the search or filter."}
            </p>
          ) : (
            pageItems.map((s, r) => {
              const cell = sheet[s.id];
              const row = parseRow(cell, scheme);
              const res = getResult(row, scheme);
              const isActive = active?.id === s.id;
              const bg = isActive ? "bg-mint" : "bg-panel";
              return (
                <div
                  key={s.id}
                  role="row"
                  className={`grid ${bg}`}
                  style={{ gridTemplateColumns: template }}
                >
                  <div
                    role="rowheader"
                    className={`${cellBase} sticky left-0 z-10 justify-center border-l-4 text-xs tabular-nums text-muted ${bg} ${gutter[row.status]}`}
                  >
                    {s.rollNo}
                  </div>
                  <div
                    role="gridcell"
                    className={`${cellBase} sticky left-14 z-10 px-2 ${bg}`}
                  >
                    <span className="truncate text-sm font-medium text-ink">
                      {s.name}
                    </span>
                  </div>
                  <Cell
                    col="theory"
                    label={`${scheme.hasPractical ? "Theory" : "Marks"} for ${s.name}`}
                    value={cell?.value ?? ""}
                    absent={!!cell?.absent}
                    invalid={row.theory.status === "invalid"}
                    error={row.theory.error}
                    disabled={submitted}
                    onFocus={() => setActive({ id: s.id, col: "theory" })}
                    onChange={(raw) => change(s, "theory", raw)}
                    onKeyDown={(e) => onCellKey(e, r, "theory")}
                    onPaste={(e) => paste(e, "theory", r)}
                  />
                  {scheme.hasPractical && (
                    <Cell
                      col="practical"
                      label={`Practical for ${s.name}`}
                      value={cell?.practical ?? ""}
                      absent={!!cell?.practicalAbsent}
                      invalid={row.practical?.status === "invalid"}
                      error={row.practical?.error}
                      disabled={submitted}
                      onFocus={() => setActive({ id: s.id, col: "practical" })}
                      onChange={(raw) => change(s, "practical", raw)}
                      onKeyDown={(e) => onCellKey(e, r, "practical")}
                      onPaste={(e) => paste(e, "practical", r)}
                    />
                  )}
                  {scheme.hasPractical && (
                    <div
                      role="gridcell"
                      className={`${cellBase} justify-end px-2 text-sm font-medium tabular-nums text-ink`}
                    >
                      {row.total === null ? (
                        <span className="text-muted">–</span>
                      ) : (
                        fmt(row.total)
                      )}
                    </div>
                  )}
                  <div
                    role="gridcell"
                    className={`${cellBase} justify-end px-2 text-sm tabular-nums text-muted`}
                  >
                    {row.total === null
                      ? "–"
                      : `${Math.round(percent(row.total, scheme.totalMax))}%`}
                  </div>
                  <div
                    role="gridcell"
                    className={`${cellBase} justify-center text-sm font-semibold`}
                  >
                    {res ? (
                      <span className={res.pass ? "text-teal" : "text-coral"}>
                        {res.label}
                      </span>
                    ) : (
                      <span className="text-muted">–</span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div className="sticky bottom-0 z-20">
            {foot("Average", 0)}
            {foot("Highest", 1)}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {activeStudent
            ? `Roll ${activeStudent.rollNo} · ${activeStudent.name} · ${active?.col === "practical" ? "Practical" : scheme.hasPractical ? "Theory" : "Marks"}`
            : "Click a cell to start"}
        </span>
        <span>
          Enter/↓ next · Tab → · Ctrl+D fill down · Ctrl+Z undo · type AB for
          absent · paste from Excel
        </span>
      </div>
      <div className="mt-3">
        <Pagination pg={pg} />
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {submitted ? (
          <p className="text-sm font-medium text-teal" role="status">
            Marks submitted for {className} · {subject?.name} · {exam.name}.
          </p>
        ) : confirming ? (
          <div
            className="flex flex-wrap items-center gap-3"
            role="alertdialog"
            aria-label="Confirm submit"
          >
            <p className="flex-1 text-sm text-ink">
              Submit {done} marks for {className} · {subject?.name}? You can't
              edit them afterwards.
            </p>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-10 rounded-lg border border-line px-4 text-sm text-ink hover:bg-mint"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="h-10 rounded-lg bg-teal px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Confirm and submit"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p
              className="flex-1 text-sm text-muted"
              role="status"
              aria-live="polite"
            >
              {error ? (
                <span className="text-coral">{error}</span>
              ) : stats.invalid > 0 ? (
                <span className="text-coral">
                  {stats.invalid} mark{stats.invalid > 1 ? "s" : ""} need fixing
                </span>
              ) : stats.pending > 0 ? (
                pendingText
              ) : dirty ? (
                "Saving draft…"
              ) : savedAt ? (
                `Draft saved at ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              ) : (
                "Changes save automatically"
              )}
            </p>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => setConfirming(true)}
              className="h-10 rounded-lg bg-navy px-5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Review and submit
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
