import type { GradeScale } from "@/modules/settings/services/grade-scales";
import { client, encodeId, queryString } from "./client";

export interface ResultPolicy {
  source: "EXPLICIT" | "DEFAULT";
  academicYearId: string;
  classId: string;
  gradeScale: { id: string; name: string };
  components: {
    examId: string;
    examName: string;
    sequence: number;
    status: string;
    weightPercent: number;
  }[];
}

export interface ResultStudent {
  enrollmentId: string;
  studentId: string | null;
  admissionNo: string | null;
  name: string | null;
  rollNo: number | null;
  sectionId: string;
  status: string;
  percentage: number | null;
  totalMarks: number | null;
  totalFull: number | null;
  gpa: number | null;
  sectionRank: number | null;
  classRank: number | null;
  failedSubjects: string[];
  missing: string[];
}

export interface ResultRun {
  version: number;
  revised: boolean;
  reason: string | null;
  createdAt: string;
  createdByName: string | null;
  warnings: string[];
}

export interface RollOrderResponse {
  version: number;
  scope: "SECTION" | "CLASS";
  order: {
    position: number;
    enrollmentId: string;
    studentId: string | null;
    admissionNo: string | null;
    name: string | null;
    rank: number | null;
    status: string;
  }[];
}

export interface ResultPreview {
  source: string;
  academicYearId: string;
  classId: string;
  gradeScale: { id: string; name: string };
  components: { examId: string; examName: string; weightPercent: number }[];
  warnings: string[];
  summary: { students: number; pass: number; fail: number; incomplete: number };
  students: ResultStudent[];
}

export interface PublishedResults {
  run: { version: number; createdAt?: string; [key: string]: unknown };
  students: ResultStudent[];
}

export interface GradePolicyUpdate {
  gradeScaleId: string;
  components: { examId: string; weightPercent: number }[];
}

export async function listResultPolicies(
  yearId: string,
): Promise<
  {
    classId: string;
    className: string;
    gradeScale: { id: string; name: string };
    components: ResultPolicy["components"];
  }[]
> {
  return client().get(`/academic-years/${encodeId(yearId)}/result-policies`);
}

export async function getResultPolicy(
  yearId: string,
  classId: string,
): Promise<ResultPolicy> {
  return client().get<ResultPolicy>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/result-policy`,
  );
}

export async function setResultPolicy(
  yearId: string,
  classId: string,
  input: GradePolicyUpdate,
): Promise<ResultPolicy> {
  return client().put<ResultPolicy>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/result-policy`,
    input,
  );
}

export async function deleteResultPolicy(
  yearId: string,
  classId: string,
): Promise<{ deleted: true }> {
  return client().delete<{ deleted: true }>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/result-policy`,
  );
}

export async function previewResults(
  yearId: string,
  classId: string,
  examId?: string,
): Promise<ResultPreview> {
  return client().get<ResultPreview>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/results/preview${queryString({ examId })}`,
  );
}

export async function getPublishedResults(
  yearId: string,
  classId: string,
  options: { examId?: string; sectionId?: string; version?: number } = {},
): Promise<PublishedResults> {
  return client().get<PublishedResults>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/results${queryString(options)}`,
  );
}

export async function listResultRuns(
  yearId: string,
  classId: string,
  examId?: string,
): Promise<ResultRun[]> {
  return client().get<ResultRun[]>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/results/runs${queryString({ examId })}`,
  );
}

export async function getRollOrder(
  yearId: string,
  classId: string,
  sectionId?: string,
): Promise<RollOrderResponse> {
  return client().get<RollOrderResponse>(
    `/academic-years/${encodeId(yearId)}/classes/${encodeId(classId)}/results/roll-order${queryString({ sectionId })}`,
  );
}

export async function getResultsRemarks(
  yearId: string,
  sectionId: string,
  examId?: string,
): Promise<{
  entries: { enrollmentId: string; remark: string | null; updatedAt: string | null }[];
  [key: string]: unknown;
}> {
  return client().get(
    `/academic-years/${encodeId(yearId)}/sections/${encodeId(sectionId)}/remarks${queryString({ examId })}`,
  );
}

export async function saveResultsRemarks(
  yearId: string,
  sectionId: string,
  entries: { enrollmentId: string; remark: string | null }[],
  examId?: string,
): Promise<unknown> {
  return client().put(
    `/academic-years/${encodeId(yearId)}/sections/${encodeId(sectionId)}/remarks${queryString({ examId })}`,
    { entries },
  );
}

export type { GradeScale };
