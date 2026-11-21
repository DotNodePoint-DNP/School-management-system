"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
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

export function RolesPermissionMatrix({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
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
  const canEditRolePermissions = canManage && selectedRole?.name !== "ADMIN";

  const createMutation = useMutation({
    mutationFn: createRbacRole,
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      selectRole(role);
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

  const groups = permissionsQuery.data ?? [];
  const permissionsChanged =
    selectedRole &&
    (selectedPermissions.length !== selectedRole.permissions.length ||
      selectedPermissions.some(
        (code) => !selectedRole.permissions.includes(code),
      ));
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
        <div
          className="rounded-md border border-coral bg-panel p-4 text-sm text-coral"
          role="alert"
        >
          <p>{errorMessage(rolesQuery.error ?? permissionsQuery.error)}</p>
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
                      disabled={isPending}
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
              <div key={selectedRole?.id ?? "create"} className="space-y-5">
                <section className="space-y-4 rounded-xl border border-line bg-panel p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="break-words text-xl font-semibold text-ink">
                      {isCreating ? "Create a role" : selectedRole?.name}
                    </h2>
                    {selectedRole && !selectedRole.isSystem && canManage && (
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

                  {selectedRole && (
                    <>
                      {selectedRole.description && (
                        <p className="text-sm text-muted">
                          {selectedRole.description}
                        </p>
                      )}
                      <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-muted">Role type</dt>
                          <dd className="mt-1 font-semibold">
                            {selectedRole.isSystem ? "System" : "Custom"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Assigned users</dt>
                          <dd className="mt-1 font-semibold">
                            {selectedRole.userCount}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Saved permissions</dt>
                          <dd className="mt-1 font-semibold">
                            {selectedRole.permissions.length}
                          </dd>
                        </div>
                      </dl>
                    </>
                  )}
                  {canEditRoleDetails && (
                    <details open={isCreating || undefined}>
                      {!isCreating && (
                        <summary className="cursor-pointer rounded text-sm font-semibold text-teal focus-visible:outline-teal">
                          Edit role details
                        </summary>
                      )}
                      {isCreating && (
                        <summary className="cursor-pointer font-medium">
                          Role details
                        </summary>
                      )}
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
                            onChange={(event) =>
                              setDescription(event.target.value)
                            }
                            value={description}
                          />
                        </label>
                      </div>
                      {!isCreating && (
                        <button
                          type="button"
                          onClick={saveRole}
                          disabled={
                            isPending ||
                            name.trim().length < 2 ||
                            (name.trim() === selectedRole?.name &&
                              description.trim() ===
                                (selectedRole.description ?? ""))
                          }
                          className="mt-3 rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-teal disabled:opacity-50"
                        >
                          Save role details
                        </button>
                      )}
                    </details>
                  )}
                </section>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Module permissions
                      </h3>
                      <p className="text-xs text-muted">
                        {selectedPermissions.length} selected across all modules
                        {permissionsChanged ? " · Unsaved changes" : ""}
                      </p>
                    </div>
                    {canEditRolePermissions && (
                      <button
                        type="button"
                        onClick={isCreating ? saveRole : savePermissions}
                        disabled={
                          isPending ||
                          (isCreating
                            ? name.trim().length < 2
                            : !permissionsChanged)
                        }
                        className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy focus-visible:outline-teal disabled:opacity-50"
                      >
                        {isCreating ? "Create role" : "Save permissions"}
                      </button>
                    )}
                  </div>
                  {selectedPermissions.some((code) =>
                    ["marks:enter", "marks:read"].includes(code),
                  ) &&
                    !selectedPermissions.includes("exams:read") && (
                      <p className="text-sm text-muted">
                        Staff can open assigned marks sheets with an exam ID.
                        Grant exams:read if they should also choose an exam by
                        name.
                      </p>
                    )}
                  <div className="grid items-start gap-2 xl:grid-cols-2">
                    {groups.map((group) => {
                      const count = group.actions.filter((action) =>
                        selectedPermissions.includes(
                          `${group.module}:${action.action}`,
                        ),
                      ).length;
                      return (
                        <details
                          key={group.module}
                          className="group min-w-0 rounded-lg border border-line bg-panel"
                        >
                          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-2 hover:bg-mint/40 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
                            <span className="flex-1 text-sm font-semibold capitalize">
                              {group.module.replaceAll("-", " ")}
                            </span>
                            <span
                              aria-label={
                                count +
                                " of " +
                                group.actions.length +
                                " permissions selected"
                              }
                              className="text-xs tabular-nums text-muted"
                            >
                              {count} / {group.actions.length}
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              className="size-4 text-muted group-open:rotate-180"
                            />
                          </summary>
                          <div className="grid gap-1 border-t border-line p-2">
                            {group.actions.map((action) => {
                              const code = `${group.module}:${action.action}`;
                              return (
                                <label
                                  className="flex min-h-10 items-start gap-3 rounded px-2 py-2 text-sm hover:bg-background"
                                  key={action.id}
                                >
                                  <input
                                    checked={selectedPermissions.includes(code)}
                                    className="mt-0.5 accent-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                                    disabled={
                                      !canEditRolePermissions || isPending
                                    }
                                    onChange={() => togglePermission(code)}
                                    type="checkbox"
                                  />
                                  <span>
                                    <span className="block first-letter:uppercase">
                                      {action.action.replaceAll("-", " ")}
                                    </span>
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
                        </details>
                      );
                    })}
                  </div>
                </div>
              </div>
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
        <p
          className="rounded-md border border-coral bg-panel p-3 text-sm text-coral"
          role="alert"
        >
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
