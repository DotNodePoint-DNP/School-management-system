"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { listAuditLogs, type AuditLogQuery } from "../services/audit-logs";

const fieldClass =
  "h-10 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";

export default function AuditLogWorkspace() {
  const [draft, setDraft] = useState<AuditLogQuery>({ limit: 50 });
  const [filters, setFilters] = useState<AuditLogQuery>({ limit: 50 });
  const query = useInfiniteQuery({
    queryKey: ["audit-logs", filters],
    queryFn: ({ pageParam }) => listAuditLogs({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    retry: false,
  });
  const records = query.data?.pages.flatMap((page) => page.items) ?? [];

  function applyFilters() {
    setFilters({ ...draft, limit: 50 });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Governance</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-muted">Review recorded changes and account activity. Results are ordered newest first.</p>
      </header>
      <form className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
        <label className="space-y-1 text-xs font-semibold text-muted">Action<input className={`${fieldClass} w-full`} value={draft.action ?? ""} onChange={(event) => setDraft({ ...draft, action: event.target.value || undefined })} placeholder="e.g. student.created" /></label>
        <label className="space-y-1 text-xs font-semibold text-muted">Entity type<input className={`${fieldClass} w-full`} value={draft.entityType ?? ""} onChange={(event) => setDraft({ ...draft, entityType: event.target.value || undefined })} placeholder="e.g. student" /></label>
        <label className="space-y-1 text-xs font-semibold text-muted">From date<input type="date" className={`${fieldClass} w-full`} value={draft.from ?? ""} onChange={(event) => setDraft({ ...draft, from: event.target.value || undefined })} /></label>
        <label className="space-y-1 text-xs font-semibold text-muted">To date<input type="date" className={`${fieldClass} w-full`} value={draft.to ?? ""} onChange={(event) => setDraft({ ...draft, to: event.target.value || undefined })} /></label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-teal px-4 text-sm font-bold text-white hover:bg-navy"><Search size={15} />Apply filters</button>
      </form>
      <section className="space-y-3">
        {query.isPending && records.length === 0 ? <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-muted">Loading audit records…</div> : null}
        {query.isError && <div role="alert" className="rounded-xl border border-coral/30 bg-coral/5 p-5 text-sm text-coral">{query.error instanceof Error ? query.error.message : "Audit log could not be loaded."}</div>}
        {!query.isPending && !query.isError && records.length === 0 && <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-muted">No audit records match the selected filters.</div>}
        {records.map((record) => (
          <article key={record.id} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div><p className="font-semibold text-ink">{record.action}</p><p className="mt-1 text-sm text-muted">{record.actorName} · {record.entityType}{record.entityId ? ` · ${record.entityId}` : ""}</p></div>
              <time className="text-xs text-muted">{new Date(record.occurredAt).toLocaleString()}</time>
            </div>
            {record.details !== null && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-teal">View recorded details</summary><pre className="mt-2 overflow-auto rounded-lg bg-soft p-3 text-xs text-ink">{JSON.stringify(record.details, null, 2)}</pre></details>}
            {(record.ipAddress || record.userAgent) && <p className="mt-3 break-all text-[11px] text-muted">{[record.ipAddress, record.userAgent].filter(Boolean).join(" · ")}</p>}
          </article>
        ))}
        {query.hasNextPage && <div className="text-center"><button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} className="rounded-lg border border-line bg-panel px-5 py-2.5 text-sm font-semibold text-ink hover:border-teal disabled:opacity-50">{query.isFetchingNextPage ? "Loading…" : "Load older records"}</button></div>}
      </section>
    </main>
  );
}
