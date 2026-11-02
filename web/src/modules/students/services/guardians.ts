import { createApiClient } from "@/lib/api/client";

export interface GuardianSummary {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  fullNameNp: string | null;
  phone: string | null;
  email: string | null;
  hasLogin: boolean;
  childrenCount: number;
}

export interface GuardianDetails extends GuardianSummary {
  occupation: string | null;
  address: string | null;
  children: {
    studentId: string;
    admissionNo: string;
    name: string;
    relationship: string;
    isPrimary: boolean;
  }[];
}

export interface GuardianListQuery {
  page: number;
  pageSize: number;
  search?: string;
  phone?: string;
}

export interface GuardianUpdateInput {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullNameNp?: string;
  phone?: string;
  email?: string;
  occupation?: string;
  address?: string;
}

export interface GuardianLoginOutcome {
  status: string;
  message?: string;
  temporaryPassword?: string;
}

function queryString(query: GuardianListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

const guardianPath = (id: string) => `/guardians/${encodeURIComponent(id)}`;

export async function listGuardians(query: GuardianListQuery) {
  return createApiClient().getPaginated<GuardianSummary>(
    `/guardians${queryString(query)}`,
  );
}

export async function getGuardian(id: string): Promise<GuardianDetails> {
  return createApiClient().get<GuardianDetails>(guardianPath(id));
}

export async function updateGuardian(
  id: string,
  input: GuardianUpdateInput,
): Promise<GuardianDetails> {
  return createApiClient().patch<GuardianDetails>(guardianPath(id), input);
}

export async function createGuardianLogin(
  id: string,
  phoneConfirmed: boolean,
): Promise<GuardianLoginOutcome> {
  return createApiClient().post<GuardianLoginOutcome>(
    `${guardianPath(id)}/create-login`,
    { phoneConfirmed },
  );
}

export async function resendGuardianCredentials(
  id: string,
): Promise<GuardianLoginOutcome> {
  return createApiClient().post<GuardianLoginOutcome>(
    `${guardianPath(id)}/resend-credentials`,
    {},
  );
}
