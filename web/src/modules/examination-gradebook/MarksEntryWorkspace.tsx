"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { ErrorBox, StatusBox } from "./ExamSetupWorkspace";
import {
  correctMark,
  getMarkSheet,
  reopenMarkSheet,
  saveMarks,
  submitMarkSheet,
  type MarkEntryInput,
  type MarkSheet,
  type MarkStudent,
} from "./services/marks";
import {
  getExamSetup,
  listExamClasses,
  listExamYears,
  listExams,
} from "./services/exams";

const fieldClass = "w-full rounded-md border border-line bg-panel px-2.5 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60";

function errorText(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "The request failed.";
}

type DraftMark = { theory: string; practical: string; absent: boolean };

export default function MarksEntryWorkspace({
  canReopen,
  canCorrect,
}: {
  canReopen: boolean;
  canCorrect: boolean;
}) {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery({ queryKey: ["examination", "years"], queryFn: listExamYears });
  const classesQuery = useQuery({ queryKey: ["examination", "classes"], queryFn: listExamClasses });
  const years = yearsQuery.data ?? [];
  const activeYear = years.find((year) => year.status === "ACTIVE") ?? years[0];
  const [yearId, setYearId] = useState("");
  const selectedYearId = yearId || activeYear?.id || "";
  const examsQuery = useQuery({
    queryKey: ["examination", "exams", selectedYearId],
    queryFn: () => listExams(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const availableExams = (examsQuery.data ?? []).filter((exam) => exam.status !== "DRAFT");
  const [examId, setExamId] = useState("");
  const selectedExam = availableExams.find((exam) => exam.id === examId) ?? availableExams[0];
  const classes = (classesQuery.data ?? []).filter((schoolClass) => schoolClass.isActive);
  const [classId, setClassId] = useState("");
  const selectedClass = classes.find((schoolClass) => schoolClass.id === classId) ?? classes[0];
  const sections = selectedClass?.sections.filter((section) => section.isActive) ?? [];
  const [sectionId, setSectionId] = useState("");
  const selectedSection = sections.find((section) => section.id === sectionId) ?? sections[0];
  const setupQuery = useQuery({
    queryKey: ["examination", "setup", selectedExam?.id, selectedClass?.id],
    queryFn: () => getExamSetup(selectedExam!.id, selectedClass!.id),
    enabled: Boolean(selectedExam && selectedClass),
  });
  const subjects = setupQuery.data?.subjects ?? [];
  const [subjectId, setSubjectId] = useState("");
  const selectedSubject = subjects.find((subject) => subject.subjectId === subjectId) ?? subjects[0];
  const sheetQuery = useQuery({
    queryKey: ["examination", "marks", selectedExam?.id, selectedSection?.id, selectedSubject?.subjectId],
    queryFn: () => getMarkSheet(selectedExam!.id, selectedSection!.id, selectedSubject!.subjectId),
    enabled: Boolean(selectedExam && selectedSection && selectedSubject),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["examination", "marks"] });
    void queryClient.invalidateQueries({ queryKey: ["examination", "progress"] });
  };

  if (yearsQuery.isPending || classesQuery.isPending) return <StatusBox>Loading exam and class data…</StatusBox>;
  if (yearsQuery.isError || classesQuery.isError) {
    return <ErrorBox error={yearsQuery.error ?? classesQuery.error} retry={() => { void yearsQuery.refetch(); void classesQuery.refetch(); }} />;
  }

  const sheet = sheetQuery.data;
  const sheetKey = sheet ? `${sheet.sheet.id}:${sheet.sheet.status}:${sheet.students.map((student) => `${student.enrollmentId}-${student.theory}-${student.practical}-${student.absent}`).join("|")}` : "";
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Teacher workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Marks entry</h1>
        <p className="mt-1 text-sm text-muted">Enter, save, and submit marks for your assigned exam sheets.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-medium">Academic year<select className={`${fieldClass} mt-1`} onChange={(event) => { setYearId(event.target.value); setExamId(""); }} value={selectedYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
        <label className="text-sm font-medium">Exam<select className={`${fieldClass} mt-1`} onChange={(event) => setExamId(event.target.value)} value={selectedExam?.id ?? ""}><option value="">Select</option>{availableExams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} · {exam.status}</option>)}</select></label>
        <label className="text-sm font-medium">Class<select className={`${fieldClass} mt-1`} onChange={(event) => { setClassId(event.target.value); setSectionId(""); }} value={selectedClass?.id ?? ""}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">Section<select className={`${fieldClass} mt-1`} onChange={(event) => setSectionId(event.target.value)} value={selectedSection?.id ?? ""}>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">Subject<select className={`${fieldClass} mt-1`} onChange={(event) => setSubjectId(event.target.value)} value={selectedSubject?.subjectId ?? ""}>{subjects.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.code} · {item.name}</option>)}</select></label>
      </div>
      {examsQuery.isError && <ErrorBox error={examsQuery.error} retry={() => void examsQuery.refetch()} />}
      {setupQuery.isError && <ErrorBox error={setupQuery.error} retry={() => void setupQuery.refetch()} />}
      {!selectedExam && <StatusBox>No opened or locked exams are available for this academic year.</StatusBox>}
      {selectedExam && selectedClass && !sections.length && <StatusBox>This class has no active sections.</StatusBox>}
      {selectedExam && selectedSection && !subjects.length && !setupQuery.isPending && !setupQuery.isError && <StatusBox>No subjects are configured for this exam and class.</StatusBox>}
      {sheetQuery.isPending && selectedSubject && <StatusBox>Loading marks sheet…</StatusBox>}
      {sheetQuery.isError && <ErrorBox error={sheetQuery.error} retry={() => void sheetQuery.refetch()} />}
      {sheet && selectedExam && selectedSection && selectedSubject && (
        <MarkSheetEditor
          canCorrect={canCorrect}
          canReopen={canReopen}
          examId={selectedExam.id}
          key={sheetKey}
          onRefresh={refresh}
          sectionId={selectedSection.id}
          sheet={sheet}
          subjectId={selectedSubject.subjectId}
        />
      )}
    </main>
  );
}

