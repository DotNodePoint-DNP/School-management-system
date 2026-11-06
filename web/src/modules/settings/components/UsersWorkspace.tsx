"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, KeyRound, Pencil, Plus, Search, ShieldCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { listRbacRoles } from "@/modules/settings/services/rbac";
import {
  activateUser,
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  resetUserPassword,
  setUserRoles,
  updateUser,
  type UserRecord,
} from "@/modules/settings/services/users";

type Props = {
  permissions: readonly string[];
};
type Dialog = "create" | "edit" | "roles" | "details" | null;
const pageSize = 15;
const inputClass =
  "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "The request could not be completed.";

export default function UsersWorkspace({ permissions }: Props) {
  const queryClient = useQueryClient();
  const can = (permission: string) => permissions.includes(permission);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", page, search, activeFilter],
    queryFn: () =>
      listUsers({
        page,
        pageSize,
        search: search.trim() || undefined,
        isActive: activeFilter ? activeFilter === "true" : undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    enabled: can("users:read"),
    retry: false,
  });
  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: listRbacRoles,
    enabled: can("roles:read") && (dialog === "create" || dialog === "roles"),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["users", "detail", selected?.id],
    queryFn: () => getUser(selected!.id),
    enabled: Boolean(dialog === "details" && selected),
    retry: false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["users"] });
  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        fullName: fullName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        roleIds: selectedRoles,
      }),
    onSuccess: async (result) => {
      setTemporaryPassword(result.temporaryPassword);
      setDialog(null);
      setFullName("");
      setEmail("");
      setPhone("");
      setSelectedRoles([]);
      setPage(1);
      await refresh();
      toast.success(`${result.user.fullName} was created.`);
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const updateMutation = useMutation({
    mutationFn: () =>
      updateUser(selected!.id, {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      toast.success("User profile updated.");
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const rolesMutation = useMutation({
    mutationFn: () => setUserRoles(selected!.id, selectedRoles),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      toast.success("User roles updated.");
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const statusMutation = useMutation({
    mutationFn: (user: UserRecord) =>
      user.isActive ? deactivateUser(user.id) : activateUser(user.id),
    onSuccess: async (user) => {
      await refresh();
      toast.success(user.isActive ? "Account activated." : "Account deactivated.");
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const resetMutation = useMutation({
    mutationFn: resetUserPassword,
    onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
    onError: (error) => toast.error(errorText(error)),
  });

  function openDialog(mode: Exclude<Dialog, null>, user?: UserRecord) {
    setSelected(user ?? null);
    setDialog(mode);
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
    setSelectedRoles(user?.roles.map((role) => role.id) ?? []);
  }

  if (!can("users:read")) {
    return (
      <section className="mx-auto max-w-5xl rounded-2xl border border-line bg-panel p-8 text-sm text-muted">
        Your account does not have permission to view user accounts.
      </section>
    );
  }

  const users = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.meta.total ?? 0;
  const pages = usersQuery.data?.meta.totalPages ?? 1;
  const roles = rolesQuery.data ?? [];
  const busy =
    createMutation.isPending || updateMutation.isPending || rolesMutation.isPending;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Administration</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-ink">User accounts</h1>
          <p className="mt-1 text-sm text-muted">Manage access, account status, and temporary password resets.</p>
        </div>
        {can("users:create") && (
          <button onClick={() => openDialog("create")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal px-4 text-sm font-bold text-white hover:bg-navy">
            <Plus size={16} /> Add user
          </button>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Accounts in result" value={total} />
        <Metric label="Active on this page" value={users.filter((user) => user.isActive).length} />
        <Metric label="Password updates required" value={users.filter((user) => user.mustChangePassword).length} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email or phone" className={`${inputClass} pl-9`} />
          </label>
          <select aria-label="Filter by account status" value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value as typeof activeFilter); setPage(1); }} className={`${inputClass} md:w-48`}>
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        {usersQuery.isPending ? (
          <div className="p-10 text-center text-sm text-muted">Loading accounts…</div>
        ) : usersQuery.isError ? (
          <div role="alert" className="p-8 text-center text-sm text-coral">{errorText(usersQuery.error)}</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">No user accounts match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-soft text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Roles</th><th className="px-5 py-3">Last sign-in</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-soft/60">
                    <td className="px-5 py-4"><p className="font-semibold text-ink">{user.fullName}</p><p className="mt-0.5 text-xs text-muted">{user.email ?? user.phone ?? "No contact information"}</p>{user.mustChangePassword && <p className="mt-1 text-xs font-medium text-amber-700">Password change required</p>}</td>
                    <td className="px-5 py-4"><div className="flex flex-wrap gap-1">{user.roles.map((role) => <span key={role.id} className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-medium text-teal">{role.name}</span>)}</div></td>
                    <td className="px-5 py-4 text-muted">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-soft text-muted"}`}>{user.isActive ? "Active" : "Inactive"}</span></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-1">
                      <ActionButton label="View account details" onClick={() => openDialog("details", user)}><Eye size={15} /></ActionButton>
                      {can("users:update") && <ActionButton label="Edit profile" onClick={() => openDialog("edit", user)}><Pencil size={15} /></ActionButton>}
                      {can("users:assign-roles") && can("roles:read") && <ActionButton label="Assign roles" onClick={() => openDialog("roles", user)}><ShieldCheck size={15} /></ActionButton>}
                      {can("users:reset-password") && <ActionButton label="Reset password" onClick={() => resetMutation.mutate(user.id)}><KeyRound size={15} /></ActionButton>}
                      {can("users:deactivate") && <ActionButton label={user.isActive ? "Deactivate account" : "Activate account"} onClick={() => { if (window.confirm(`${user.isActive ? "Deactivate" : "Activate"} ${user.fullName}’s account?`)) statusMutation.mutate(user); }}><UserRoundX size={15} /></ActionButton>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted"><span>Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
      </section>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="w-full max-w-lg space-y-4 rounded-2xl border border-line bg-panel p-6 shadow-xl">
            <div><h2 id="user-dialog-title" className="text-lg font-bold text-ink">{dialog === "create" ? "Create user account" : dialog === "edit" ? "Edit user profile" : dialog === "details" ? "User account details" : "Assign roles"}</h2><p className="mt-1 text-sm text-muted">{dialog === "create" ? "A temporary password will be shown once after creation." : selected?.fullName}</p></div>
            {(dialog === "create" || dialog === "edit") && <div className="space-y-3"><label className="block space-y-1 text-sm font-medium text-ink">Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} required minLength={2} maxLength={120} /></label><label className="block space-y-1 text-sm font-medium text-ink">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} maxLength={254} /></label><label className="block space-y-1 text-sm font-medium text-ink">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} maxLength={20} /></label></div>}
            {dialog === "details" && (detailQuery.isPending ? <p className="py-6 text-sm text-muted">Loading account details…</p> : detailQuery.isError ? <p role="alert" className="py-4 text-sm text-coral">{errorText(detailQuery.error)}</p> : detailQuery.data && <dl className="grid gap-3 rounded-xl bg-soft p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-muted">Full name</dt><dd className="mt-1 text-ink">{detailQuery.data.fullName}</dd></div><div><dt className="text-xs font-semibold text-muted">Status</dt><dd className="mt-1 text-ink">{detailQuery.data.isActive ? "Active" : "Inactive"}</dd></div><div><dt className="text-xs font-semibold text-muted">Email</dt><dd className="mt-1 text-ink">{detailQuery.data.email ?? "—"}</dd></div><div><dt className="text-xs font-semibold text-muted">Phone</dt><dd className="mt-1 text-ink">{detailQuery.data.phone ?? "—"}</dd></div><div><dt className="text-xs font-semibold text-muted">Created</dt><dd className="mt-1 text-ink">{new Date(detailQuery.data.createdAt).toLocaleString()}</dd></div><div><dt className="text-xs font-semibold text-muted">Last sign-in</dt><dd className="mt-1 text-ink">{detailQuery.data.lastLoginAt ? new Date(detailQuery.data.lastLoginAt).toLocaleString() : "Never"}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted">Roles</dt><dd className="mt-1 text-ink">{detailQuery.data.roles.map((role) => role.name).join(", ") || "No roles assigned"}</dd></div></dl>)}
            {(dialog === "create" || dialog === "roles") && can("roles:read") && <fieldset className="space-y-2"><legend className="text-sm font-semibold text-ink">Roles</legend>{rolesQuery.isPending ? <p className="text-sm text-muted">Loading roles…</p> : rolesQuery.isError ? <p role="alert" className="text-sm text-coral">{errorText(rolesQuery.error)}</p> : <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-line p-2">{roles.map((role) => <label key={role.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-soft"><input type="checkbox" checked={selectedRoles.includes(role.id)} onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} />{role.name}</label>)}</div>}</fieldset>}
            <div className="flex justify-end gap-2 border-t border-line pt-4"><button onClick={() => setDialog(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink">{dialog === "details" ? "Close" : "Cancel"}</button>{dialog !== "details" && <button disabled={busy || (dialog !== "edit" && (!can("roles:read") || roles.length === 0 || selectedRoles.length === 0)) || (dialog !== "roles" && fullName.trim().length < 2)} onClick={() => dialog === "create" ? createMutation.mutate() : dialog === "edit" ? updateMutation.mutate() : rolesMutation.mutate()} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>}</div>
          </section>
        </div>
      )}
      {temporaryPassword && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="password-title" className="w-full max-w-md space-y-4 rounded-2xl bg-panel p-6 shadow-xl"><div className="flex items-center gap-3"><KeyRound className="text-teal" /><h2 id="password-title" className="text-lg font-bold text-ink">Temporary password</h2></div><p className="text-sm text-muted">Copy and deliver this securely. It will not be shown again.</p><code className="block select-all rounded-lg bg-soft p-4 text-center font-mono text-lg text-ink">{temporaryPassword}</code><button onClick={() => setTemporaryPassword(null)} className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-white">Done</button></section></div>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-xl border border-line bg-panel p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-2xl font-black text-navy">{value}</p></article>;
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button aria-label={label} title={label} onClick={onClick} className="rounded-md p-2 text-muted hover:bg-soft hover:text-teal">{children}</button>;
}
