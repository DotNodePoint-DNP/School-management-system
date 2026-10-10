import { createApiClient } from "@/lib/api/client";
import type { AdmissionDocument, AdmissionFormData } from "../types";

export type SubmitAdmissionRequest = {
  application: AdmissionFormData;
  documents: AdmissionDocument[];
};
export type SubmitAdmissionResponse = { id: string; status: "submitted" };

export async function submitAdmission(
  input: SubmitAdmissionRequest,
): Promise<SubmitAdmissionResponse> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "api")
    return { id: "draft-preview", status: "submitted" };
  return createApiClient().post<SubmitAdmissionResponse>("/admissions", input);
}