function MarkSheetEditor({
  sheet,
  examId,
  sectionId,
  subjectId,
  canReopen,
  canCorrect,
  onRefresh,
}: {
  sheet: MarkSheet;
  examId: string;
  sectionId: string;
  subjectId: string;
  canReopen: boolean;
  canCorrect: boolean;
  onRefresh: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, DraftMark>>(() => Object.fromEntries(sheet.students.map((student) => [student.enrollmentId, {
    theory: student.theory == null ? "" : String(student.theory),
    practical: student.practical == null ? "" : String(student.practical),
    absent: student.absent,
  }])));
  const [dirty, setDirty] = useState<string[]>([]);
  const [reopenReason, setReopenReason] = useState("");
  const [correctionId, setCorrectionId] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const completeCount = sheet.students.filter((student) => student.onRoster).filter((student) => {
    const mark = drafts[student.enrollmentId];
    return mark && (mark.absent || (mark.theory !== "" && (sheet.setup.fullPractical == null || mark.practical !== "")));
  }).length;

  const saveMutation = useMutation({
    mutationFn: async (entries: MarkEntryInput[]) => {
      for (let index = 0; index < entries.length; index += 200) {
        await saveMarks(examId, sectionId, subjectId, entries.slice(index, index + 200));
      }
    },
    onSuccess: () => { toast.success("Marks saved as a draft."); setDirty([]); onRefresh(); },
    onError: (error) => toast.error(errorText(error)),
  });
  const submitMutation = useMutation({
    mutationFn: () => submitMarkSheet(examId, sectionId, subjectId),
    onSuccess: () => { toast.success("Marks sheet submitted."); onRefresh(); },
    onError: (error) => toast.error(errorText(error)),
  });
  const reopenMutation = useMutation({
    mutationFn: () => reopenMarkSheet(examId, sectionId, subjectId, reopenReason),
    onSuccess: () => { toast.success("Marks sheet reopened."); setReopenReason(""); onRefresh(); },
    onError: (error) => toast.error(errorText(error)),
  });
  const correctionMutation = useMutation({
    mutationFn: (input: { student: MarkStudent; mark: DraftMark; reason: string }) =>
      correctMark(examId, sectionId, subjectId, input.student.enrollmentId, {
        ...(input.mark.theory !== "" ? { theory: Number(input.mark.theory) } : {}),
        ...(input.mark.practical !== "" ? { practical: Number(input.mark.practical) } : {}),
        ...(input.mark.absent ? { absent: true } : {}),
        reason: input.reason,
      }),
    onSuccess: () => { toast.success("Correction recorded."); setCorrectionId(""); setCorrectionReason(""); onRefresh(); },
    onError: (error) => toast.error(errorText(error)),
  });

  function updateDraft(student: MarkStudent, change: Partial<DraftMark>) {
    setDrafts((current) => ({ ...current, [student.enrollmentId]: { ...current[student.enrollmentId], ...change } }));
    setDirty((current) => current.includes(student.enrollmentId) ? current : [...current, student.enrollmentId]);
  }

  function save() {
    const entries = dirty.flatMap<MarkEntryInput>((enrollmentId): MarkEntryInput[] => {
      const student = sheet.students.find((item) => item.enrollmentId === enrollmentId)!;
      const mark = drafts[enrollmentId];
      if (mark.absent) return [{ enrollmentId, absent: true }];
      if (mark.theory === "" && mark.practical === "") {
        return student.theory != null || student.practical != null || student.absent
          ? [{ enrollmentId, clear: true }]
          : [];
      }
      return [{
        enrollmentId,
        ...(mark.theory !== "" ? { theory: Number(mark.theory) } : {}),
        ...(mark.practical !== "" ? { practical: Number(mark.practical) } : {}),
      }];
    });
    if (entries.length) saveMutation.mutate(entries);
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{sheet.subject.name} <span className="font-normal text-muted">· {sheet.sectionName}</span></h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sheet.sheet.status === "SUBMITTED" ? "bg-navy text-white" : sheet.sheet.status === "DRAFT" ? "bg-amber/20 text-navy" : "bg-teal/10 text-teal"}`}>{sheet.sheet.status}</span></div>
          <p className="mt-1 text-sm text-muted">{sheet.counts.entered}/{sheet.counts.total} entered · {completeCount}/{sheet.counts.total} complete · Theory {sheet.setup.fullTheory}{sheet.setup.fullPractical != null ? ` + Practical ${sheet.setup.fullPractical}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sheet.editableByMe && <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={!dirty.length || saveMutation.isPending} onClick={save} type="button">{saveMutation.isPending ? "Saving…" : `Save draft${dirty.length ? ` (${dirty.length})` : ""}`}</button>}
          {sheet.editableByMe && <button className="rounded-md border border-teal px-4 py-2 text-sm font-semibold text-teal disabled:opacity-50" disabled={sheet.counts.complete !== sheet.counts.total || dirty.length > 0 || submitMutation.isPending} onClick={() => submitMutation.mutate()} type="button">{submitMutation.isPending ? "Submitting…" : "Submit sheet"}</button>}
        </div>
      </div>
      {!sheet.editableByMe && !sheet.correctableByMe && <p className="rounded-md bg-background p-3 text-sm text-muted">This sheet is read-only for your account.</p>}
      {sheet.sheet.status === "SUBMITTED" && canReopen && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-background p-3">
          <label className="min-w-60 flex-1 text-xs font-semibold text-muted">Reason to reopen (10–500 characters)<input className={`${fieldClass} mt-1`} maxLength={500} minLength={10} onChange={(event) => setReopenReason(event.target.value)} value={reopenReason} /></label>
          <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={reopenReason.trim().length < 10 || reopenMutation.isPending} onClick={() => reopenMutation.mutate()} type="button">Reopen sheet</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Roll</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Theory / {sheet.setup.fullTheory}</th>{sheet.setup.fullPractical != null && <th className="px-3 py-3">Practical / {sheet.setup.fullPractical}</th>}<th className="px-3 py-3">Absent</th>{canCorrect && <th className="px-3 py-3">Correction</th>}</tr></thead>
          <tbody className="divide-y divide-line">{sheet.students.map((student) => {
            const mark = drafts[student.enrollmentId] ?? { theory: "", practical: "", absent: false };
            const editable = sheet.editableByMe && student.onRoster;
            return <tr key={student.enrollmentId}>
              <td className="px-3 py-3 font-medium">{student.rollNo ?? "—"}</td>
              <td className="px-3 py-3"><span className="font-medium">{student.name}</span><span className="block text-xs text-muted">{student.admissionNo}</span>{!student.onRoster && <span className="mt-1 inline-block rounded bg-amber/20 px-2 py-0.5 text-[10px] font-semibold text-navy">Not on current roster</span>}</td>
              <td className="px-3 py-3"><input aria-label={`Theory marks for ${student.name}`} className={fieldClass} disabled={!editable || mark.absent} max={sheet.setup.fullTheory} min={0} onChange={(event) => updateDraft(student, { theory: event.target.value })} step="0.01" type="number" value={mark.theory} /></td>
              {sheet.setup.fullPractical != null && <td className="px-3 py-3"><input aria-label={`Practical marks for ${student.name}`} className={fieldClass} disabled={!editable || mark.absent} max={sheet.setup.fullPractical} min={0} onChange={(event) => updateDraft(student, { practical: event.target.value })} step="0.01" type="number" value={mark.practical} /></td>}
              <td className="px-3 py-3"><input aria-label={`${student.name} absent`} checked={mark.absent} className="h-4 w-4 accent-coral" disabled={!editable} onChange={(event) => updateDraft(student, { absent: event.target.checked, ...(event.target.checked ? { theory: "", practical: "" } : {}) })} type="checkbox" /></td>
              {canCorrect && <td className="px-3 py-3">{sheet.correctableByMe && <button className="text-xs font-semibold text-teal underline disabled:opacity-50" disabled={dirty.length > 0} onClick={() => { setCorrectionId(student.enrollmentId); setCorrectionReason(""); }} type="button">Correct</button>}</td>}
            </tr>;
          })}</tbody>
        </table>
      </div>
      {correctionId && sheet.correctableByMe && (() => {
        const student = sheet.students.find((item) => item.enrollmentId === correctionId);
        const mark = drafts[correctionId] ?? { theory: "", practical: "", absent: false };
        const hasMark = mark.absent || mark.theory !== "" || mark.practical !== "";
        return <div className="grid gap-3 rounded-lg border border-amber bg-background p-4 md:grid-cols-[1fr_auto]">
          <div><p className="text-sm font-medium">Correction for {student?.name ?? "student"}</p><label className="mt-2 block text-xs font-semibold text-muted">Correction reason (10–500 characters)<input className={`${fieldClass} mt-1`} maxLength={500} minLength={10} onChange={(event) => setCorrectionReason(event.target.value)} value={correctionReason} /></label></div>
          <div className="flex items-end gap-2"><button className="rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!student || !hasMark || dirty.length > 0 || correctionReason.trim().length < 10 || correctionMutation.isPending} onClick={() => { if (student) correctionMutation.mutate({ student, mark, reason: correctionReason }); }} type="button">Record correction</button><button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => setCorrectionId("")} type="button">Cancel</button></div>
        </div>;
      })()}
    </section>
  );
}
