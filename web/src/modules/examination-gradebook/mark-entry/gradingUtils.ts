import type {
  Component, Exam, MarkCell, MarkScheme, MarkSheet, ParsedMark, ParsedRow,
  SheetStats, Student, Subject, Teacher,
} from "../types";

/* ---------- Subject / assignment ---------- */

export function subjectsForClass(teacher: Teacher, subjects: Subject[], classId: string): Subject[] {
  const ids = new Set(teacher.assignments.filter((a) => a.classId === classId).map((a) => a.subjectId));
  return subjects.filter((s) => ids.has(s.id));
}

/** Default = first subject in the teacher's own department, else first available. */
export function getDefaultSubject(teacher: Teacher, options: Subject[]): Subject | undefined {
  return options.find((s) => s.department === teacher.department) ?? options[0];
}

/* ---------- Scheme (theory / practical split) ---------- */

export function resolveScheme(subject: Subject | undefined, exam: Exam): MarkScheme {
  const p = subject?.practical && exam.includesPractical ? subject.practical : undefined;
  const practicalMax = p?.maxMarks ?? 0;
  return {
    totalMax: exam.maxMarks,
    theoryMax: exam.maxMarks - practicalMax,
    practicalMax,
    hasPractical: !!p,
    passPercent: exam.passPercent,
    practicalPassPercent: p?.passPercent ?? exam.passPercent,
    separatePass: p?.separatePass ?? false, // default: grade comes from the aggregate total
  };
}

/* ---------- Typing / parsing ---------- */

const MARK_PATTERN = /^\d{0,3}(\.\d?)?$/;

export function sanitizeMark(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  return MARK_PATTERN.test(cleaned) ? cleaned : cleaned.slice(0, -1);
}

/** Apply typed/pasted text to one component. Anything starting with "a" means absent. */
export function setComponent(cell: MarkCell | undefined, col: Component, raw: string): MarkCell {
  const base: MarkCell = cell ?? { value: "", absent: false };
  const absent = /^a/i.test(raw.trim());
  const value = absent ? "" : sanitizeMark(raw);
  return col === "theory"
    ? { ...base, value, absent }
    : { ...base, practical: value, practicalAbsent: absent };
}

function parseComponent(value: string, absent: boolean, max: number): ParsedMark {
  if (absent) return { status: "absent", score: null };
  const v = value.trim();
  if (v === "") return { status: "pending", score: null };
  const n = Number(v);
  if (Number.isNaN(n)) return { status: "invalid", score: null, error: "Enter a number" };
  if (n > max) return { status: "invalid", score: n, error: `Max is ${max}` };
  return { status: "valid", score: n };
}

export function parseRow(cell: MarkCell | undefined, scheme: MarkScheme): ParsedRow {
  const theory = parseComponent(cell?.value ?? "", !!cell?.absent, scheme.theoryMax);
  const practical = scheme.hasPractical
    ? parseComponent(cell?.practical ?? "", !!cell?.practicalAbsent, scheme.practicalMax)
    : null;
  const parts = practical ? [theory, practical] : [theory];

  let status: ParsedRow["status"];
  if (parts.some((p) => p.status === "invalid")) status = "invalid";
  else if (parts.some((p) => p.status === "pending")) status = "pending";
  else if (parts.every((p) => p.status === "absent")) status = "absent";
  else status = "valid";

  const total = status === "valid" ? parts.reduce((s, p) => s + (p.score ?? 0), 0) : null;
  return { status, theory, practical, total };
}

/* ---------- Grading ---------- */

export const percent = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);

export function getResult(row: ParsedRow, scheme: MarkScheme): { label: string; pass: boolean } | null {
  if (row.status !== "valid" || row.total === null) return null;
  const parts = row.practical ? [row.theory, row.practical] : [row.theory];
  // Aggregate: grade and pass/fail come from theory + practical combined.
  // An absent part simply contributes 0 to the total.
  let pass = percent(row.total, scheme.totalMax) >= scheme.passPercent;

  // Optional stricter rule (set practical.separatePass = true): each part must pass on its own.
  if (pass && scheme.hasPractical && scheme.separatePass) {
    pass =
      !parts.some((p) => p.status === "absent") &&
      percent(row.theory.score ?? 0, scheme.theoryMax) >= scheme.passPercent &&
      percent(row.practical?.score ?? 0, scheme.practicalMax) >= scheme.practicalPassPercent;
  }
  if (!pass) return { label: "F", pass };

  const p = percent(row.total, scheme.totalMax);
  const label = p >= 90 ? "A+" : p >= 80 ? "A" : p >= 70 ? "B+" : p >= 60 ? "B" : p >= 50 ? "C" : "D";
  return { label, pass };
}

/* ---------- Stats ---------- */

export function computeStats(students: Student[], sheet: MarkSheet, scheme: MarkScheme): SheetStats {
  let entered = 0, absent = 0, pending = 0, invalid = 0, passed = 0, pendingTheory = 0, pendingPractical = 0;
  const totals: number[] = [];

  for (const s of students) {
    const r = parseRow(sheet[s.id], scheme);
    if (r.theory.status === "pending") pendingTheory++;
    if (r.practical?.status === "pending") pendingPractical++;
    if (r.status === "valid" && r.total !== null) {
      entered++;
      totals.push(r.total);
      if (getResult(r, scheme)?.pass) passed++;
    } else if (r.status === "absent") absent++;
    else if (r.status === "invalid") invalid++;
    else pending++;
  }

  return {
    total: students.length, entered, absent, pending, invalid, pendingTheory, pendingPractical,
    average: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
    highest: totals.length ? Math.max(...totals) : null,
    lowest: totals.length ? Math.min(...totals) : null,
    passRate: totals.length ? (passed / totals.length) * 100 : null,
  };
}

/* ---------- Paste from Excel (rows = newline, columns = tab) ---------- */

export function parsePasteGrid(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => line.split("\t").map((t) => t.trim()));
}

/* ---------- Draft persistence ---------- */

export const draftKey = (classId: string, subjectId: string, examId: string) =>
  `mark-draft:${classId}:${subjectId}:${examId}`;

export function loadDraft(key: string): MarkSheet {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as MarkSheet) : {};
  } catch {
    return {};
  }
}
export function saveDraft(key: string, sheet: MarkSheet): void {
  try { localStorage.setItem(key, JSON.stringify(sheet)); } catch { /* ignore */ }
}
export function clearDraft(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/* ---------- Misc ---------- */

export const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export const fmt = (n: number | null, digits = 1) =>
  n === null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(digits);