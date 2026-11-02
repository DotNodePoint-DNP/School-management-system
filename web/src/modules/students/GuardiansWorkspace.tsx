"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  createGuardianLogin,
  getGuardian,
  listGuardians,
  resendGuardianCredentials,
  updateGuardian,
  type GuardianDetails,
  type GuardianLoginOutcome,
  type GuardianUpdateInput,
} from "./services/guardians";

const pageSize = 15;
const fieldClass = "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function GuardiansWorkspace({
  permissions,
  initialSelectedId,
}: {
  permissions: readonly string[];
  initialSelectedId?: string;
}) {
  const queryClient = useQueryClient();
  const can = (permission: string) => permissions.includes(permission);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [loginResult, setLoginResult] = useState<GuardianLoginOutcome | null>(null);
  const [draft, setDraft] = useState<GuardianUpdateInput>({});
  const listQuery = useQuery({
    queryKey: ["guardians", page, search],
    queryFn: () => listGuardians({ page, pageSize, ...(search.trim() ? { search: search.trim() } : {}) }),
    enabled: can("guardians:read"),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["guardians", "detail", selectedId],
    queryFn: () => getGuardian(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["guardians"] }),
    queryClient.invalidateQueries({ queryKey: ["guardians", "detail", selectedId] }),
  ]);
  const updateMutation = useMutation({
    mutationFn: () => updateGuardian(selectedId!, draft),
    onSuccess: async () => { await refresh(); toast.success("Guardian profile updated."); },
    onError: (error) => toast.error(message(error)),
  });
  const loginMutation = useMutation({
    mutationFn: () => createGuardianLogin(selectedId!, true),
    onSuccess: (result) => setLoginResult(result),
    onError: (error) => toast.error(message(error)),
  });
  const resendMutation = useMutation({
    mutationFn: () => resendGuardianCredentials(selectedId!),
    onSuccess: (result) => setLoginResult(result),
    onError: (error) => toast.error(message(error)),
  });
  const guardians = listQuery.data?.items ?? [];
  const selected: GuardianDetails | undefined = detailQuery.data;

  if (!can("guardians:read")) return <div className="rounded-xl border border-line bg-panel p-8 text-sm text-muted">Your account does not have permission to view guardian records.</div>;

  function chooseGuardian(id: string) {
    setSelectedId(id);
    setLoginResult(null);
    setDraft({});
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Student information</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-ink">Parent & guardian directory</h1>
        <p className="mt-1 text-sm text-muted">Review linked students and manage guardian contact and portal access.</p>
      </header>
      <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={`${fieldClass} pl-9`} placeholder="Search guardians by name or contact" /></label>
          <div className="flex items-center gap-2 text-sm text-muted"><UsersRound size={16} />{listQuery.data?.meta.total ?? 0} records</div>
        </div>
        {listQuery.isPending ? <div className="p-10 text-center text-sm text-muted">Loading guardians…</div> : listQuery.isError ? <div role="alert" className="p-8 text-center text-sm text-coral">{message(listQuery.error)}</div> : guardians.length === 0 ? <div className="p-10 text-center text-sm text-muted">No guardians found.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-soft text-xs uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">Guardian</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Children</th><th className="px-5 py-3">Portal</th><th className="px-5 py-3 text-right">Profile</th></tr></thead><tbody className="divide-y divide-line">{guardians.map((guardian) => <tr key={guardian.id} className="hover:bg-soft/60"><td className="px-5 py-4"><p className="font-semibold text-ink">{[guardian.firstName, guardian.middleName, guardian.lastName].filter(Boolean).join(" ")}</p>{guardian.fullNameNp && <p className="text-xs text-muted">{guardian.fullNameNp}</p>}</td><td className="px-5 py-4 text-muted">{guardian.phone ?? guardian.email ?? "No contact details"}</td><td className="px-5 py-4 text-ink">{guardian.childrenCount}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${guardian.hasLogin ? "bg-emerald-50 text-emerald-700" : "bg-soft text-muted"}`}>{guardian.hasLogin ? "Enabled" : "Not enabled"}</span></td><td className="px-5 py-4 text-right"><button onClick={() => chooseGuardian(guardian.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-teal hover:text-teal">View profile</button></td></tr>)}</tbody></table>
          </div>
        )}
        {listQuery.data && listQuery.data.meta.totalPages > 1 && <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted"><span>Page {page} of {listQuery.data.meta.totalPages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page >= listQuery.data.meta.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
      </section>
      {selectedId && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside role="dialog" aria-modal="true" aria-labelledby="guardian-title" className="h-full w-full max-w-xl overflow-y-auto bg-panel p-5 shadow-xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-teal">Guardian profile</p><h2 id="guardian-title" className="mt-1 text-xl font-bold text-ink">{selected ? [selected.firstName, selected.middleName, selected.lastName].filter(Boolean).join(" ") : "Loading…"}</h2></div><button onClick={() => setSelectedId(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted">Close</button></div>
        {detailQuery.isPending ? <p className="mt-6 text-sm text-muted">Loading profile…</p> : detailQuery.isError ? <p role="alert" className="mt-6 text-sm text-coral">{message(detailQuery.error)}</p> : selected && <div className="mt-6 space-y-6">
          <div><h3 className="mb-3 text-sm font-bold text-ink">Linked students</h3>{selected.children.length ? <ul className="divide-y divide-line rounded-xl border border-line">{selected.children.map((child) => <li key={child.studentId} className="flex items-center justify-between gap-3 p-3"><div><p className="font-medium text-ink">{child.name}</p><p className="text-xs text-muted">{child.admissionNo} · {child.relationship}{child.isPrimary ? " · Primary" : ""}</p></div></li>)}</ul> : <p className="text-sm text-muted">No linked students.</p>}</div>
          {can("guardians:manage") && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); updateMutation.mutate(); }}><h3 className="text-sm font-bold text-ink">Contact details</h3>{(["firstName", "middleName", "lastName", "phone", "email", "occupation", "address"] as const).map((field) => <label key={field} className="block space-y-1 text-xs font-semibold capitalize text-muted">{field.replace(/([A-Z])/g, " $1")}<input className={fieldClass} value={(draft[field] ?? selected[field] ?? "") as string} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<button disabled={updateMutation.isPending || Object.keys(draft).length === 0} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{updateMutation.isPending ? "Saving…" : "Save contact details"}</button></form>}
          {can("guardians:create-login") && <div className="rounded-xl border border-line bg-soft/60 p-4"><div className="flex items-center gap-2"><KeyRound size={16} className="text-teal" /><h3 className="text-sm font-bold text-ink">Guardian portal</h3></div><p className="mt-1 text-xs text-muted">{selected.hasLogin ? "Resend sign-in credentials for this guardian." : "Create portal access for this guardian."}</p><button disabled={loginMutation.isPending || resendMutation.isPending} onClick={() => { setLoginResult(null); if (selected.hasLogin) resendMutation.mutate(); else if (window.confirm(`Confirm ${selected.phone ?? "this guardian"} as the credential delivery contact?`)) loginMutation.mutate(); }} className="mt-3 rounded-lg border border-teal px-4 py-2 text-sm font-semibold text-teal disabled:opacity-50">{selected.hasLogin ? "Resend credentials" : "Create login"}</button>{loginResult && <div role="status" className="mt-3 rounded-lg border border-line bg-panel p-3 text-sm text-ink"><p className="font-semibold">{loginResult.status.replaceAll("_", " ")}</p>{loginResult.message && <p className="mt-1 text-muted">{loginResult.message}</p>}{loginResult.temporaryPassword && <p className="mt-2 break-all rounded bg-soft p-2 font-mono">Temporary password: {loginResult.temporaryPassword}</p>}</div>}</div>}
        </div>}
      </aside></div>}
    </main>
  );
}
