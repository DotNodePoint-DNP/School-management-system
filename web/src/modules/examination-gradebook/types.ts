export type Department = "Math & Science" | "Languages" | "Social Studies" | "Arts & PE";
export type Component = "theory" | "practical";

/** Subjects with a practical (Science, Computer, etc.). Omit for theory-only subjects. */
export interface PracticalConfig {
  maxMarks: number; // part of the exam total, e.g. 25 of 100
  passPercent: number; // pass % of the practical part (only used when separatePass is true)
  separatePass?: boolean; // default false: grade/pass uses the combined total. true = each part must pass too
}

export interface Subject {
  id: string;
  name: string;
  department: Department;
  practical?: PracticalConfig;
}

export interface ClassSection {
  id: string;
  name: string;
}

export interface Assignment {
  classId: string;
  subjectId: string;
}

export interface Teacher {
  id: string;
  name: string;
  department: Department;
  assignments: Assignment[];
}

export interface Exam {
  id: string;
  name: string;
  maxMarks: number; // TOTAL (theory + practical)
  passPercent: number; // pass % for total / theory
  includesPractical?: boolean; // practical applies only in exams that set this (e.g. finals)
}

/** Resolved per subject + exam: what is actually out of what. */
export interface MarkScheme {
  totalMax: number;
  theoryMax: number;
  practicalMax: number; // 0 when no practical
  hasPractical: boolean;
  passPercent: number;
  practicalPassPercent: number;
  separatePass: boolean;
}

export interface Student {
  id: string;
  rollNo: number;
  name: string;
}

/** Strings so teachers can type "4", "4.", "4.5". `value` = theory (kept for old drafts). */
export interface MarkCell {
  value: string;
  absent: boolean;
  practical?: string;
  practicalAbsent?: boolean;
}
export type MarkSheet = Record<string, MarkCell>;

export type RowStatus = "pending" | "valid" | "invalid" | "absent";

export interface ParsedMark {
  status: RowStatus;
  score: number | null;
  error?: string;
}

export interface ParsedRow {
  status: RowStatus;
  theory: ParsedMark;
  practical: ParsedMark | null;
  total: number | null;
}

export type RowFilter = "all" | "pending" | "invalid";

export interface SheetStats {
  total: number;
  entered: number;
  absent: number;
  pending: number;
  invalid: number;
  pendingTheory: number;
  pendingPractical: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
}

export interface SubmitPayload {
  classId: string;
  subjectId: string;
  examId: string;
  teacherId: string;
  records: {
    studentId: string;
    theoryScore: number | null;
    practicalScore: number | null;
    total: number | null;
    theoryAbsent: boolean;
    practicalAbsent: boolean;
  }[];
}

export interface MarkEntryProps {
  teacher: Teacher;
  subjects: Subject[];
  classes: ClassSection[];
  exams: Exam[];
  loadStudents: (classId: string) => Promise<Student[]>;
  onSubmit: (payload: SubmitPayload) => Promise<void>;
}