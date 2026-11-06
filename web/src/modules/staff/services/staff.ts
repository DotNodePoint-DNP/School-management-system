import { createApiClient } from "@/lib/api/client";

export type StaffKind = "TEACHING" | "NON_TEACHING";
export type StaffStatus = "ACTIVE" | "LEFT";
export type StaffGender = "MALE" | "FEMALE" | "OTHER";

export interface StaffRecord {
  id: string;
  staffNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullNameNp: string | null;
  kind: StaffKind;
  designation: string | null;
  status: StaffStatus;
  hasLogin: boolean;
}

export interface StaffDetails extends StaffRecord {
  gender: StaffGender;
  dateOfBirth: string | null;
  dateOfBirthBs: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  joinDate: string;
  joinDateBs: string | null;
  leftOn: string | null;
  leftOnBs: string | null;
  statusNote: string | null;
}

export interface StaffInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  fullNameNp?: string;
  gender: StaffGender;
  dateOfBirth?: string;
  joinDate: string;
  phone?: string;
  email?: string;
  address?: string;
  kind: StaffKind;
  designation?: string;
  staffNo?: string;
}

export type StaffUpdateInput = Partial<StaffInput>;

export interface StaffLeaveInput {
  leftOn?: string;
  reason: string;
}

export interface StaffListQuery {
  page: number;
  pageSize: number;
  search?: string;
  kind?: StaffKind;
  status?: StaffStatus;
  sortBy?: "name" | "staffNo" | "joinDate";
  sortOrder?: "asc" | "desc";
}

export interface StaffLoginResult {
  staff: StaffDetails;
  temporaryPassword: string;
}

function queryString(query: StaffListQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

const staffPath = (id: string) => `/staff/${encodeURIComponent(id)}`;

export async function listStaff(query: StaffListQuery) {
  return createApiClient().getPaginated<StaffRecord>(
    `/staff${queryString(query)}`,
  );
}

export async function getStaff(id: string): Promise<StaffDetails> {
  return createApiClient().get<StaffDetails>(staffPath(id));
}

export async function createStaff(input: StaffInput): Promise<StaffDetails> {
  return createApiClient().post<StaffDetails>("/staff", input);
}

export async function updateStaff(
  id: string,
  input: StaffUpdateInput,
): Promise<StaffDetails> {
  return createApiClient().patch<StaffDetails>(staffPath(id), input);
}

export async function markStaffLeft(
  id: string,
  input: StaffLeaveInput,
): Promise<StaffDetails> {
  return createApiClient().post<StaffDetails>(`${staffPath(id)}/leave`, input);
}

export async function reactivateStaff(id: string): Promise<StaffDetails> {
  return createApiClient().post<StaffDetails>(
    `${staffPath(id)}/reactivate`,
    {},
  );
}

export async function createStaffLogin(
  id: string,
  roleIds: string[],
): Promise<StaffLoginResult> {
  return createApiClient().post<StaffLoginResult>(
    `${staffPath(id)}/create-login`,
    { roleIds },
  );
}

export async function deleteStaff(
  id: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(staffPath(id));
}
