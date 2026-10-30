"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import {
  createRbacRole,
  deleteRbacRole,
  listRbacPermissions,
  listRbacRoles,
  setRbacRolePermissions,
  updateRbacRole,
  type RbacRole,
} from "@/modules/settings/services/rbac";
import { useAuthStore } from "@/modules/auth/store/auth-store";

const rolesQueryKey = ["rbac", "roles"];
const permissionsQueryKey = ["rbac", "permissions"];

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.status === 403
      ? "You do not have permission to access this RBAC operation."
      : error.message;
  }
  return error instanceof Error ? error.message : "The request failed.";
}

export function RolesPermissionMatrix() {
  const queryClient = useQueryClient();
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canManage = permissions.includes("roles:manage");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const rolesQuery = useQuery({
    queryKey: rolesQueryKey,
    queryFn: listRbacRoles,
  });
  const permissionsQuery = useQuery({
    queryKey: permissionsQueryKey,
    queryFn: listRbacPermissions,
  });
  const selectedRole = rolesQuery.data?.find(
    (role) => role.id === selectedRoleId,
  );
  const canEditRoleDetails =
    canManage && (!selectedRole || !selectedRole.isSystem);
  const canEditRolePermissions =
    canManage && selectedRole?.name !== "ADMIN";

  const createMutation = useMutation({
    mutationFn: createRbacRole,
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      setSelectedRoleId(role.id);
      setIsCreating(false);
      setName("");
      setDescription("");
      setSelectedPermissions([]);
      setNotice(`Role "${role.name}" created.`);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      roleId,
      input,
    }: {
      roleId: string;
      input: { name: string; description: string };
    }) => updateRbacRole(roleId, input),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      setNotice(`Role "${role.name}" updated.`);
    },
  });
  const permissionsMutation = useMutation({
    mutationFn: ({
      roleId,
      permissions: rolePermissions,
    }: {
      roleId: string;
      permissions: string[];
    }) => setRbacRolePermissions(roleId, { permissions: rolePermissions }),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      setNotice(`Permissions for "${role.name}" updated.`);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteRbacRole,
    onSuccess: async (_result, roleId) => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      if (selectedRoleId === roleId) {
        setSelectedRoleId(null);
      }
      setNotice("Role deleted.");
    },
  });

  const groups = useMemo(
    () => permissionsQuery.data ?? [],
    [permissionsQuery.data],
  );
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    permissionsMutation.isPending ||
    deleteMutation.isPending;
  const mutationError =
    createMutation.error ??
    updateMutation.error ??
    permissionsMutation.error ??
    deleteMutation.error;

  function startCreate() {
    setNotice("");
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setSelectedRoleId(null);
    setIsCreating(true);
  }

  function selectRole(role: RbacRole) {
    setNotice("");
    setSelectedRoleId(role.id);
    setIsCreating(false);
    setName(role.name);
    setDescription(role.description ?? "");
    setSelectedPermissions(role.permissions);
  }

  function togglePermission(code: string) {
    setSelectedPermissions((current) =>
      current.includes(code)
        ? current.filter((permission) => permission !== code)
        : [...current, code],
    );
  }

  function saveRole() {
    setNotice("");
    if (isCreating) {
      createMutation.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: selectedPermissions,
      });
    } else if (selectedRole) {
      updateMutation.mutate({
        roleId: selectedRole.id,
        input: { name: name.trim(), description: description.trim() },
      });
    }
  }

  function savePermissions() {
    if (!selectedRole) return;
    setNotice("");
    permissionsMutation.mutate({
      roleId: selectedRole.id,
      permissions: selectedPermissions,
    });
  }

  function removeRole() {
    if (!selectedRole || selectedRole.isSystem || isPending) return;
    if (window.confirm(`Delete the "${selectedRole.name}" role?`)) {
      setNotice("");
      deleteMutation.mutate(selectedRole.id);
    }
  }

  return (
    <section className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
          <p className="mt-1 text-sm text-muted">
            Manage roles and the permissions available to each role.
          </p>
        </div>
        {canManage && (
          <button
            className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
            disabled={isPending}
            onClick={startCreate}
            type="button"
          >
            Create role
          </button>
        )}
      </header>

      {rolesQuery.isPending || permissionsQuery.isPending ? (
        <p role="status" className="text-sm text-muted">
          Loading roles and permissions…
        </p>
      ) : rolesQuery.isError || permissionsQuery.isError ? (
        <div className="rounded-md border border-coral bg-panel p-4 text-sm text-coral" role="alert">
          <p>
            {errorMessage(rolesQuery.error ?? permissionsQuery.error)}
          </p>
          <button
            className="mt-2 font-medium text-navy underline dark:text-teal"
            onClick={() => {
              void rolesQuery.refetch();
              void permissionsQuery.refetch();
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(220px,0.8fr)_2fr]">
          <aside className="space-y-3">
            <h2 className="text-sm font-semibold">Available roles</h2>
            {rolesQuery.data?.length ? (
              <ul className="space-y-2">
                {rolesQuery.data.map((role) => (
                  <li key={role.id}>
                    <button
                      aria-pressed={selectedRoleId === role.id}
                      className="w-full rounded-md border border-line bg-panel p-3 text-left transition-colors hover:border-teal hover:bg-mint aria-pressed:border-teal aria-pressed:bg-mint dark:hover:bg-mint"
                      onClick={() => selectRole(role)}
                      type="button"
                    >
                      <span className="block font-medium">{role.name}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {role.userCount} assigned · {role.permissions.length}{" "}
                        permissions
                        {role.isSystem ? " · System role" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No roles found.</p>
            )}
          </aside>

          <div className="min-w-0 space-y-5">
            {isCreating || selectedRole ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">
                    {isCreating ? "Create a role" : selectedRole?.name}
                  </h2>
                  {!isCreating && selectedRole && canManage && (
                    <button
                      className="rounded-md border border-coral px-3 py-1.5 text-sm text-coral transition-colors hover:bg-coral/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-50"
                      disabled={isPending || selectedRole.isSystem}
                      onClick={removeRole}
                      type="button"
                    >
                      Delete role
                    </button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span>Role name</span>
                    <input
                      className="w-full rounded-md border border-line bg-panel px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                      disabled={!canEditRoleDetails || isPending}
                      maxLength={50}
                      onChange={(event) => setName(event.target.value)}
                      required
                      value={name}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Description</span>
                    <input
                      className="w-full rounded-md border border-line bg-panel px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                      disabled={!canEditRoleDetails || isPending}
                      maxLength={255}
                      onChange={(event) => setDescription(event.target.value)}
                      value={description}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium">Permissions</h3>
                    <p className="text-xs text-muted">
                      Select the access this role should have.
                    </p>
                  </div>
                  {groups.map((group) => (
                    <fieldset
                      className="rounded-md border border-line bg-panel p-4"
                      key={group.module}
                    >
                      <legend className="px-1 text-sm font-semibold capitalize">
                        {group.module.replaceAll("-", " ")}
                      </legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.actions.map((action) => {
                          const code = `${group.module}:${action.action}`;
                          return (
                            <label
                              className="flex items-start gap-2 text-sm"
                              key={action.id}
                            >
                              <input
                                checked={selectedPermissions.includes(code)}
                                className="mt-0.5 accent-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                                disabled={!canEditRolePermissions || isPending}
                                onChange={() => togglePermission(code)}
                                type="checkbox"
                              />
                              <span>
                                <span className="block">{action.action}</span>
                                {action.description && (
                                  <span className="block text-xs text-muted">
                                    {action.description}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-3">
                    {canEditRoleDetails && (
                      <button
                        className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
                        disabled={isPending || name.trim().length < 2}
                        onClick={saveRole}
                        type="button"
                      >
                        {isCreating ? "Create role" : "Save role details"}
                      </button>
                    )}
                    {!isCreating && canEditRolePermissions && (
                      <button
                        className="rounded-md border border-line bg-panel px-4 py-2 text-sm font-medium transition-colors hover:border-teal hover:bg-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
                        disabled={isPending}
                        onClick={savePermissions}
                        type="button"
                      >
                        Save permissions
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">
                Select a role to view its permissions
                {canManage ? " or create a new role." : "."}
              </div>
            )}
          </div>
        </div>
      )}

      {mutationError && (
        <p className="rounded-md border border-coral bg-panel p-3 text-sm text-coral" role="alert">
          {errorMessage(mutationError)}
        </p>
      )}
      {notice && (
        <p className="text-sm text-teal" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
