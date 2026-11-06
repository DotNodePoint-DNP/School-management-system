"use client";

import { useDeferredValue, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Eye,
  LoaderCircle,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { listRbacRoles } from "@/modules/settings/services/rbac";
import {
  createStaff,
  createStaffLogin,
  deleteStaff,
  getStaff,
  listStaff,
  markStaffLeft,
  reactivateStaff,
  updateStaff,
  type StaffDetails,
  type StaffInput,
  type StaffKind,
  type StaffLeaveInput,
  type StaffLoginResult,
  type StaffRecord,
  type StaffStatus,
  type StaffUpdateInput,
} from "./services/staff";
import {
  StaffDetailDialog,
  StaffFormDialog,
  StaffLeaveDialog,
  StaffLoginDialog,
} from "./components/StaffDialogs";

type Props = {
  canRead: boolean;
  canManage: boolean;
  canCreateLogin: boolean;
  canReadRoles: boolean;
};

type DialogMode = "create" | "detail" | "edit" | "leave" | "login" | null;

const PAGE_SIZE = 15;

const STAFF_STATUS: { value: StaffStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "LEFT", label: "Former staff" },
];

const STAFF_KIND: { value: StaffKind | ""; label: string }[] = [
  { value: "", label: "All categories" },
  { value: "TEACHING", label: "Teaching" },
  { value: "NON_TEACHING", label: "Non-teaching" },
];

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-teal focus:ring-2 focus:ring-teal/15";

