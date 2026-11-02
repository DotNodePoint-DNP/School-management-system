import { createApiClient } from "@/lib/api/client";
import type { PromotionSummary } from "./promotion-types";
import type { PromotionClassDecisions } from "./promotion-types";

export interface PromotionQuery {
  toYearId?: string;
  sectionId?: string;
  order?: "RANK" | "ROLL";
}

function suffix(query: PromotionQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

const yearPath = (fromYearId: string) =>
  `/academic-years/${encodeURIComponent(fromYearId)}/promotion`;

export async function getPromotionSummary(
  fromYearId: string,
  query: PromotionQuery = {},
): Promise<PromotionSummary> {
  return createApiClient().get<PromotionSummary>(
    `${yearPath(fromYearId)}${suffix(query)}`,
  );
}

export async function buildPromotionPlan(
  fromYearId: string,
  toYearId: string,
): Promise<PromotionSummary> {
  return createApiClient().post<PromotionSummary>(yearPath(fromYearId), {
    toYearId,
  });
}

export async function getPromotionClassDecisions(
  fromYearId: string,
  classId: string,
  query: PromotionQuery = {},
): Promise<PromotionClassDecisions> {
  return createApiClient().get<PromotionClassDecisions>(
    `${yearPath(fromYearId)}/classes/${encodeURIComponent(classId)}${suffix(query)}`,
  );
}

export async function updatePromotionDecision(
  fromYearId: string,
  enrollmentId: string,
  input: {
    action?: "PROMOTE" | "REPEAT" | "GRADUATE" | "HOLD";
    toClassId?: string;
    toSectionId?: string | null;
    note?: string | null;
  },
  query: PromotionQuery = {},
): Promise<PromotionClassDecisions["students"][number]> {
  return createApiClient().patch(
    `${yearPath(fromYearId)}/decisions/${encodeURIComponent(enrollmentId)}${suffix(query)}`,
    input,
  );
}

export interface PromotionApplyResponse {
  status: "DRAFT" | "APPLYING" | "APPLIED";
  remaining: number;
  totals: {
    moved: number;
    graduated: number;
    blocked: number;
    optionalCarried: number;
    optionalDropped: number;
  };
  chunks: {
    sectionId: string;
    moved: number;
    graduated: number;
    blocked: { enrollmentId: string; admissionNo: string; reason: string }[];
    optionalCarried: number;
    optionalDropped: number;
  }[];
  errors: { sectionId: string; message: string }[];
}

export async function applyPromotion(
  fromYearId: string,
  input: {
    toYearId?: string;
    classId?: string;
    acknowledgeEarly?: boolean;
  },
): Promise<PromotionApplyResponse> {
  return createApiClient().post(`${yearPath(fromYearId)}/apply`, input);
}

export async function finalizePromotionRolls(
  fromYearId: string,
  input: { toYearId?: string; sectionId?: string },
): Promise<{ sections: { sectionId: string; sectionName: string; className: string; students: number }[] }> {
  return createApiClient().post(
    `${yearPath(fromYearId)}/finalize-rolls`,
    input,
  );
}

export async function undoPromotionDecision(
  fromYearId: string,
  enrollmentId: string,
  query: PromotionQuery = {},
): Promise<{ enrollmentId: string; undone: string }> {
  return createApiClient().post(
    `${yearPath(fromYearId)}/decisions/${encodeURIComponent(enrollmentId)}/undo${suffix(query)}`,
    {},
  );
}
