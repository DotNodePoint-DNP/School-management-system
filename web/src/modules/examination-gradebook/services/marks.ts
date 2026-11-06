import type { Exam, ExamStatus } from "./exams";
import { client, encodeId, examPath, queryString } from "./client";

export interface ExamProgressItem {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  students: number;
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
  entered: number;
  submittedAt: string | null;
  teacher: { id: string; name: string } | null;
}

export interface ExamProgress {
  examId: string;
  submitted: number;
  total: number;
  sheets: ExamProgressItem[];
}

export interface MarkStudent {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
  theory: number | null;
  practical: number | null;
  absent: boolean;
  complete: boolean;
  onRoster: boolean;
}

export interface MarkSheet {
  examId: string;
  examName: string;
  examStatus: ExamStatus;
  academicYearId: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subject: { id: string; code: string; name: string; isCompulsory: boolean };
  setup: {
    fullTheory: number;
    passTheory: number;
    fullPractical: number | null;
    passPractical: number | null;
  };
  sheet: {
    id: string | null;
    status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
    submittedAt: string | null;
    submittedByName: string | null;
  };
  editableByMe: boolean;
  correctableByMe: boolean;
  counts: { total: number; entered: number; complete: number };
  students: MarkStudent[];
}

export interface MarkEntryInput {
  enrollmentId: string;
  theory?: number;
  practical?: number;
  absent?: boolean;
  clear?: boolean;
}

export interface MarkChange {
  id: string;
  changedAt: string;
  changedByName: string | null;
  examId: string;
  examStatus: ExamStatus;
  subjectCode: string | null;
  studentId: string | null;
  admissionNo: string | null;
  studentName: string | null;
  from: { theory: number | null; practical: number | null; absent: boolean } | null;
  to: { theory: number | null; practical: number | null; absent: boolean };
  reason: string;
}

export async function getMarkSheet(
  examId: string,
  sectionId: string,
  subjectId: string,
): Promise<MarkSheet> {
  return client().get<MarkSheet>(
    `${examPath(examId)}/sections/${encodeId(sectionId)}/subjects/${encodeId(subjectId)}/marks`,
  );
}

export async function saveMarks(
  examId: string,
  sectionId: string,
  subjectId: string,
  entries: MarkEntryInput[],
): Promise<MarkSheet> {
  return client().put<MarkSheet>(
    `${examPath(examId)}/sections/${encodeId(sectionId)}/subjects/${encodeId(subjectId)}/marks`,
    { entries },
  );
}

export async function submitMarkSheet(
  examId: string,
  sectionId: string,
  subjectId: string,
): Promise<MarkSheet> {
  return client().post<MarkSheet>(
    `${examPath(examId)}/sections/${encodeId(sectionId)}/subjects/${encodeId(subjectId)}/marks/submit`,
    undefined,
  );
}

export async function reopenMarkSheet(
  examId: string,
  sectionId: string,
  subjectId: string,
  reason: string,
): Promise<MarkSheet> {
  return client().post<MarkSheet>(
    `${examPath(examId)}/sections/${encodeId(sectionId)}/subjects/${encodeId(subjectId)}/marks/reopen`,
    { reason },
  );
}

export async function correctMark(
  examId: string,
  sectionId: string,
  subjectId: string,
  enrollmentId: string,
  input: {
    theory?: number;
    practical?: number;
    absent?: boolean;
    reason: string;
  },
): Promise<MarkSheet> {
  return client().patch<MarkSheet>(
    `${examPath(examId)}/sections/${encodeId(sectionId)}/subjects/${encodeId(subjectId)}/marks/${encodeId(enrollmentId)}`,
    input,
  );
}

export async function getExamProgress(examId: string): Promise<ExamProgress> {
  return client().get<ExamProgress>(`${examPath(examId)}/progress`);
}

export async function getMyExamSheets(
  examId: string,
): Promise<ExamProgressItem[]> {
  return client().get<ExamProgressItem[]>(`${examPath(examId)}/my-sheets`);
}

export async function lockExam(examId: string): Promise<Exam> {
  return client().post<Exam>(`${examPath(examId)}/lock`, undefined);
}

export async function unlockExam(
  examId: string,
  reason: string,
): Promise<Exam> {
  return client().post<Exam>(`${examPath(examId)}/unlock`, { reason });
}

export async function publishExam(
  examId: string,
): Promise<Exam> {
  return client().post<Exam>(`${examPath(examId)}/publish`, undefined);
}

export async function getMarkChanges(options: {
  examId?: string;
  sectionId?: string;
  subjectId?: string;
  studentId?: string;
  cursor?: string;
  limit?: number;
} = {}): Promise<{
  items: MarkChange[];
  meta: { limit: number; nextCursor: string | null };
}> {
  return client().get(
    `/marks/changes${queryString(options)}`,
  );
}
