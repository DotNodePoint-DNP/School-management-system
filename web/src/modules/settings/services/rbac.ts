import { createApiClient } from "@/lib/api/client";

export interface RbacRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface RbacPermissionGroup {
  module: string;
  actions: RbacPermission[];
}

export interface RbacPermission {
  id: string;
  action: string;
  description: string | null;
}

export interface CreateRbacRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRbacRoleInput {
  name?: string;
  description?: string;
}

export interface SetRbacRolePermissionsInput {
  permissions: string[];
}

export async function listRbacRoles(): Promise<RbacRole[]> {
  return createApiClient().get<RbacRole[]>("/rbac/roles");
}

export async function getRbacRole(roleId: string): Promise<RbacRole> {
  return createApiClient().get<RbacRole>(
    `/rbac/roles/${encodeURIComponent(roleId)}`,
  );
}

export async function listRbacPermissions(): Promise<RbacPermissionGroup[]> {
  return createApiClient().get<RbacPermissionGroup[]>("/rbac/permissions");
}

export async function createRbacRole(
  input: CreateRbacRoleInput,
): Promise<RbacRole> {
  return createApiClient().post<RbacRole>("/rbac/roles", input);
}

export async function updateRbacRole(
  roleId: string,
  input: UpdateRbacRoleInput,
): Promise<RbacRole> {
  return createApiClient().patch<RbacRole>(
    `/rbac/roles/${encodeURIComponent(roleId)}`,
    input,
  );
}

export async function setRbacRolePermissions(
  roleId: string,
  input: SetRbacRolePermissionsInput,
): Promise<RbacRole> {
  return createApiClient().put<RbacRole>(
    `/rbac/roles/${encodeURIComponent(roleId)}/permissions`,
    input,
  );
}

export async function deleteRbacRole(
  roleId: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/rbac/roles/${encodeURIComponent(roleId)}`,
  );
}
