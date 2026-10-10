import type { Data, Exam, ExamType, Term, TermStatus } from "./types";

/* ------------------------------ Option lists ------------------------------ */

export const TERM_STATUSES: TermStatus[] = ["Upcoming", "Ongoing", "Completed"];
export const EXAM_TYPES: ExamType[] = ["Unit test", "Terminal", "Final", "Practical", "Project"];

/* -------------------------------- Helpers --------------------------------- */

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const formatDate = (iso: string): string =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const byStart = (a: Term, b: Term): number => a.startDate.localeCompare(b.startDate);

export const byDate = (a: Exam, b: Exam): number =>
  (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name);

export const totalWeightage = (exams: Exam[]): number =>
  exams.reduce((sum, e) => sum + e.weightage, 0);

export const statusStyle = (s: TermStatus): string =>
  s === "Ongoing"
    ? "bg-teal text-white"
    : s === "Upcoming"
      ? "bg-amber/30 text-ink"
      : "bg-line text-muted";

/* -------------------------------- Demo data -------------------------------- */
/* Replace buildSeed() with your API data later. */

function mk(
  id: string,
  termId: string,
  name: string,
  type: ExamType,
  fullMarks: number,
  passMarks: number,
  weightage: number,
  date: string,
  description = ""
): Exam {
  return { id, termId, name, type, fullMarks, passMarks, weightage, date, description };
}

export function buildSeed(): Data {
  const terms: Term[] = [
    { id: "t1", name: "First Term", academicYear: "2026/27", startDate: "2026-04-14", endDate: "2026-08-31", status: "Completed" },
    { id: "t2", name: "Second Term", academicYear: "2026/27", startDate: "2026-09-01", endDate: "2026-12-31", status: "Ongoing" },
    { id: "t3", name: "Final Term", academicYear: "2026/27", startDate: "2027-01-01", endDate: "2027-03-31", status: "Upcoming" },
  ];

  const exams: Exam[] = [
    mk("e1", "t1", "Unit Test 1", "Unit test", 25, 10, 10, "2026-05-30", "Chapters 1 to 3."),
    mk("e2", "t1", "Unit Test 2", "Unit test", 25, 10, 15, "2026-07-04", "Chapters 4 to 6."),
    mk("e3", "t1", "First Terminal Exam", "Terminal", 100, 40, 75, "2026-08-18", "Full syllabus covered in the term."),
    mk("e4", "t2", "Unit Test 3", "Unit test", 25, 10, 10, "2026-10-10"),
    mk("e5", "t2", "Practical Assessment", "Practical", 50, 20, 15, "2026-11-20", "Science and computer practicals."),
    mk("e6", "t2", "Second Terminal Exam", "Terminal", 100, 40, 75, "2026-12-15"),
    mk("e7", "t3", "Final Exam", "Final", 100, 40, 80, "2027-03-10", "Full year syllabus."),
  ];

  return { terms, exams };
}

/* --------------------------- Shared Tailwind strings ------------------------ */

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";

const btnBase = `inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${focusRing}`;

export const btnPrimary = `${btnBase} bg-teal text-white hover:opacity-90`;
export const btnGhost = `${btnBase} border border-line bg-panel text-ink hover:bg-mint`;
export const btnDanger = `${btnBase} border border-line bg-panel text-coral hover:bg-coral hover:text-white`;
export const btnDangerSolid = `${btnBase} bg-coral text-white hover:opacity-90`;

export const inputCls = `w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink placeholder:text-muted ${focusRing}`;