import type {
  AcademicYear,
  SchoolClass,
} from "@/modules/settings/services/academic-setup";
import { client, encodeId, examPath } from "./client";

export type ExamStatus = "DRAFT" | "OPEN" | "LOCKED" | "PUBLISHED";

export interface Exam {
  id: string;
  academicYearId: string;
  name: string;
  sequence: number;
  isFinal: boolean;
  status: ExamStatus;
  term: { id: string; name: string } | null;
  subjectSetupCount: number;
}

export interface ExamSubjectSetup {
  subjectId: string;
  code: string;
  name: string;
  isCompulsory: boolean;
  creditHours: number | null;
  fullTheory: number;
  passTheory: number;
  fullPractical: number | null;
  passPractical: number | null;
  totalFull: number;
  examDate: string | null;
  examDateBs: string | null;
}

export interface ExamClassSetup {
  examId: string;
  classId: string;
  subjects: ExamSubjectSetup[];
}

export interface CurriculumSubject {
  subjectId: string;
  code: string;
  name: string;
  isActive: boolean;
  isCompulsory: boolean;
  creditHours: number | null;
}

export interface ExamInput {
  name: string;
  sequence: number;
  termId?: string | null;
  isFinal?: boolean;
}

export interface ExamSubjectInput {
  subjectId: string;
  fullTheory: number;
  passTheory?: number;
  fullPractical?: number | null;
  passPractical?: number | null;
  examDate?: string;
}

export async function listExamYears(): Promise<AcademicYear[]> {
  return client().get<AcademicYear[]>("/academic-years");
}

export async function listExamClasses(): Promise<SchoolClass[]> {
  return client().get<SchoolClass[]>("/classes");
}

export async function listExams(yearId: string): Promise<Exam[]> {
  return client().get<Exam[]>(`/academic-years/${encodeId(yearId)}/exams`);
}

export async function createExam(
  yearId: string,
  input: ExamInput,
): Promise<Exam> {
  return client().post<Exam>(
    `/academic-years/${encodeId(yearId)}/exams`,
    input,
  );
}

export async function updateExam(
  examId: string,
  input: Partial<ExamInput>,
): Promise<Exam> {
  return client().patch<Exam>(examPath(examId), input);
}

export async function deleteExam(examId: string): Promise<{ deleted: true }> {
  return client().delete<{ deleted: true }>(examPath(examId));
}

export async function openExam(examId: string): Promise<Exam> {
  return client().post<Exam>(`${examPath(examId)}/open`, undefined);
}

export async function getExamSetup(
  examId: string,
  classId: string,
): Promise<ExamClassSetup> {
  return client().get<ExamClassSetup>(
    `${examPath(examId)}/classes/${encodeId(classId)}/subjects`,
  );
}

export async function getCurriculumSubjects(
  yearId: string,
  classId: string,
): Promise<{ subjects: CurriculumSubject[] }> {
  return client().get<{ subjects: CurriculumSubject[] }>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/subjects`,
  );
}

export async function saveExamSetup(
  examId: string,
  classId: string,
  subjects: ExamSubjectInput[],
): Promise<ExamClassSetup> {
  return client().put<ExamClassSetup>(
    `${examPath(examId)}/classes/${encodeId(classId)}/subjects`,
    { subjects },
  );
}

export async function copyExamSetup(
  examId: string,
  sourceExamId: string,
  classIds?: string[],
): Promise<{ copied: number; alreadyPresent: number; skipped: number }> {
  return client().post(
    `${examPath(examId)}/copy-setup-from/${encodeId(sourceExamId)}`,
    classIds ? { classIds } : undefined,
  );
}

export type {
  AcademicYear,
  SchoolClass,
  SchoolSection,
} from "@/modules/settings/services/academic-setup";
