import { createApiClient } from "@/lib/api/client";

export interface AcademicTerm {
  id: string;
  name: string;
  sequence: number;
  startDate: string;
  startDateBs: string | null;
  endDate: string;
  endDateBs: string | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED";
  startDate: string;
  startDateBs: string | null;
  endDate: string;
  endDateBs: string | null;
  terms: AcademicTerm[];
}

export interface AcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
}

export type AcademicYearUpdateInput = Partial<AcademicYearInput>;

export interface AcademicTermInput {
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
}

export type AcademicTermUpdateInput = Partial<AcademicTermInput>;

export interface SchoolSection {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

export interface SchoolClass {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  sections: SchoolSection[];
  nextClassId: string | null;
  nextClass: { id: string; name: string } | null;
}

export interface SchoolClassInput {
  name: string;
  sortOrder: number;
}

export interface SchoolClassUpdateInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface SchoolSectionInput {
  name: string;
  capacity?: number;
}

export interface SchoolSectionUpdateInput {
  name?: string;
  capacity?: number | null;
  isActive?: boolean;
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  return createApiClient().get<AcademicYear[]>("/academic-years");
}

export async function createAcademicYear(
  input: AcademicYearInput,
): Promise<AcademicYear> {
  return createApiClient().post<AcademicYear>("/academic-years", input);
}

export async function updateAcademicYear(
  id: string,
  input: AcademicYearUpdateInput,
): Promise<AcademicYear> {
  return createApiClient().patch<AcademicYear>(
    `/academic-years/${encodeURIComponent(id)}`,
    input,
  );
}

export async function deleteAcademicYear(
  id: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/academic-years/${encodeURIComponent(id)}`,
  );
}

export async function createAcademicTerm(
  yearId: string,
  input: AcademicTermInput,
): Promise<AcademicTerm> {
  return createApiClient().post<AcademicTerm>(
    `/academic-years/${encodeURIComponent(yearId)}/terms`,
    input,
  );
}

export async function updateAcademicTerm(
  yearId: string,
  termId: string,
  input: AcademicTermUpdateInput,
): Promise<AcademicTerm> {
  return createApiClient().patch<AcademicTerm>(
    `/academic-years/${encodeURIComponent(yearId)}/terms/${encodeURIComponent(termId)}`,
    input,
  );
}

export async function deleteAcademicTerm(
  yearId: string,
  termId: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/academic-years/${encodeURIComponent(yearId)}/terms/${encodeURIComponent(termId)}`,
  );
}

export async function listSchoolClasses(): Promise<SchoolClass[]> {
  return createApiClient().get<SchoolClass[]>("/classes");
}

export async function createSchoolClass(
  input: SchoolClassInput,
): Promise<SchoolClass> {
  return createApiClient().post<SchoolClass>("/classes", input);
}

export async function updateSchoolClass(
  id: string,
  input: SchoolClassUpdateInput,
): Promise<SchoolClass> {
  return createApiClient().patch<SchoolClass>(
    `/classes/${encodeURIComponent(id)}`,
    input,
  );
}

export async function deleteSchoolClass(
  id: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/classes/${encodeURIComponent(id)}`,
  );
}

export async function createSchoolSection(
  classId: string,
  input: SchoolSectionInput,
): Promise<SchoolSection> {
  return createApiClient().post<SchoolSection>(
    `/classes/${encodeURIComponent(classId)}/sections`,
    input,
  );
}

export async function updateSchoolSection(
  classId: string,
  sectionId: string,
  input: SchoolSectionUpdateInput,
): Promise<SchoolSection> {
  return createApiClient().patch<SchoolSection>(
    `/classes/${encodeURIComponent(classId)}/sections/${encodeURIComponent(sectionId)}`,
    input,
  );
}

export async function deleteSchoolSection(
  classId: string,
  sectionId: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/classes/${encodeURIComponent(classId)}/sections/${encodeURIComponent(sectionId)}`,
  );
}
