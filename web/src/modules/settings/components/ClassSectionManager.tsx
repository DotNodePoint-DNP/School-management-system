"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import {
  createSchoolClass,
  createSchoolSection,
  deleteSchoolClass,
  deleteSchoolSection,
  listSchoolClasses,
  updateSchoolClass,
  updateSchoolSection,
  type SchoolClass,
  type SchoolSection,
} from "@/modules/settings/services/academic-setup";

const classesQueryKey = ["classes"];
const inputClass =
  "rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60";

function requestError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.status === 403
      ? "You do not have permission to manage classes and sections."
      : error.message;
  }
  return error instanceof Error ? error.message : "The request failed.";
}

export default function ClassSectionManager({
  canManage = true,
}: {
  canManage?: boolean;
}) {
  const queryClient = useQueryClient();
  const classesQuery = useQuery({
    queryKey: classesQueryKey,
    queryFn: listSchoolClasses,
  });
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");

  const createMutation = useMutation({
    mutationFn: createSchoolClass,
    onSuccess: async (schoolClass) => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      setName("");
      setSortOrder("");
      toast.success(`Class "${schoolClass.name}" created.`);
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSchoolClass,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      toast.success("Class deleted.");
    },
    onError: (error) => toast.error(requestError(error)),
  });

  function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      name: name.trim(),
      sortOrder: Number(sortOrder),
    });
  }

  function removeClass(schoolClass: SchoolClass) {
    if (!canManage) return;
    if (window.confirm(`Delete "${schoolClass.name}" and its sections?`)) {
      deleteMutation.mutate(schoolClass.id);
    }
  }

  if (classesQuery.isPending) {
    return <p className="p-6 text-sm text-muted" role="status">Loading classes and sections…</p>;
  }
  if (classesQuery.isError) {
    return (
      <div className="rounded-lg border border-coral p-5 text-sm text-coral" role="alert">
        <p>{requestError(classesQuery.error)}</p>
        <button className="mt-2 underline" onClick={() => void classesQuery.refetch()} type="button">Try again</button>
      </div>
    );
  }

  const activeClasses = classesQuery.data.filter((schoolClass) => schoolClass.isActive).length;
  const sectionCount = classesQuery.data.reduce((total, schoolClass) => total + schoolClass.sections.length, 0);
  const totalCapacity = classesQuery.data.reduce(
    (total, schoolClass) =>
      total +
      schoolClass.sections.reduce(
        (classTotal, section) => classTotal + (section.isActive ? section.capacity ?? 0 : 0),
        0,
      ),
    0,
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Class &amp; section setup</h1>
          <p className="mt-1 text-sm text-muted">Configure the classes and sections used by the school.</p>
        </div>
      </header>

      {!canManage && (
        <p className="rounded-md border border-amber/60 bg-panel p-3 text-sm text-ink">
          You can view the setup, but need the classes management permission to make changes.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Active classes" value={activeClasses} />
        <SummaryCard label="Sections configured" value={sectionCount} />
        <SummaryCard label="Active section capacity" value={totalCapacity.toLocaleString()} />
      </div>

      {canManage && (
        <form className="grid gap-3 rounded-lg border border-line bg-panel p-4 md:grid-cols-[1fr_180px_auto]" onSubmit={submitClass}>
          <label className="text-sm font-medium text-ink">
            New class
            <input className={`${inputClass} mt-1 block w-full`} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="e.g. Grade 6" required value={name} />
          </label>
          <label className="text-sm font-medium text-ink">
            Sort order
            <input className={`${inputClass} mt-1 block w-full`} max={1000} min={1} onChange={(event) => setSortOrder(event.target.value)} required type="number" value={sortOrder} />
          </label>
          <button className="self-end rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? "Adding…" : "Add class"}
          </button>
        </form>
      )}

      {!classesQuery.data.length ? (
        <p className="rounded-lg border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">No classes configured yet.</p>
      ) : (
        <div className="space-y-4">
          {classesQuery.data.map((schoolClass) => (
            <ClassCard
              canManage={canManage}
              key={schoolClass.id}
              onDelete={() => removeClass(schoolClass)}
              schoolClass={schoolClass}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-teal">{value}</p>
    </div>
  );
}

function ClassCard({
  canManage,
  onDelete,
  schoolClass,
}: {
  canManage: boolean;
  onDelete: () => void;
  schoolClass: SchoolClass;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(schoolClass.name);
  const [sortOrder, setSortOrder] = useState(String(schoolClass.sortOrder));
  const [newSectionName, setNewSectionName] = useState("");
  const [newCapacity, setNewCapacity] = useState("");

  const updateMutation = useMutation({
    mutationFn: () =>
      updateSchoolClass(schoolClass.id, {
        name: name.trim(),
        sortOrder: Number(sortOrder),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      toast.success(`Class "${name.trim()}" updated.`);
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const activeMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      updateSchoolClass(schoolClass.id, { isActive }),
    onSuccess: async (_result, isActive) => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      toast.success(isActive ? "Class activated." : "Class deactivated.");
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const addSectionMutation = useMutation({
    mutationFn: () =>
      createSchoolSection(schoolClass.id, {
        name: newSectionName.trim(),
        ...(newCapacity ? { capacity: Number(newCapacity) } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      setNewSectionName("");
      setNewCapacity("");
      toast.success("Section added.");
    },
    onError: (error) => toast.error(requestError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (sectionId: string) => deleteSchoolSection(schoolClass.id, sectionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      toast.success("Section deleted.");
    },
    onError: (error) => toast.error(requestError(error)),
  });

  function submitSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addSectionMutation.mutate();
  }

  return (
    <section className="space-y-4 rounded-lg border border-line bg-panel p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-muted">
            Class name
            <input className={`${inputClass} mt-1 block min-w-48`} disabled={!canManage} maxLength={60} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Sort order
            <input className={`${inputClass} mt-1 block w-28`} disabled={!canManage} max={1000} min={1} onChange={(event) => setSortOrder(event.target.value)} type="number" value={sortOrder} />
          </label>
          {canManage && (
            <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-navy hover:border-teal hover:bg-mint disabled:opacity-50" disabled={updateMutation.isPending || !name.trim() || !sortOrder} onClick={() => updateMutation.mutate()} type="button">
              Save class
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${schoolClass.isActive ? "bg-teal/10 text-teal" : "bg-background text-muted"}`}>
            {schoolClass.isActive ? "Active" : "Inactive"}
          </span>
          {canManage && (
            <>
              <button className="text-sm font-medium text-teal hover:underline disabled:opacity-50" disabled={activeMutation.isPending} onClick={() => activeMutation.mutate(!schoolClass.isActive)} type="button">
                {schoolClass.isActive ? "Deactivate" : "Activate"}
              </button>
              <button className="text-sm font-medium text-coral hover:underline" onClick={onDelete} type="button">Delete</button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <h3 className="text-sm font-semibold text-ink">Sections</h3>
        {schoolClass.sections.length ? (
          <ul className="space-y-2">
            {schoolClass.sections.map((section) => (
              <SectionRow
                canManage={canManage}
                classId={schoolClass.id}
                key={section.id}
                onDelete={() => {
                  if (window.confirm(`Delete section "${section.name}"?`)) {
                    deleteMutation.mutate(section.id);
                  }
                }}
                section={section}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No sections configured for this class.</p>
        )}
      </div>

      {canManage && schoolClass.isActive && (
        <form className="grid gap-3 border-t border-line pt-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={submitSection}>
          <label className="text-xs font-semibold text-muted">
            New section
            <input className={`${inputClass} mt-1 block w-full`} maxLength={20} onChange={(event) => setNewSectionName(event.target.value)} placeholder="e.g. A, Blue, Morning" required value={newSectionName} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Capacity (optional)
            <input className={`${inputClass} mt-1 block w-full`} max={500} min={1} onChange={(event) => setNewCapacity(event.target.value)} type="number" value={newCapacity} />
          </label>
          <button className="self-end rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={addSectionMutation.isPending} type="submit">
            {addSectionMutation.isPending ? "Adding…" : "Add section"}
          </button>
        </form>
      )}
    </section>
  );
}

function SectionRow({
  canManage,
  classId,
  onDelete,
  section,
}: {
  canManage: boolean;
  classId: string;
  onDelete: () => void;
  section: SchoolSection;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(section.name);
  const [capacity, setCapacity] = useState(section.capacity?.toString() ?? "");
  const updateMutation = useMutation({
    mutationFn: (isActive?: boolean) =>
      updateSchoolSection(classId, section.id, {
        name: name.trim(),
        capacity: capacity ? Number(capacity) : null,
        ...(isActive === undefined ? {} : { isActive }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classesQueryKey });
      toast.success(`Section "${name.trim()}" updated.`);
    },
    onError: (error) => toast.error(requestError(error)),
  });

  return (
    <li className="grid items-end gap-3 rounded-md border border-line bg-background p-3 sm:grid-cols-[1fr_180px_auto_auto]">
      <label className="text-xs font-semibold text-muted">
        Section name
        <input className={`${inputClass} mt-1 block w-full`} disabled={!canManage} maxLength={20} onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label className="text-xs font-semibold text-muted">
        Capacity
        <input className={`${inputClass} mt-1 block w-full`} disabled={!canManage} max={500} min={1} onChange={(event) => setCapacity(event.target.value)} type="number" value={capacity} />
      </label>
      {canManage && (
        <>
          <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-navy hover:border-teal hover:bg-mint disabled:opacity-50" disabled={updateMutation.isPending || !name.trim()} onClick={() => updateMutation.mutate()} type="button">
            Save
          </button>
          <div className="flex items-center gap-2">
            <button className="text-sm font-medium text-teal hover:underline disabled:opacity-50" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate(!section.isActive)} type="button">
              {section.isActive ? "Deactivate" : "Activate"}
            </button>
            <button className="text-sm font-medium text-coral hover:underline" onClick={onDelete} type="button">Delete</button>
          </div>
        </>
      )}
    </li>
  );
}
