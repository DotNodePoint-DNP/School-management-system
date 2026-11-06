import { createApiClient } from "@/lib/api/client";
import type { RbacRole } from "./rbac";

export interface UserRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Pick<RbacRole, "id" | "name">[];
}

export interface UserListQuery {
  page: number;
  pageSize: number;
  search?: string;
  roleId?: string;
  isActive?: boolean;
  sortBy?: "fullName" | "createdAt" | "lastLoginAt";
  sortOrder?: "asc" | "desc";
}

export interface CreateUserInput {
  fullName: string;
  email?: string;
  phone?: string;
  roleIds: string[];
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  phone?: string;
}

export interface CreateUserResponse {
  user: UserRecord;
  temporaryPassword: string;
}

export interface ResetPasswordResponse {
  temporaryPassword: string;
}

function queryString(query: UserListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

const userPath = (id: string) => `/users/${encodeURIComponent(id)}`;

export async function listUsers(query: UserListQuery) {
  return createApiClient().getPaginated<UserRecord>(
    `/users${queryString(query)}`,
  );
}

export async function getUser(id: string): Promise<UserRecord> {
  return createApiClient().get<UserRecord>(userPath(id));
}

export async function createUser(
  input: CreateUserInput,
): Promise<CreateUserResponse> {
  return createApiClient().post<CreateUserResponse>("/users", input);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<UserRecord> {
  return createApiClient().patch<UserRecord>(userPath(id), input);
}

export async function setUserRoles(
  id: string,
  roleIds: string[],
): Promise<UserRecord> {
  return createApiClient().put<UserRecord>(`${userPath(id)}/roles`, { roleIds });
}

export async function deactivateUser(id: string): Promise<UserRecord> {
  return createApiClient().post<UserRecord>(`${userPath(id)}/deactivate`, {});
}

export async function activateUser(id: string): Promise<UserRecord> {
  return createApiClient().post<UserRecord>(`${userPath(id)}/activate`, {});
}

export async function resetUserPassword(
  id: string,
): Promise<ResetPasswordResponse> {
  return createApiClient().post<ResetPasswordResponse>(
    `${userPath(id)}/reset-password`,
    {},
  );
}