function fullName(staff: Pick<StaffRecord, "firstName" | "middleName" | "lastName">) {
  return [staff.firstName, staff.middleName, staff.lastName]
    .filter(Boolean)
    .join(" ");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function StaffWorkspace({
  canRead,
  canManage,
  canCreateLogin,
  canReadRoles,
}: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<StaffKind | "">("");
  const [status, setStatus] = useState<StaffStatus | "">("ACTIVE");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loginResult, setLoginResult] = useState<StaffLoginResult | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const staffQuery = useQuery({
    queryKey: ["staff", "directory", page, deferredSearch, kind, status],
    queryFn: () =>
      listStaff({
        page,
        pageSize: PAGE_SIZE,
        ...(deferredSearch ? { search: deferredSearch } : {}),
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        sortBy: "name",
        sortOrder: "asc",
      }),
    enabled: canRead,
    retry: false,
  });
  const detailsQuery = useQuery({
    queryKey: ["staff", "detail", selectedId],
    queryFn: () => getStaff(selectedId!),
    enabled: Boolean(selectedId && dialog && dialog !== "create"),
    retry: false,
  });
  const rolesQuery = useQuery({
    queryKey: ["staff", "login-roles"],
    queryFn: listRbacRoles,
    enabled: Boolean(dialog === "login" && canReadRoles),
    retry: false,
  });
  const records = staffQuery.data?.items ?? [];
  const meta = staffQuery.data?.meta;
  const activeOnPage = records.filter((staff) => staff.status === "ACTIVE").length;
  const teachersOnPage = records.filter((staff) => staff.kind === "TEACHING").length;
  const selectedStaff = detailsQuery.data;

  function closeDialog() {
    setDialog(null);
    setSelectedId(null);
    setLoginResult(null);
  }

  function openDialog(mode: Exclude<DialogMode, null>, id?: string) {
    setSelectedId(id ?? null);
    setDialog(mode);
    setLoginResult(null);
  }

  async function refreshDirectory() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff", "directory"] }),
      queryClient.invalidateQueries({ queryKey: ["staff", "detail"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: (input: StaffInput) => createStaff(input),
    onSuccess: async (created) => {
      toast.success(`${fullName(created)} added to the staff directory.`);
      closeDialog();
      setPage(1);
      await refreshDirectory();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The staff profile could not be created."),
  });
  const updateMutation = useMutation({
    mutationFn: (variables: { id: string; input: StaffUpdateInput }) =>
      updateStaff(variables.id, variables.input),
    onSuccess: async (updated) => {
      toast.success(`${fullName(updated)}’s profile was updated.`);
      closeDialog();
      await refreshDirectory();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The staff profile could not be updated."),
  });
  const leaveMutation = useMutation({
    mutationFn: (variables: { id: string; input: StaffLeaveInput }) =>
      markStaffLeft(variables.id, variables.input),
    onSuccess: async (updated) => {
      toast.success(`${fullName(updated)} was marked as former staff.`);
      closeDialog();
      await refreshDirectory();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The departure could not be recorded."),
  });
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateStaff(id),
    onSuccess: async (updated) => {
      toast.success(`${fullName(updated)} was reactivated.`);
      await refreshDirectory();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The staff member could not be reactivated."),
  });
  const loginMutation = useMutation({
    mutationFn: (variables: { id: string; roleIds: string[] }) =>
      createStaffLogin(variables.id, variables.roleIds),
    onSuccess: async (result) => {
      setLoginResult(result);
      toast.success("Staff login created.");
      await refreshDirectory();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The staff login could not be created."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStaff(id),
    onSuccess: async () => {
      toast.success("Staff record removed.");
      closeDialog();
      await refreshDirectory();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The staff record could not be deleted. Use departure instead if the record has history."),
  });

  function removeStaff(staff: StaffDetails) {
    const confirmed = window.confirm(
      `Permanently delete ${fullName(staff)} (${staff.staffNo})? This is only allowed when the record has no login, assignment, or signatory history.`,
    );
    if (confirmed) deleteMutation.mutate(staff.id);
  }

  const dialogBusy =
    detailsQuery.isPending &&
    selectedId !== null &&
    (dialog === "detail" || dialog === "edit" || dialog === "leave" || dialog === "login");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-10 text-ink md:p-6">
      <header className="relative overflow-hidden rounded-2xl bg-navy px-5 py-6 text-white shadow-sm md:px-8 md:py-8">
        <div className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border-[36px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-28 right-40 size-64 rounded-full border-[28px] border-teal/20" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/65"><Users className="size-3.5" /> People · Staff</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Staff directory</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">A clear view of your school team—profiles, employment status, and access readiness in one place.</p>
          </div>
          {canManage && (
            <button
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-navy shadow-sm transition hover:bg-mint"
              onClick={() => openDialog("create")}
              type="button"
            >
              <Plus className="size-4" /> Add staff member
            </button>
          )}
        </div>
        <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
          <SummaryCard icon={<Users className="size-4" />} label="Directory matches" value={meta?.total ?? (staffQuery.isPending ? "…" : "—")} detail="Based on current filters" />
          <SummaryCard icon={<UserRoundCheck className="size-4" />} label="Active on this page" value={staffQuery.isPending ? "…" : activeOnPage} detail={`of ${records.length} loaded profiles`} />
          <SummaryCard icon={<BriefcaseBusiness className="size-4" />} label="Teaching on this page" value={staffQuery.isPending ? "…" : teachersOnPage} detail="Teaching staff profiles" />
        </div>
      </header>

      {!canRead && canManage && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber/40 bg-amber/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold">Directory access is not included in your role</p><p className="mt-1 text-xs text-muted">You can add staff, but the API requires <code>staff:read</code> to browse existing profiles.</p></div>
          <button className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink" onClick={() => openDialog("create")} type="button">Add staff member</button>
        </div>
      )}

      {canRead && (
        <>
          <section className="rounded-xl border border-line bg-panel p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
              <label className="relative block">
                <span className="sr-only">Search staff</span>
                <Search className="absolute left-3 top-3 size-4 text-muted" />
                <input className={`${inputClass} pl-9`} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or staff number" value={search} />
              </label>
              <label><span className="sr-only">Staff category</span><select className={inputClass} onChange={(event) => { setKind(event.target.value as StaffKind | ""); setPage(1); }} value={kind}>{STAFF_KIND.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select></label>
              <label><span className="sr-only">Employment status</span><select className={inputClass} onChange={(event) => { setStatus(event.target.value as StaffStatus | ""); setPage(1); }} value={status}>{STAFF_STATUS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select></label>
              <button className="h-10 rounded-lg border border-line px-4 text-sm font-semibold text-muted transition hover:bg-background hover:text-ink" onClick={() => { setSearch(""); setKind(""); setStatus(""); setPage(1); }} type="button">Clear filters</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
              <span>{meta ? `${meta.total} staff record${meta.total === 1 ? "" : "s"} found` : "Search or filter the directory"}</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5 text-teal" /> Staff records are permission controlled</span>
            </div>
          </section>

          {staffQuery.isPending ? (
            <StaffLoading />
          ) : staffQuery.isError ? (
            <StaffError error={staffQuery.error} retry={() => void staffQuery.refetch()} />
          ) : records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-panel px-6 py-14 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-mint text-teal"><CircleUserRound className="size-6" /></span>
              <h2 className="mt-4 text-lg font-bold text-ink">No staff profiles found</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{deferredSearch || kind || status !== "ACTIVE" ? "Try a different search or adjust the filters." : "Start building the staff directory by creating your first profile."}</p>
              {canManage && <button className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy" onClick={() => openDialog("create")} type="button"><Plus className="size-4" /> Add staff member</button>}
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
              <div className="flex items-center justify-between border-b border-line px-4 py-3.5 md:px-5">
                <div><h2 className="text-sm font-bold text-ink">Team directory</h2><p className="mt-0.5 text-xs text-muted">Profiles sorted by staff name</p></div>
                <span className="rounded-full bg-mint px-3 py-1 text-[11px] font-bold text-teal">Page {meta?.page ?? page} of {Math.max(meta?.totalPages ?? 1, 1)}</span>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-left">
                  <thead className="bg-background text-[10px] font-bold uppercase tracking-wider text-muted"><tr>
                    <th className="px-5 py-3">Staff member</th><th className="px-4 py-3">Staff no.</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {records.map((staff) => (
                      <StaffTableRow
                        canManage={canManage}
                        key={staff.id}
                        onOpen={() => openDialog("detail", staff.id)}
                        onEdit={() => openDialog("edit", staff.id)}
                        onLeave={() => openDialog("leave", staff.id)}
                        onReactivate={() => {
                          if (window.confirm(`Reactivate ${fullName(staff)}? This will restore the staff record, but not their login account.`)) {
                            reactivateMutation.mutate(staff.id);
                          }
                        }}
                        staff={staff}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-line md:hidden">
                {records.map((staff) => {
                  const name = fullName(staff);
                  return (
                    <article className="space-y-3 p-4" key={staff.id}>
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-xs font-bold text-teal">{initials(name)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <button className="truncate text-left text-sm font-bold text-ink" onClick={() => openDialog("detail", staff.id)} type="button">{name}</button>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${staff.status === "ACTIVE" ? "bg-mint text-teal" : "bg-coral/10 text-coral"}`}>{staff.status === "ACTIVE" ? "Active" : "Former"}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted">{staff.designation || (staff.kind === "TEACHING" ? "Teaching staff" : "Non-teaching staff")}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted">{staff.staffNo} · {staff.hasLogin ? "Login enabled" : "No login"}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                        <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink" onClick={() => openDialog("detail", staff.id)} type="button"><Eye className="size-3.5" /> Profile</button>
                        {canManage && <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink" onClick={() => openDialog("edit", staff.id)} type="button"><Pencil className="size-3.5" /> Edit</button>}
                        {canManage && staff.status === "ACTIVE" && <button className="rounded-lg border border-coral/20 px-3 py-2 text-xs font-semibold text-coral" onClick={() => openDialog("leave", staff.id)} type="button">Record departure</button>}
                        {canManage && staff.status === "LEFT" && <button className="rounded-lg border border-teal/20 px-3 py-2 text-xs font-semibold text-teal" onClick={() => {
                          if (window.confirm(`Reactivate ${name}? This will restore the staff record, but not their login account.`)) {
                            reactivateMutation.mutate(staff.id);
                          }
                        }} type="button">Reactivate</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
              <footer className="flex flex-col gap-3 border-t border-line px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                <p className="text-xs text-muted">{meta ? `Showing ${(meta.page - 1) * meta.pageSize + 1}–${Math.min(meta.page * meta.pageSize, meta.total)} of ${meta.total}` : `Showing ${records.length} records`}</p>
                <div className="flex items-center justify-between gap-2 md:justify-end">
                  <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1 || staffQuery.isFetching} onClick={() => setPage((current) => Math.max(current - 1, 1))} type="button"><ChevronLeft className="size-3.5" /> Previous</button>
                  <span className="px-2 text-xs font-semibold text-muted">{page} / {Math.max(meta?.totalPages ?? 1, 1)}</span>
                  <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-40" disabled={!meta || page >= meta.totalPages || staffQuery.isFetching} onClick={() => setPage((current) => current + 1)} type="button">Next <ChevronRight className="size-3.5" /></button>
                </div>
              </footer>
            </section>
          )}
        </>
      )}

      {dialog === "create" && (
        <StaffFormDialog
          isSaving={createMutation.isPending}
          onClose={closeDialog}
          onSubmit={(input) => {
            const joinDate = input.joinDate;
            if (!input.firstName || !input.lastName || !input.gender || !input.kind || !joinDate) return;
            createMutation.mutate({
              ...input,
              firstName: input.firstName,
              lastName: input.lastName,
              gender: input.gender,
              kind: input.kind,
              joinDate,
            });
          }}
          staff={null}
        />
      )}
      {dialogBusy && <StaffDialogLoading onClose={closeDialog} />}
      {selectedId && dialog && dialog !== "create" && detailsQuery.isError && (
        <StaffProfileErrorDialog error={detailsQuery.error} onClose={closeDialog} retry={() => void detailsQuery.refetch()} />
      )}
      {selectedStaff && dialog === "detail" && (
        <StaffDetailDialog
          canCreateLogin={canCreateLogin}
          canManage={canManage}
          canReadRoles={canReadRoles}
          onClose={closeDialog}
          onCreateLogin={() => setDialog("login")}
          onDelete={() => removeStaff(selectedStaff)}
          onEdit={() => setDialog("edit")}
          onLeave={() => setDialog("leave")}
          onReactivate={() => {
            if (window.confirm(`Reactivate ${fullName(selectedStaff)}? This does not reactivate their login.`)) {
              reactivateMutation.mutate(selectedStaff.id);
            }
          }}
          staff={selectedStaff}
        />
      )}
      {selectedStaff && dialog === "edit" && (
        <StaffFormDialog
          key={`edit-${selectedStaff.id}`}
          isSaving={updateMutation.isPending}
          onClose={closeDialog}
          onSubmit={(input) => updateMutation.mutate({ id: selectedStaff.id, input })}
          staff={selectedStaff}
        />
      )}
      {selectedStaff && dialog === "leave" && (
        <StaffLeaveDialog
          isSaving={leaveMutation.isPending}
          onClose={closeDialog}
          onSubmit={(input) => leaveMutation.mutate({ id: selectedStaff.id, input })}
          staff={selectedStaff}
        />
      )}
      {selectedStaff && dialog === "login" && canReadRoles && (
        <StaffLoginDialog
          isLoadingRoles={rolesQuery.isPending}
          isSaving={loginMutation.isPending}
          onClose={closeDialog}
          onRetryRoles={() => void rolesQuery.refetch()}
          onSubmit={(roleIds) => loginMutation.mutate({ id: selectedStaff.id, roleIds })}
          result={loginResult}
          roles={rolesQuery.data ?? []}
          rolesError={rolesQuery.error}
          staff={selectedStaff}
        />
      )}
      {deleteMutation.isPending && <div className="fixed bottom-5 right-5 z-40 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white shadow-xl"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Removing staff record…</div>}
    </div>
  );
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string | number; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-amber">{icon}</span>
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</p><p className="mt-0.5 text-xl font-bold text-white">{value}</p><p className="text-[10px] text-white/55">{detail}</p></div>
    </div>
  );
}

function StaffTableRow({
  staff,
  canManage,
  onOpen,
  onEdit,
  onLeave,
  onReactivate,
}: {
  staff: StaffRecord;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onLeave: () => void;
  onReactivate: () => void;
}) {
  const name = fullName(staff);
  return (
    <tr className="transition-colors hover:bg-background/70">
      <td className="px-5 py-3.5">
        <button className="group flex items-center gap-3 text-left" onClick={onOpen} type="button">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-xs font-bold text-teal transition group-hover:bg-teal group-hover:text-white">{initials(name)}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink group-hover:text-teal">{name}</span>{staff.fullNameNp && <span className="mt-0.5 block truncate text-xs text-muted">{staff.fullNameNp}</span>}</span>
        </button>
      </td>
      <td className="px-4 py-3.5"><span className="rounded-md bg-background px-2 py-1 font-mono text-xs font-semibold text-muted">{staff.staffNo}</span></td>
      <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink"><BriefcaseBusiness className="size-3.5 text-muted" />{staff.kind === "TEACHING" ? "Teaching" : "Non-teaching"}<span className="block max-w-32 truncate text-muted">{staff.designation ? `· ${staff.designation}` : ""}</span></span></td>
      <td className="px-4 py-3.5 text-xs text-muted">{staff.hasLogin ? <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> Login linked</span> : "—"}</td>
      <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${staff.status === "ACTIVE" ? "bg-mint text-teal" : "bg-coral/10 text-coral"}`}><span className={`size-1.5 rounded-full ${staff.status === "ACTIVE" ? "bg-teal" : "bg-coral"}`} />{staff.status === "ACTIVE" ? "Active" : "Former"}</span></td>
      <td className="px-4 py-3.5">{staff.hasLogin ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal"><CheckCircle2 className="size-3.5" /> Ready</span> : <span className="text-xs text-muted">Not set up</span>}</td>
      <td className="px-4 py-3.5"><div className="flex items-center justify-end gap-1.5">
        <button aria-label={`View ${name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-background hover:text-teal" onClick={onOpen} title="View profile" type="button"><Eye className="size-4" /></button>
        {canManage &&         <button aria-label={`Edit ${name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-background hover:text-teal" onClick={onEdit} title="Edit profile" type="button"><Pencil className="size-4" /></button>}
        {canManage && (staff.status === "ACTIVE" ? <button className="rounded-lg border border-coral/20 px-2.5 py-1.5 text-[10px] font-bold text-coral hover:bg-coral/5" onClick={onLeave} type="button">Departure</button> : <button className="rounded-lg border border-teal/20 px-2.5 py-1.5 text-[10px] font-bold text-teal hover:bg-mint" onClick={onReactivate} type="button">Reactivate</button>)}
      </div></td>
    </tr>
  );
}

function StaffLoading() {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-panel p-4">
      {[0, 1, 2, 3, 4].map((row) => <div className="flex animate-pulse items-center gap-4 py-3" key={row}><span className="size-10 rounded-xl bg-background" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/4 rounded bg-background" /><span className="block h-2.5 w-1/6 rounded bg-background" /></span><span className="h-6 w-20 rounded-full bg-background" /></div>)}
    </div>
  );
}

function StaffError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="rounded-xl border border-coral/30 bg-panel p-6">
      <h2 className="font-semibold text-ink">The staff directory could not be loaded</h2>
      <p className="mt-1 text-sm text-muted">{error instanceof Error ? error.message : "The request failed."}</p>
      <button className="mt-4 rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-background" onClick={retry} type="button">Try again</button>
    </div>
  );
}

function StaffDialogLoading({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-2xl">
        <LoaderCircle className="mx-auto size-6 animate-spin text-teal" />
        <p className="mt-3 text-sm font-semibold text-ink">Loading staff profile…</p>
        <button className="mt-4 text-xs font-semibold text-muted underline" onClick={onClose} type="button">Cancel</button>
      </div>
    </div>
  );
}

function StaffProfileErrorDialog({
  error,
  onClose,
  retry,
}: {
  error: unknown;
  onClose: () => void;
  retry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <h2 className="font-semibold text-ink">Could not load this staff profile</h2>
        <p className="mt-2 text-sm text-muted">{error instanceof Error ? error.message : "The request failed."}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-line px-3 py-2 text-xs font-semibold" onClick={onClose} type="button">Close</button>
          <button className="rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-white" onClick={retry} type="button">Try again</button>
        </div>
      </div>
    </div>
  );
}
