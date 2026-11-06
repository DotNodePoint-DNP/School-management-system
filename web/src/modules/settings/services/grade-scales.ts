import { createApiClient } from "@/lib/api/client";

export interface GradeBand {
  grade: string;
  minPercent: number;
  belowPercent: number | null;
  gradePoint: number;
  description: string;
  isPass: boolean;
}

export interface GradeScale {
  id: string;
  name: string;
  isDefault: boolean;
  policyCount: number;
  bands: GradeBand[];
}

export interface GradeBandInput {
  grade: string;
  minPercent: number;
  gradePoint: number;
  description: string;
  isPass: boolean;
}

export interface CreateGradeScaleInput {
  name: string;
  bands: GradeBandInput[];
}

export interface ReplaceGradeScaleInput {
  name?: string;
  bands: GradeBandInput[];
}

export async function listGradeScales(): Promise<GradeScale[]> {
  return createApiClient().get<GradeScale[]>("/grade-scales");
}

export async function getGradeScale(id: string): Promise<GradeScale> {
  return createApiClient().get<GradeScale>(
    `/grade-scales/${encodeURIComponent(id)}`,
  );
}

export async function createGradeScale(
  input: CreateGradeScaleInput,
): Promise<GradeScale> {
  return createApiClient().post<GradeScale>("/grade-scales", input);
}

export async function replaceGradeScale(
  id: string,
  input: ReplaceGradeScaleInput,
): Promise<GradeScale> {
  return createApiClient().put<GradeScale>(
    `/grade-scales/${encodeURIComponent(id)}`,
    input,
  );
}

export async function copyGradeScale(
  id: string,
  name: string,
): Promise<GradeScale> {
  return createApiClient().post<GradeScale>(
    `/grade-scales/${encodeURIComponent(id)}/copy`,
    { name },
  );
}

export async function setDefaultGradeScale(id: string): Promise<GradeScale> {
  return createApiClient().post<GradeScale>(
    `/grade-scales/${encodeURIComponent(id)}/set-default`,
    undefined,
  );
}

export async function deleteGradeScale(
  id: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/grade-scales/${encodeURIComponent(id)}`,
  );
}
