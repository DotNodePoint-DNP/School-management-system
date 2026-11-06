import { createApiClient } from "@/lib/api/client";

export interface Subject {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface CurriculumSubject {
  subjectId: string;
  code: string;
  name: string;
  isActive: boolean;
  isCompulsory: boolean;
  creditHours: number | null;
}

export interface Curriculum {
  academicYearId: string;
  classId: string;
  subjects: CurriculumSubject[];
}

export interface SubjectInput {
  code: string;
  name: string;
}

export async function listSubjects(options: {
  isActive?: boolean;
  search?: string;
} = {}): Promise<Subject[]> {
  const query = new URLSearchParams();
  if (options.isActive !== undefined) query.set("isActive", String(options.isActive));
  if (options.search) query.set("search", options.search);
  const search = query.toString();
  const suffix = search ? `?${search}` : "";
  return createApiClient().get<Subject[]>(`/subjects${suffix}`);
}

export async function getSubject(subjectId: string): Promise<Subject> {
  return createApiClient().get<Subject>(
    `/subjects/${encodeURIComponent(subjectId)}`,
  );
}

export async function createSubject(input: SubjectInput): Promise<Subject> {
  return createApiClient().post<Subject>("/subjects", input);
}

export async function updateSubject(
  subjectId: string,
  input: Partial<SubjectInput> & { isActive?: boolean },
): Promise<Subject> {
  return createApiClient().patch<Subject>(
    `/subjects/${encodeURIComponent(subjectId)}`,
    input,
  );
}

export async function deleteSubject(
  subjectId: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/subjects/${encodeURIComponent(subjectId)}`,
  );
}

export async function getCurriculum(
  academicYearId: string,
  classId: string,
): Promise<Curriculum> {
  return createApiClient().get<Curriculum>(
    `/academic-years/${encodeURIComponent(academicYearId)}/classes/${encodeURIComponent(classId)}/subjects`,
  );
}

export async function replaceCurriculum(
  academicYearId: string,
  classId: string,
  subjects: { subjectId: string; isCompulsory: boolean }[],
): Promise<Curriculum> {
  return createApiClient().put<Curriculum>(
    `/academic-years/${encodeURIComponent(academicYearId)}/classes/${encodeURIComponent(classId)}/subjects`,
    { subjects },
  );
}

export async function copyCurriculum(
  academicYearId: string,
  sourceYearId: string,
): Promise<{ copied: number; alreadyPresent: number; skippedInactive: number }> {
  return createApiClient().post(
    `/academic-years/${encodeURIComponent(academicYearId)}/copy-subjects-from/${encodeURIComponent(sourceYearId)}`,
    {},
  );
}

export async function setCurriculumCreditHours(
  academicYearId: string,
  classId: string,
  subjectId: string,
  creditHours: number | null,
): Promise<Curriculum> {
  return createApiClient().patch<Curriculum>(
    `/academic-years/${encodeURIComponent(academicYearId)}/classes/${encodeURIComponent(classId)}/subjects/${encodeURIComponent(subjectId)}`,
    { creditHours },
  );
}
