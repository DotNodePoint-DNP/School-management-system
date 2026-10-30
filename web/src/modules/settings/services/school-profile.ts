import { createApiClient } from "@/lib/api/client";

export interface SchoolPhone {
  label: string;
  type: "MOBILE" | "LANDLINE" | "OTHER";
  number: string;
}

export interface SchoolIdentifier {
  labelEn: string;
  labelNp?: string;
  value: string;
  showOnDocuments: boolean;
}

export interface SchoolImage {
  fileId: string;
  sha256: string;
  width: number;
  height: number;
}

export interface SchoolProfile {
  version: number;
  nameEn: string;
  nameNp: string | null;
  shortName: string | null;
  taglineEn: string | null;
  taglineNp: string | null;
  schoolType: string | null;
  establishedOn: string | null;
  establishedOnBs: string | null;
  province: string | null;
  district: string | null;
  localLevel: string | null;
  wardNo: number | null;
  tole: string | null;
  postalCode: string | null;
  addressLineNp: string | null;
  phones: SchoolPhone[];
  email: string | null;
  website: string | null;
  identifiers: SchoolIdentifier[];
  documentLanguage: "EN" | "NP" | "BOTH";
  nepaliDigits: boolean;
  admissionNoPrefix: string;
  staffNoPrefix: string;
  logo: SchoolImage | null;
  seal: SchoolImage | null;
  updatedAt: string;
}

export type UpdateSchoolProfileInput = Partial<
  Omit<
    SchoolProfile,
    | "version"
    | "establishedOnBs"
    | "logo"
    | "seal"
    | "updatedAt"
  >
> & { establishedOn?: string | null };

export type SchoolAssetKind = "logo" | "seal";

export async function getSchoolProfile(): Promise<SchoolProfile> {
  return createApiClient().get<SchoolProfile>("/school/profile");
}

export async function updateSchoolProfile(
  input: UpdateSchoolProfileInput,
): Promise<SchoolProfile> {
  return createApiClient().patch<SchoolProfile>("/school/profile", input);
}

export async function uploadSchoolAsset(
  kind: SchoolAssetKind,
  file: File,
): Promise<SchoolProfile> {
  const formData = new FormData();
  formData.append("file", file);
  return createApiClient().put<SchoolProfile>(`/school/${kind}`, formData);
}

export async function getSchoolAsset(kind: SchoolAssetKind): Promise<string> {
  const blob = await createApiClient().getBlob(`/school/assets/${kind}`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The school asset could not be displayed."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The school asset could not be read."));
    };
    reader.readAsDataURL(blob);
  });
}

export async function removeSchoolAsset(
  kind: SchoolAssetKind,
): Promise<SchoolProfile> {
  return createApiClient().delete<SchoolProfile>(`/school/${kind}`);
}
