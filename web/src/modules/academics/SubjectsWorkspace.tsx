"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Copy, Eye, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listAcademicYears,
  listSchoolClasses,
} from "@/modules/settings/services/academic-setup";
import {
  copyCurriculum,
  deleteSubject,
  getCurriculum,
  getSubject,
  listSubjects,
  replaceCurriculum,
  setCurriculumCreditHours,
  updateSubject,
  createSubject,
} from "./services/subjects";

const fieldClass = "h-10 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function SubjectsWorkspace({ permissions }: { permissions: readonly string[] }) {
  const queryClient = useQueryClient();
  const canRead = permissions.includes("subjects:read");
  const canManage = permissions.includes("subjects:manage");
  const [yearSelection, setYearSelection] = useState("");
  const [classSelection, setClassSelection] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [detailSubjectId, setDetailSubjectId] = useState<string | null>(null);
  const [curriculumDraft, setCurriculumDraft] = useState<{
    key: string;
    selectedIds: string[];
    compulsoryIds: string[];
  } | null>(null);
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears, enabled: canRead, retry: false });
  const classesQuery = useQuery({ queryKey: ["school-classes"], queryFn: listSchoolClasses, enabled: canRead, retry: false });
  const subjectsQuery = useQuery({ queryKey: ["subjects"], queryFn: () => listSubjects(), enabled: canRead, retry: false });
  const subjectDetailQuery = useQuery({
    queryKey: ["subject", detailSubjectId],
    queryFn: () => getSubject(detailSubjectId!),
    enabled: Boolean(canRead && detailSubjectId),
    retry: false,
  });
  const years = yearsQuery.data ?? [];
  const activeYearId = years.find((year) => year.status === "ACTIVE")?.id;
  const yearId = years.some((year) => year.id === yearSelection)
    ? yearSelection
    : activeYearId ?? years[0]?.id ?? "";
  const classes = classesQuery.data ?? [];
  const classId = classes.some((schoolClass) => schoolClass.id === classSelection)
    ? classSelection
    : classes[0]?.id ?? "";
  const curriculumQuery = useQuery({
    queryKey: ["curriculum", yearId, classId],
    queryFn: () => getCurriculum(yearId, classId),
    enabled: Boolean(canRead && yearId && classId),
    retry: false,
  });
  const subjects = subjectsQuery.data ?? [];
  const curriculum = curriculumQuery.data?.subjects ?? [];
  const curriculumKey = `${yearId}:${classId}`;
  const selectedIds = curriculumDraft?.key === curriculumKey
    ? curriculumDraft.selectedIds
    : curriculum.map((subject) => subject.subjectId);
  const compulsoryIds = curriculumDraft?.key === curriculumKey
    ? curriculumDraft.compulsoryIds
    : curriculum.filter((subject) => subject.isCompulsory).map((subject) => subject.subjectId);

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["subjects"] }),
    queryClient.invalidateQueries({ queryKey: ["curriculum", yearId, classId] }),
  ]);
  const createMutation = useMutation({
    mutationFn: () => createSubject({ code: code.trim(), name: name.trim() }),
    onSuccess: async (subject) => { setCode(""); setName(""); await refresh(); toast.success(`${subject.code} added to the subject catalog.`); },
    onError: (error) => toast.error(message(error)),
  });
  const statusMutation = useMutation({
    mutationFn: (subject: { id: string; isActive: boolean }) => updateSubject(subject.id, { isActive: !subject.isActive }),
    onSuccess: async () => { await refresh(); toast.success("Subject status updated."); },
    onError: (error) => toast.error(message(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: async (_result, subjectId) => {
      if (detailSubjectId === subjectId) setDetailSubjectId(null);
      await refresh();
      toast.success("Subject deleted.");
    },
    onError: (error) => toast.error(message(error)),
  });
  const curriculumMutation = useMutation({
    mutationFn: () => replaceCurriculum(
      yearId,
      classId,
      selectedIds.map((subjectId) => ({
        subjectId,
        isCompulsory: compulsoryIds.includes(subjectId),
      })),
    ),
    onSuccess: async () => { await refresh(); toast.success("Class curriculum saved."); },
    onError: (error) => toast.error(message(error)),
  });
  const copyMutation = useMutation({
    mutationFn: (sourceYearId: string) => copyCurriculum(yearId, sourceYearId),
    onSuccess: async (result) => { await refresh(); toast.success(`Copied ${result.copied} subjects; ${result.alreadyPresent} already existed, ${result.skippedInactive} inactive subjects skipped.`); },
    onError: (error) => toast.error(message(error)),
  });
  const creditHoursMutation = useMutation({
    mutationFn: (input: { subjectId: string; creditHours: number | null }) =>
      setCurriculumCreditHours(yearId, classId, input.subjectId, input.creditHours),
    onSuccess: async () => { await refresh(); toast.success("Credit hours updated."); },
    onError: (error) => toast.error(message(error)),
  });

  function saveCreditHours(subjectId: string, rawValue: string, currentValue: number | null) {
    const trimmed = rawValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (
      !Number.isFinite(parsed)
      || parsed < 0.25
      || parsed > 20
      || !/^\d{1,2}(?:\.\d{1,2})?$/.test(trimmed)
    )) {
      toast.error("Credit hours must be between 0.25 and 20, with up to two decimal places.");
      return;
    }
    if (parsed !== currentValue) {
      creditHoursMutation.mutate({ subjectId, creditHours: parsed });
    }
  }

  if (!canRead) return <div className="rounded-xl border border-line bg-panel p-8 text-sm text-muted">Your account does not have permission to view subjects and curriculum.</div>;
  const pageError = yearsQuery.error ?? classesQuery.error ?? subjectsQuery.error;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Academic setup</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-ink">Subjects & curriculum</h1>
        <p className="mt-1 text-sm text-muted">Maintain the subject catalog and configure a year-specific curriculum for each class.</p>
      </header>
      {pageError && <p role="alert" className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-coral">{message(pageError)}</p>}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <article className="space-y-4 rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center gap-2"><BookOpenCheck size={18} className="text-teal" /><h2 className="font-bold text-ink">Subject catalog</h2></div>
          {canManage && <form className="grid gap-2 sm:grid-cols-[0.7fr_1.3fr_auto]" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}><input aria-label="Subject code" value={code} onChange={(event) => setCode(event.target.value)} className={fieldClass} placeholder="Code" maxLength={20} required /><input aria-label="Subject name" value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} placeholder="Subject name" maxLength={120} required /><button disabled={createMutation.isPending || !code.trim() || !name.trim()} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-teal px-3 text-sm font-bold text-white disabled:opacity-50"><Plus size={15} />Add</button></form>}
          {subjectsQuery.isPending ? <p className="py-6 text-center text-sm text-muted">Loading catalog…</p> : subjects.length === 0 ? <p className="py-6 text-center text-sm text-muted">No subjects have been created.</p> : <div className="max-h-[430px] divide-y divide-line overflow-y-auto rounded-xl border border-line">{subjects.map((subject) => <div key={subject.id} className="flex items-center justify-between gap-3 p-3"><div><p className="font-semibold text-ink">{subject.name}</p><p className="text-xs text-muted">{subject.code} · {subject.isActive ? "Active" : "Inactive"}</p></div><div className="flex items-center gap-2"><button aria-label={`Details for ${subject.name}`} onClick={() => setDetailSubjectId(subject.id)} className="rounded-md border border-line p-2 text-muted hover:border-teal hover:text-teal"><Eye size={14} /></button>{canManage && <><button onClick={() => statusMutation.mutate(subject)} disabled={statusMutation.isPending || deleteMutation.isPending} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-teal disabled:opacity-50">{subject.isActive ? "Deactivate" : "Activate"}</button><button aria-label={`Delete ${subject.name}`} disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(`Permanently delete ${subject.name} (${subject.code})? This can fail if the subject is referenced by curricula or exams.`)) deleteMutation.mutate(subject.id); }} className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/5 disabled:opacity-50"><Trash2 size={14} /></button></>}</div></div>)}</div>}
        </article>
        <article className="space-y-4 rounded-2xl border border-line bg-panel p-5">
          <div><h2 className="font-bold text-ink">Class curriculum</h2><p className="mt-1 text-xs text-muted">Choose the subjects offered to the selected class in the selected year.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-semibold text-muted">Academic year<select value={yearId} onChange={(event) => { setYearSelection(event.target.value); setCurriculumDraft(null); }} className={`${fieldClass} w-full`}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status.toLowerCase()}</option>)}</select></label><label className="space-y-1 text-xs font-semibold text-muted">Class<select value={classId} onChange={(event) => { setClassSelection(event.target.value); setCurriculumDraft(null); }} className={`${fieldClass} w-full`}>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label></div>
          {curriculumQuery.isPending && yearId && classId ? <p className="py-6 text-center text-sm text-muted">Loading curriculum…</p> : curriculumQuery.isError ? <p role="alert" className="text-sm text-coral">{message(curriculumQuery.error)}</p> : <div className="max-h-[300px] divide-y divide-line overflow-y-auto rounded-xl border border-line">{subjects.filter((subject) => subject.isActive).map((subject) => { const mapping = curriculum.find((entry) => entry.subjectId === subject.id); const checked = selectedIds.includes(subject.id); return <div key={subject.id} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-soft/60"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" checked={checked} disabled={!canManage || !yearId || !classId} onChange={(event) => { const selected = event.target.checked; setCurriculumDraft({ key: curriculumKey, selectedIds: selected ? [...selectedIds, subject.id] : selectedIds.filter((id) => id !== subject.id), compulsoryIds: selected && !mapping ? [...compulsoryIds, subject.id] : compulsoryIds.filter((id) => selected || id !== subject.id) }); }} className="h-4 w-4 accent-teal" /><span><span className="block text-sm font-medium text-ink">{subject.name}</span><span className="text-xs text-muted">{subject.code}{mapping ? ` · ${mapping.creditHours ?? "No"} credit hours` : ""}</span></span></label>{checked && <div className="flex items-center gap-2"><select aria-label={`${subject.name} curriculum type`} disabled={!canManage} value={compulsoryIds.includes(subject.id) ? "compulsory" : "optional"} onChange={(event) => setCurriculumDraft({ key: curriculumKey, selectedIds, compulsoryIds: event.target.value === "compulsory" ? [...compulsoryIds, subject.id] : compulsoryIds.filter((id) => id !== subject.id) })} className="h-8 rounded-md border border-line bg-panel px-2 text-xs text-ink"><option value="compulsory">Compulsory</option><option value="optional">Optional</option></select>{mapping && canManage && <label className="flex items-center gap-1 text-[11px] text-muted"><span className="sr-only">{subject.name} credit hours</span><input key={`${subject.id}-${mapping.creditHours ?? "unset"}`} type="number" min="0.25" max="20" step="0.01" defaultValue={mapping.creditHours ?? ""} placeholder="Credits" aria-label={`${subject.name} credit hours`} disabled={creditHoursMutation.isPending} onBlur={(event) => saveCreditHours(subject.id, event.currentTarget.value, mapping.creditHours)} className="h-8 w-24 rounded-md border border-line bg-panel px-2 text-xs text-ink outline-none focus:border-teal" /></label>}</div>}</div>; })}</div>}
          <div className="flex flex-wrap justify-between gap-2">
            {canManage && <button disabled={!yearId || !classId || curriculumMutation.isPending || curriculumQuery.isPending} onClick={() => curriculumMutation.mutate()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{curriculumMutation.isPending ? "Saving…" : "Save curriculum"}</button>}
            {canManage && <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink"><Copy size={15} />Copy from year<select aria-label="Copy curriculum from academic year" className="max-w-40 bg-transparent text-xs outline-none" value="" onChange={(event) => { if (event.target.value && window.confirm("Copy subject mappings into this year? Existing mappings will be preserved.")) copyMutation.mutate(event.target.value); }} disabled={!yearId || copyMutation.isPending}><option value="">Select…</option>{years.filter((year) => year.id !== yearId).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>}
          </div>
        </article>
      </section>
      {detailSubjectId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="subject-detail-title" className="w-full max-w-md space-y-4 rounded-2xl bg-panel p-6 shadow-xl"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-teal">Catalog record</p><h2 id="subject-detail-title" className="mt-1 text-lg font-bold text-ink">{subjectDetailQuery.data?.name ?? "Subject details"}</h2></div><button onClick={() => setDetailSubjectId(null)} className="rounded-md border border-line px-3 py-1 text-sm text-muted">Close</button></div>{subjectDetailQuery.isPending ? <p className="text-sm text-muted">Loading subject…</p> : subjectDetailQuery.isError ? <p role="alert" className="text-sm text-coral">{message(subjectDetailQuery.error)}</p> : subjectDetailQuery.data && <dl className="grid gap-3 rounded-xl bg-soft p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">Subject code</dt><dd className="mt-1 font-semibold text-ink">{subjectDetailQuery.data.code}</dd></div><div><dt className="text-xs text-muted">Status</dt><dd className="mt-1 font-semibold text-ink">{subjectDetailQuery.data.isActive ? "Active" : "Inactive"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted">Record ID</dt><dd className="mt-1 break-all font-mono text-xs text-ink">{subjectDetailQuery.data.id}</dd></div></dl>}</section></div>}
    </main>
  );
}
