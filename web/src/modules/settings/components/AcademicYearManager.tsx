"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import {
  createAcademicTerm,
  createAcademicYear,
  deleteAcademicTerm,
  deleteAcademicYear,
  listAcademicYears,
  updateAcademicTerm,
  updateAcademicYear,
  type AcademicTerm,
  type AcademicYear,
} from "@/modules/settings/services/academic-setup";

const yearsQueryKey = ["academic-years"];
const inputClass =
  "mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60";

function requestError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.status === 403
      ? "You do not have permission to manage academic years."
      : error.message;
  }
  return error instanceof Error ? error.message : "The request failed.";
}

function isEditable(year: AcademicYear): boolean {
  return year.status !== "CLOSED";
}

export default function AcademicYearManager({
  canManage = true,
}: {
  canManage?: boolean;
}) {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery({
    queryKey: yearsQueryKey,
    queryFn: listAcademicYears,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const createMutation = useMutation({
    mutationFn: createAcademicYear,
    onSuccess: async (year) => {
      await queryClient.invalidateQueries({ queryKey: yearsQueryKey });
      setSelectedId(year.id);
      setShowCreate(false);
      setName("");
      setStartDate("");
      setEndDate("");
      toast.success(`Academic year "${year.name}" created.`);
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAcademicYear,
    onSuccess: async (_result, yearId) => {
      await queryClient.invalidateQueries({ queryKey: yearsQueryKey });
      if (selectedId === yearId) setSelectedId(null);
      toast.success("Academic year deleted.");
    },
    onError: (error) => toast.error(requestError(error)),
  });

  const selectedYear =
    yearsQuery.data?.find((year) => year.id === selectedId) ??
    yearsQuery.data?.[0] ??
    null;

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({ name: name.trim(), startDate, endDate });
  }

  function removeYear(year: AcademicYear) {
    if (!canManage || year.status !== "PLANNED") return;
    if (window.confirm(`Delete academic year "${year.name}"?`)) {
      deleteMutation.mutate(year.id);
    }
  }

  if (yearsQuery.isPending) {
    return <p className="p-6 text-sm text-muted" role="status">Loading academic years…</p>;
  }
  if (yearsQuery.isError) {
    return (
      <div className="rounded-lg border border-coral p-5 text-sm text-coral" role="alert">
        <p>{requestError(yearsQuery.error)}</p>
        <button className="mt-2 underline" onClick={() => void yearsQuery.refetch()} type="button">Try again</button>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Academic year setup</h1>
          <p className="mt-1 text-sm text-muted">Configure academic-year dates and their terms.</p>
        </div>
        {canManage && (
          <button
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50"
            disabled={createMutation.isPending || deleteMutation.isPending}
            onClick={() => setShowCreate((current) => !current)}
            type="button"
          >
            {showCreate ? "Cancel" : "Add academic year"}
          </button>
        )}
      </header>

      {showCreate && canManage && (
        <form className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-4" onSubmit={submitCreate}>
          <label className="text-sm font-medium text-ink">
            Year name
            <input className={inputClass} maxLength={50} onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label className="text-sm font-medium text-ink">
            Start date (AD)
            <input className={inputClass} onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} />
          </label>
          <label className="text-sm font-medium text-ink">
            End date (AD)
            <input className={inputClass} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} />
          </label>
          <button className="self-end rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? "Creating…" : "Create year"}
          </button>
        </form>
      )}

      {!yearsQuery.data.length ? (
        <p className="rounded-lg border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">No academic years configured yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {yearsQuery.data.map((year) => (
            <button
              aria-pressed={year.id === selectedYear?.id}
              className="rounded-lg border border-line bg-panel p-4 text-left transition-colors hover:border-teal aria-pressed:border-teal aria-pressed:bg-mint"
              key={year.id}
              onClick={() => setSelectedId(year.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{year.name}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${year.status === "ACTIVE" ? "bg-teal/10 text-teal" : year.status === "CLOSED" ? "bg-coral/10 text-coral" : "bg-background text-muted"}`}>
                  {year.status}
                </span>
              </span>
              <span className="mt-2 block text-xs text-muted">
                {year.startDate} – {year.endDate} · {year.terms.length} terms
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedYear && (
        <AcademicYearDetails
          canManage={canManage}
          key={selectedYear.id}
          onDelete={() => removeYear(selectedYear)}
          year={selectedYear}
        />
      )}
    </main>
  );
}

function AcademicYearDetails({
  canManage,
  onDelete,
  year,
}: {
  canManage: boolean;
  onDelete: () => void;
  year: AcademicYear;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(year.name);
  const [startDate, setStartDate] = useState(year.startDate);
  const [endDate, setEndDate] = useState(year.endDate);
  const [termName, setTermName] = useState("");
  const [termSequence, setTermSequence] = useState(String(year.terms.length + 1));
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAcademicYear(year.id, {
        name: name.trim(),
        startDate,
        endDate,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: yearsQueryKey });
      toast.success("Academic year updated.");
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const addTermMutation = useMutation({
    mutationFn: () =>
      createAcademicTerm(year.id, {
        name: termName.trim(),
        sequence: Number(termSequence),
        startDate: termStart,
        endDate: termEnd,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: yearsQueryKey });
      setTermName("");
      setTermStart("");
      setTermEnd("");
      setTermSequence(String(year.terms.length + 2));
      toast.success("Term added.");
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const editable = canManage && isEditable(year);

  return (
    <section className="space-y-5 rounded-lg border border-line bg-panel p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{year.name}</h2>
          <p className="text-sm text-muted">Year status: {year.status}</p>
        </div>
        {canManage && year.status === "PLANNED" && (
          <button className="rounded-md border border-coral px-3 py-1.5 text-sm text-coral hover:bg-coral/10" onClick={onDelete} type="button">
            Delete year
          </button>
        )}
      </div>

      <form className="grid gap-4 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); updateMutation.mutate(); }}>
        <label className="text-sm font-medium text-ink">
          Name
          <input className={inputClass} disabled={!editable} maxLength={50} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="text-sm font-medium text-ink">
          Start date (AD)
          <input className={inputClass} disabled={!editable} onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} />
        </label>
        <label className="text-sm font-medium text-ink">
          End date (AD)
          <input className={inputClass} disabled={!editable} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} />
        </label>
        {editable && (
          <button className="self-end rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy hover:border-teal hover:bg-mint disabled:opacity-50" disabled={updateMutation.isPending} type="submit">
            {updateMutation.isPending ? "Saving…" : "Save year"}
          </button>
        )}
      </form>

      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="font-semibold text-ink">Terms</h3>
        {year.terms.length ? (
          <div className="divide-y divide-line rounded-md border border-line">
            {year.terms.map((term) => (
              <TermRow canManage={editable} key={term.id} term={term} yearId={year.id} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No terms configured for this year.</p>
        )}
        {editable && (
          <form
            className="grid gap-3 rounded-md border border-dashed border-line p-3 md:grid-cols-5"
            onSubmit={(event) => { event.preventDefault(); addTermMutation.mutate(); }}
          >
            <input aria-label="Term name" className={inputClass} maxLength={50} onChange={(event) => setTermName(event.target.value)} placeholder="Term name" required value={termName} />
            <input aria-label="Term sequence" className={inputClass} max={20} min={1} onChange={(event) => setTermSequence(event.target.value)} placeholder="Sequence" required type="number" value={termSequence} />
            <input aria-label="Term start date" className={inputClass} onChange={(event) => setTermStart(event.target.value)} required type="date" value={termStart} />
            <input aria-label="Term end date" className={inputClass} min={termStart || undefined} onChange={(event) => setTermEnd(event.target.value)} required type="date" value={termEnd} />
            <button className="rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={addTermMutation.isPending} type="submit">
              {addTermMutation.isPending ? "Adding…" : "Add term"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function TermRow({
  canManage,
  term,
  yearId,
}: {
  canManage: boolean;
  term: AcademicTerm;
  yearId: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(term.name);
  const [sequence, setSequence] = useState(String(term.sequence));
  const [startDate, setStartDate] = useState(term.startDate);
  const [endDate, setEndDate] = useState(term.endDate);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAcademicTerm(yearId, term.id, {
        name: name.trim(),
        sequence: Number(sequence),
        startDate,
        endDate,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: yearsQueryKey });
      setEditing(false);
      toast.success("Term updated.");
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAcademicTerm(yearId, term.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: yearsQueryKey });
      toast.success("Term deleted.");
    },
    onError: (error) => toast.error(requestError(error)),
  });

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <p className="text-sm font-medium text-ink">{term.sequence}. {term.name}</p>
          <p className="text-xs text-muted">{term.startDate} – {term.endDate}</p>
        </div>
        {canManage && (
          <div className="flex gap-3 text-sm">
            <button className="font-medium text-teal hover:underline" onClick={() => setEditing(true)} type="button">Edit</button>
            <button className="font-medium text-coral hover:underline" onClick={() => {
              if (window.confirm(`Delete term "${term.name}"?`)) deleteMutation.mutate();
            }} type="button">Delete</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="grid gap-3 p-3 md:grid-cols-5" onSubmit={(event) => { event.preventDefault(); updateMutation.mutate(); }}>
      <input aria-label="Term name" className={inputClass} maxLength={50} onChange={(event) => setName(event.target.value)} required value={name} />
      <input aria-label="Term sequence" className={inputClass} max={20} min={1} onChange={(event) => setSequence(event.target.value)} required type="number" value={sequence} />
      <input aria-label="Term start date" className={inputClass} onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} />
      <input aria-label="Term end date" className={inputClass} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} />
      <div className="flex items-center gap-2">
        <button className="text-sm font-semibold text-teal disabled:opacity-50" disabled={updateMutation.isPending} type="submit">Save</button>
        <button className="text-sm text-muted" onClick={() => setEditing(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}
