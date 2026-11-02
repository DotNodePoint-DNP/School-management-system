import { createApiClient } from "@/lib/api/client";

export type SignatoryRole =
  | "PRINCIPAL"
  | "EXAM_CONTROLLER"
  | "ACCOUNTANT"
  | "OTHER";

export interface Signatory {
  id: string;
  role: SignatoryRole;
  roleLabel: string | null;
  slot: string;
  fullNameEn: string;
  fullNameNp: string | null;
  designationEn: string;
  designationNp: string | null;
  staffId: string | null;
  mode: "DIGITAL" | "LINE";
  hasSignature: boolean;
  signature: { fileId: string; sha256: string; width: number; height: number } | null;
  validFrom: string;
  validFromBs: string | null;
  validTo: string | null;
  validToBs: string | null;
  isCurrent: boolean;
}

export interface SignatoryInput {
  role: SignatoryRole;
  roleLabel?: string;
  fullNameEn?: string;
  fullNameNp?: string;
  designationEn?: string;
  designationNp?: string;
  staffId?: string;
  validFrom?: string;
  validTo?: string;
  closePrevious?: boolean;
}

export interface LetterheadPreview {
  asOf: string;
  profileVersion: number | null;
  school: Record<string, unknown>;
  logo: { sha256: string } | null;
  seal: { sha256: string } | null;
  signatures: {
    slot: string;
    nameEn: string;
    nameNp: string | null;
    designationEn: string;
    designationNp: string | null;
    mode: "DIGITAL" | "LINE";
    hasImage: boolean;
    sha256: string | null;
  }[];
  classTeacher: LetterheadPreview["signatures"][number] | null;
  warnings: string[];
}

export async function listSignatories(): Promise<Signatory[]> {
  return createApiClient().get<Signatory[]>("/school/signatories");
}

export async function getSignatory(id: string): Promise<Signatory> {
  return createApiClient().get<Signatory>(
    `/school/signatories/${encodeURIComponent(id)}`,
  );
}

export async function createSignatory(
  input: SignatoryInput,
): Promise<Signatory> {
  return createApiClient().post<Signatory>("/school/signatories", input);
}

export async function updateSignatory(
  id: string,
  input: Partial<SignatoryInput> & {
    fullNameNp?: string | null;
    designationNp?: string | null;
    staffId?: string | null;
    mode?: "DIGITAL" | "LINE";
    validTo?: string | null;
  },
): Promise<Signatory> {
  return createApiClient().patch<Signatory>(
    `/school/signatories/${encodeURIComponent(id)}`,
    input,
  );
}

export async function uploadSignatorySignature(
  id: string,
  file: File,
): Promise<Signatory> {
  const form = new FormData();
  form.set("file", file);
  return createApiClient().put<Signatory>(
    `/school/signatories/${encodeURIComponent(id)}/signature`,
    form,
  );
}

export async function removeSignatorySignature(
  id: string,
): Promise<Signatory> {
  return createApiClient().delete<Signatory>(
    `/school/signatories/${encodeURIComponent(id)}/signature`,
  );
}

export async function readSignatorySignature(id: string): Promise<Blob> {
  return createApiClient().getBlob(
    `/school/signatories/${encodeURIComponent(id)}/signature`,
    { cache: "no-store" },
  );
}

export async function getLetterheadPreview(
  query: { asOf?: string; signatures?: "auto" | "line"; slots?: string } = {},
): Promise<LetterheadPreview> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  const suffix = search ? `?${search}` : "";
  return createApiClient().get<LetterheadPreview>(
    `/school/letterhead/preview${suffix}`,
  );
}

export async function getStaffSignature(staffId: string) {
  return createApiClient().get<{
    staffId: string;
    mode: "DIGITAL" | "LINE";
    hasSignature: boolean;
    signature: Signatory["signature"];
  }>(`/staff/${encodeURIComponent(staffId)}/signature`);
}

export async function uploadStaffSignature(staffId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return createApiClient().put(
    `/staff/${encodeURIComponent(staffId)}/signature`,
    form,
  );
}

export async function setStaffSignatureMode(
  staffId: string,
  mode: "DIGITAL" | "LINE",
) {
  return createApiClient().patch(
    `/staff/${encodeURIComponent(staffId)}/signature`,
    { mode },
  );
}

export async function removeStaffSignature(staffId: string) {
  return createApiClient().delete(
    `/staff/${encodeURIComponent(staffId)}/signature`,
  );
}

export async function readStaffSignatureImage(staffId: string): Promise<Blob> {
  return createApiClient().getBlob(
    `/staff/${encodeURIComponent(staffId)}/signature/image`,
    { cache: "no-store" },
  );
}
