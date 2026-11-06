"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import {
  copyExamSetup,
  createExam,
  deleteExam,
  getCurriculumSubjects,
  getExamSetup,
  listExamClasses,
  listExamYears,
  listExams,
  openExam,
  saveExamSetup,
  updateExam,
  type Exam,
  type ExamInput,
  type ExamSubjectInput,
} from "./services/exams";

const yearsKey = ["examination", "years"];
const classesKey = ["examination", "classes"];
const inputClass =
  "mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60";

function message(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "The request failed.";
}

function useAction<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  success: (value: TOutput, input: TInput) => string,
  onComplete?: () => void,
) {
  return useMutation({
    mutationFn,
    onSuccess: (value, input) => {
      toast.success(success(value, input));
      onComplete?.();
    },
    onError: (error) => toast.error(message(error)),
  });
}

export default function ExamSetupWorkspace({
  canManage,
}: {
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery({ queryKey: yearsKey, queryFn: listExamYears });
  const classesQuery = useQuery({ queryKey: classesKey, queryFn: listExamClasses });
  const [yearId, setYearId] = useState("");
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSequence, setNewSequence] = useState("1");
  const [newTermId, setNewTermId] = useState("");
  const [newIsFinal, setNewIsFinal] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");

  const years = yearsQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((item) => item.isActive);
  const selectedYearId = yearId || years.find((year) => year.status === "ACTIVE")?.id || years[0]?.id || "";
  const examsQuery = useQuery({
    queryKey: ["examination", "exams", selectedYearId],
    queryFn: () => listExams(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const exams = examsQuery.data ?? [];
  const selectedExam = exams.find((exam) => exam.id === examId) ?? exams[0] ?? null;
  const selectedClassId = classId || classes[0]?.id || "";
  const curriculumQuery = useQuery({
    queryKey: ["examination", "curriculum", selectedYearId, selectedClassId],
    queryFn: () => getCurriculumSubjects(selectedYearId, selectedClassId),
    enabled: Boolean(selectedYearId && selectedClassId),
  });
  const setupQuery = useQuery({
    queryKey: ["examination", "setup", selectedExam?.id, selectedClassId],
    queryFn: () => getExamSetup(selectedExam!.id, selectedClassId),
    enabled: Boolean(selectedExam && selectedClassId),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["examination"] });
  const createMutation = useAction(
    (input: ExamInput) => createExam(selectedYearId, input),
    (exam) => `Exam "${exam.name}" created.`,
    () => {
      setCreating(false);
      setNewName("");
      void refresh();
    },
  );
  const updateMutation = useAction(
    (input: { examId: string; changes: Partial<ExamInput> }) =>
      updateExam(input.examId, input.changes),
    (exam) => `Exam "${exam.name}" updated.`,
    () => void refresh(),
  );
  const deleteMutation = useAction(
    deleteExam,
    () => "Exam deleted.",
    () => {
      setExamId("");
      void refresh();
    },
  );
  const openMutation = useAction(
    openExam,
    (exam) => `"${exam.name}" is open for marks entry.`,
    () => void refresh(),
  );
  const saveSetupMutation = useAction(
    (input: { examId: string; classId: string; subjects: ExamSubjectInput[] }) =>
      saveExamSetup(input.examId, input.classId, input.subjects),
    () => "Subject setup saved.",
    () => {
      void setupQuery.refetch();
      void refresh();
    },
  );
  const copyMutation = useAction(
    (input: { examId: string; sourceExamId: string; classId: string }) =>
      copyExamSetup(input.examId, input.sourceExamId, [input.classId]),
    (result) =>
      `Setup copied: ${result.copied} added, ${result.alreadyPresent} already present, ${result.skipped} skipped.`,
    () => {
      setCopySourceId("");
      void setupQuery.refetch();
    },
  );


  function startCreate() {
    setNewName("");
    setNewSequence(String(exams.length + 1));
    setNewTermId("");
    setNewIsFinal(false);
    setCreating(true);
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      name: newName.trim(),
      sequence: Number(newSequence),
      ...(newTermId ? { termId: newTermId } : {}),
      isFinal: newIsFinal,
    });
  }

  if (yearsQuery.isPending || classesQuery.isPending) {
    return <StatusBox>Loading exam setup…</StatusBox>;
  }
  if (yearsQuery.isError || classesQuery.isError) {
    return (
      <ErrorBox
        error={yearsQuery.error ?? classesQuery.error}
        retry={() => {
          void yearsQuery.refetch();
          void classesQuery.refetch();
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Examination workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Exam setup</h1>
          <p className="mt-1 text-sm text-muted">Create exam schedules and configure subject marks for each class.</p>
        </div>
        {canManage && (
          <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy" onClick={startCreate} type="button">
            Create exam
          </button>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Academic year
          <select className={inputClass} onChange={(event) => { setYearId(event.target.value); setExamId(""); }} value={selectedYearId}>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Exam
          <select className={inputClass} onChange={(event) => setExamId(event.target.value)} value={selectedExam?.id ?? ""}>
            <option value="">Select an exam</option>
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.sequence}. {exam.name} · {exam.status}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Class for subject setup
          <select className={inputClass} onChange={(event) => setClassId(event.target.value)} value={selectedClassId}>
            {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
          </select>
        </label>
      </div>

      {examsQuery.isError && <ErrorBox error={examsQuery.error} retry={() => void examsQuery.refetch()} />}
      {!years.length && <StatusBox>No academic years are configured.</StatusBox>}
      {years.length > 0 && !exams.length && !creating && (
        <StatusBox>No exams in this academic year. {canManage ? "Create an exam to get started." : ""}</StatusBox>
      )}

      {creating && canManage && (
        <form className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-5" onSubmit={submitCreate}>
          <label className="text-sm font-medium">Exam name<input className={inputClass} maxLength={60} onChange={(event) => setNewName(event.target.value)} required value={newName} /></label>
          <label className="text-sm font-medium">Sequence<input className={inputClass} max={20} min={1} onChange={(event) => setNewSequence(event.target.value)} required type="number" value={newSequence} /></label>
          <label className="text-sm font-medium">Term<select className={inputClass} onChange={(event) => setNewTermId(event.target.value)} value={newTermId}><option value="">No term</option>{years.find((year) => year.id === selectedYearId)?.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input checked={newIsFinal} className="accent-teal" onChange={(event) => setNewIsFinal(event.target.checked)} type="checkbox" />Final exam</label>
          <div className="flex items-end gap-2"><button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={createMutation.isPending} type="submit">{createMutation.isPending ? "Creating…" : "Create"}</button><button className="rounded-md border border-line px-4 py-2 text-sm" onClick={() => setCreating(false)} type="button">Cancel</button></div>
        </form>
      )}

      {selectedExam && (
        <>
          <section className="grid gap-5 rounded-xl border border-line bg-panel p-5 lg:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{selectedExam.name}</h2>
                    <StatusBadge status={selectedExam.status} />
                    {selectedExam.isFinal && <span className="rounded-full bg-amber/20 px-2.5 py-1 text-xs font-semibold text-navy">Final exam</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{selectedExam.term?.name ?? "No term"} · {selectedExam.subjectSetupCount} class-subject setups</p>
                </div>
                {canManage && selectedExam.status === "DRAFT" && (
                  <button className="rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={!selectedExam.subjectSetupCount || openMutation.isPending} onClick={() => openMutation.mutate(selectedExam.id)} type="button">{openMutation.isPending ? "Opening…" : "Open for marks"}</button>
                )}
              </div>
              {canManage && selectedExam.status === "DRAFT" && (
                <ExamDetailsEditor
                  exam={selectedExam}
                  key={selectedExam.id}
                  pending={updateMutation.isPending}
                  terms={years.find((year) => year.id === selectedYearId)?.terms ?? []}
                  onSave={(changes) => updateMutation.mutate({ examId: selectedExam.id, changes })}
                />
              )}
              {canManage && selectedExam.status === "DRAFT" && (
                <div className="flex justify-end border-t border-line pt-3">
                  <button className="text-sm font-medium text-coral hover:underline" onClick={() => window.confirm(`Delete "${selectedExam.name}"?`) && deleteMutation.mutate(selectedExam.id)} type="button">Delete draft exam</button>
                </div>
              )}
            </div>
            <div className="flex min-w-44 flex-col justify-center gap-2 rounded-lg bg-background p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Workflow</p>
              <p className="text-2xl font-bold text-teal">{selectedExam.status}</p>
              <p className="text-xs text-muted">Draft → Open → Locked → Published</p>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Class subject setup</h2><p className="mt-1 text-sm text-muted">Only subjects in this year’s class curriculum can be configured.</p></div>
              {canManage && selectedExam.status === "DRAFT" && exams.some((exam) => exam.id !== selectedExam.id && exam.subjectSetupCount > 0) && (
                <div className="flex items-center gap-2">
                  <select aria-label="Copy setup from exam" className={`${inputClass} mt-0 min-w-48`} onChange={(event) => setCopySourceId(event.target.value)} value={copySourceId}><option value="">Copy setup from…</option>{exams.filter((exam) => exam.id !== selectedExam.id && exam.subjectSetupCount > 0).map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select>
                  <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-teal disabled:opacity-50" disabled={!copySourceId || copyMutation.isPending} onClick={() => copyMutation.mutate({ examId: selectedExam.id, sourceExamId: copySourceId, classId: selectedClassId })} type="button">Copy</button>
                </div>
              )}
            </div>

            {curriculumQuery.isPending || setupQuery.isPending ? <StatusBox>Loading curriculum and exam setup…</StatusBox> :
              curriculumQuery.isError || setupQuery.isError ? <ErrorBox error={curriculumQuery.error ?? setupQuery.error} retry={() => { void curriculumQuery.refetch(); void setupQuery.refetch(); }} /> :
              !selectedClassId ? <StatusBox>Create an active class before configuring subjects.</StatusBox> :
              <ExamSubjectSetupEditor
                canManage={canManage && selectedExam.status === "DRAFT"}
                key={`${selectedExam.id}:${selectedClassId}:${setupQuery.dataUpdatedAt}`}
                curriculum={curriculumQuery.data?.subjects ?? []}
                initial={setupQuery.data?.subjects ?? []}
                isPending={saveSetupMutation.isPending}
                onSave={(subjects) => saveSetupMutation.mutate({ examId: selectedExam.id, classId: selectedClassId, subjects })}
              />}
          </section>
        </>
      )}
    </main>
  );
}

function ExamSubjectSetupEditor({
  canManage,
  curriculum,
  initial,
  isPending,
  onSave,
}: {
  canManage: boolean;
  curriculum: { subjectId: string; code: string; name: string; isActive: boolean }[];
  initial: { subjectId: string; fullTheory: number; passTheory: number; fullPractical: number | null; passPractical: number | null; examDate: string | null }[];
  isPending: boolean;
  onSave: (subjects: ExamSubjectInput[]) => void;
}) {
  const [rows, setRows] = useState(() => curriculum.map((subject) => {
    const configured = initial.find((item) => item.subjectId === subject.subjectId);
    return {
      ...subject,
      selected: Boolean(configured),
      fullTheory: String(configured?.fullTheory ?? 100),
      passTheory: String(configured?.passTheory ?? 35),
      fullPractical: configured?.fullPractical == null ? "" : String(configured.fullPractical),
      passPractical: configured?.passPractical == null ? "" : String(configured.passPractical),
      examDate: configured?.examDate ?? "",
    };
  }));
  const selectedCount = rows.filter((row) => row.selected).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subjects = rows.filter((row) => row.selected).map((row) => ({
      subjectId: row.subjectId,
      fullTheory: Number(row.fullTheory),
      passTheory: Number(row.passTheory),
      ...(row.fullPractical ? { fullPractical: Number(row.fullPractical), passPractical: Number(row.passPractical || 0) } : {}),
      ...(row.examDate ? { examDate: row.examDate } : {}),
    }));
    onSave(subjects);
  }

  if (!curriculum.length) {
    return <StatusBox>No class curriculum found. Configure class subjects before exam setup.</StatusBox>;
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">{selectedCount} of {rows.length} curriculum subjects selected</p>{canManage && <button className="text-sm font-semibold text-teal hover:underline" onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: true })))} type="button">Select all</button>}</div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Include</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Theory full/pass</th><th className="px-3 py-3">Practical full/pass</th><th className="px-3 py-3">Exam date</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr className={!row.selected ? "opacity-55" : ""} key={row.subjectId}>
                <td className="px-3 py-3"><input aria-label={`Include ${row.name}`} checked={row.selected} className="h-4 w-4 accent-teal" disabled={!canManage} onChange={(event) => setRows((current) => current.map((item) => item.subjectId === row.subjectId ? { ...item, selected: event.target.checked } : item))} type="checkbox" /></td>
                <td className="px-3 py-3"><span className="font-medium">{row.name}</span><span className="ml-2 text-xs text-muted">{row.code}{row.isActive ? "" : " · inactive"}</span></td>
                <td className="px-3 py-3"><div className="flex gap-2"><input aria-label={`${row.name} full theory`} className={`${inputClass} w-24`} disabled={!canManage || !row.selected} max={1000} min={1} onChange={(event) => setRows((current) => current.map((item) => item.subjectId === row.subjectId ? { ...item, fullTheory: event.target.value } : item))} required={row.selected} type="number" value={row.fullTheory} /><input aria-label={`${row.name} pass theory`} className={`${inputClass} w-24`} disabled={!canManage || !row.selected} max={1000} min={0} onChange={(event) => setRows((current) => current.map((item) => item.subjectId === row.subjectId ? { ...item, passTheory: event.target.value } : item))} required={row.selected} type="number" value={row.passTheory} /></div></td>
                <td className="px-3 py-3"><div className="flex gap-2"><input aria-label={`${row.name} full practical`} className={`${inputClass} w-24`} disabled={!canManage || !row.selected} max={1000} min={1} onChange={(event) => setRows((current) => current.map((item) => item.subjectId === row.subjectId ? { ...item, fullPractical: event.target.value, passPractical: item.passPractical || String(Math.round(Number(event.target.value) * 0.4 * 100) / 100) } : item))} placeholder="Optional" type="number" value={row.fullPractical} /><input aria-label={`${row.name} pass practical`} className={`${inputClass} w-24`} disabled={!canManage || !row.selected || !row.fullPractical} max={1000} min={0} onChange={(event) => setRows((current) => current.map((item) => item.subjectId === row.subjectId ? { ...item, passPractical: event.target.value } : item))} placeholder="Pass" required={row.selected && Boolean(row.fullPractical)} type="number" value={row.passPractical} /></div></td>
                <td className="px-3 py-3"><input aria-label={`${row.name} exam date`} className={inputClass} disabled={!canManage || !row.selected} onChange={(event) => setRows((current) => current.map((item) => item.subjectId === row.subjectId ? { ...item, examDate: event.target.value } : item))} type="date" value={row.examDate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && <div className="flex justify-end"><button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={isPending || selectedCount > 60} type="submit">{isPending ? "Saving setup…" : "Save class setup"}</button></div>}
    </form>
  );
}

function ExamDetailsEditor({
  exam,
  terms,
  pending,
  onSave,
}: {
  exam: Exam;
  terms: { id: string; name: string }[];
  pending: boolean;
  onSave: (changes: Partial<ExamInput>) => void;
}) {
  const [name, setName] = useState(exam.name);
  const [sequence, setSequence] = useState(String(exam.sequence));
  const [termId, setTermId] = useState(exam.term?.id ?? "");
  const [isFinal, setIsFinal] = useState(exam.isFinal);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ name: name.trim(), sequence: Number(sequence), termId: termId || null, isFinal });
  }

  return (
    <form className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4" onSubmit={submit}>
      <label className="text-xs font-semibold text-muted">Name<input className={inputClass} maxLength={60} onChange={(event) => setName(event.target.value)} required value={name} /></label>
      <label className="text-xs font-semibold text-muted">Sequence<input className={inputClass} max={20} min={1} onChange={(event) => setSequence(event.target.value)} required type="number" value={sequence} /></label>
      <label className="text-xs font-semibold text-muted">Term<select className={inputClass} onChange={(event) => setTermId(event.target.value)} value={termId}><option value="">No term</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
      <div className="flex items-end justify-between gap-2"><label className="flex items-center gap-2 pb-2 text-sm"><input checked={isFinal} className="accent-teal" onChange={(event) => setIsFinal(event.target.checked)} type="checkbox" />Final</label><button className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-teal disabled:opacity-50" disabled={pending} type="submit">Save exam</button></div>
    </form>
  );
}

function StatusBadge({ status }: { status: Exam["status"] }) {
  const styles: Record<Exam["status"], string> = {
    DRAFT: "bg-background text-muted",
    OPEN: "bg-teal/10 text-teal",
    LOCKED: "bg-amber/20 text-navy",
    PUBLISHED: "bg-navy text-white",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}

export function StatusBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-panel p-5 text-sm text-muted">{children}</div>;
}

export function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="rounded-lg border border-coral bg-panel p-4 text-sm text-coral" role="alert">
      <p>{message(error)}</p>
      <button className="mt-2 font-semibold underline" onClick={retry} type="button">Try again</button>
    </div>
  );
}
