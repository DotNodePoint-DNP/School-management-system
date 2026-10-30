"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { ErrorBox, StatusBox } from "./ExamSetupWorkspace";
import {
  getExamProgress,
  getMarkChanges,
  getMyExamSheets,
  lockExam,
  publishExam,
  type ExamProgress,
  type ExamProgressItem,
  unlockExam,
} from "./services/marks";
import { listExamYears, listExams } from "./services/exams";

const fieldClass = "mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

function message(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "The request failed.";
}

export default function ExamWorkflowWorkspace({
  canReviewAll,
  canLock,
  canPublish,
  canReadChanges,
}: {
  canReviewAll: boolean;
  canLock: boolean;
  canPublish: boolean;
  canReadChanges: boolean;
}) {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery({ queryKey: ["examination", "years"], queryFn: listExamYears });
  const years = yearsQuery.data ?? [];
  const defaultYear = years.find((year) => year.status === "ACTIVE") ?? years[0];
  const [yearId, setYearId] = useState("");
  const selectedYearId = yearId || defaultYear?.id || "";
  const examsQuery = useQuery({
    queryKey: ["examination", "exams", selectedYearId],
    queryFn: () => listExams(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const exams = examsQuery.data ?? [];
  const [examId, setExamId] = useState("");
  const selectedExam = exams.find((exam) => exam.id === examId) ?? exams.find((exam) => exam.status !== "DRAFT");
  const progressQuery = useQuery({
    queryKey: ["examination", canReviewAll ? "progress" : "my-sheets", selectedExam?.id],
    queryFn: async (): Promise<{ progress: ExamProgress | null; sheets: ExamProgressItem[] }> => {
      if (canReviewAll) {
        const result = await getExamProgress(selectedExam!.id);
        return { progress: result, sheets: result.sheets };
      }
      return { progress: null, sheets: await getMyExamSheets(selectedExam!.id) };
    },
    enabled: Boolean(selectedExam),
  });
  const [showCorrections, setShowCorrections] = useState(false);
  const changesQuery = useQuery({
    queryKey: ["examination", "mark-changes", selectedExam?.id],
    queryFn: () => getMarkChanges({ examId: selectedExam!.id, limit: 50 }),
    enabled: Boolean(canReadChanges && showCorrections && selectedExam),
  });
  const [unlockReason, setUnlockReason] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["examination", "exams"] });
    void queryClient.invalidateQueries({ queryKey: ["examination", "progress"] });
  };
  const lockMutation = useMutation({
    mutationFn: () => lockExam(selectedExam!.id),
    onSuccess: () => { toast.success("Exam locked."); refresh(); },
    onError: (error) => toast.error(message(error)),
  });
  const publishMutation = useMutation({
    mutationFn: () => publishExam(selectedExam!.id),
    onSuccess: () => { toast.success("Exam results published."); refresh(); },
    onError: (error) => toast.error(message(error)),
  });
  const unlockMutation = useMutation({
    mutationFn: () => unlockExam(selectedExam!.id, unlockReason),
    onSuccess: () => { toast.success("Exam unlocked."); setUnlockReason(""); refresh(); },
    onError: (error) => toast.error(message(error)),
  });

  if (yearsQuery.isPending) return <StatusBox>Loading exam workflow…</StatusBox>;
  if (yearsQuery.isError) return <ErrorBox error={yearsQuery.error} retry={() => void yearsQuery.refetch()} />;
  const progress = progressQuery.data?.progress ?? null;
  const sheets = progressQuery.data?.sheets ?? [];

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Examination workflow</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Marks review & publishing</h1>
        <p className="mt-1 text-sm text-muted">Track sheet completion and manage exam lock and publication gates.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Academic year<select className={fieldClass} onChange={(event) => { setYearId(event.target.value); setExamId(""); }} value={selectedYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
        <label className="text-sm font-medium">Exam<select className={fieldClass} onChange={(event) => setExamId(event.target.value)} value={selectedExam?.id ?? ""}><option value="">Select an exam</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.sequence}. {exam.name} · {exam.status}</option>)}</select></label>
      </div>
      {examsQuery.isError && <ErrorBox error={examsQuery.error} retry={() => void examsQuery.refetch()} />}
      {!selectedExam && !examsQuery.isPending && <StatusBox>No exam workflow is available for this academic year.</StatusBox>}
      {selectedExam && (
        <section className="space-y-5 rounded-xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm text-muted">Selected exam</p><h2 className="text-xl font-semibold">{selectedExam.name}</h2></div>
            <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${selectedExam.status === "PUBLISHED" ? "bg-navy text-white" : selectedExam.status === "LOCKED" ? "bg-amber/20 text-navy" : "bg-teal/10 text-teal"}`}>{selectedExam.status}</span>
          </div>
          {progressQuery.isPending ? <StatusBox>Loading assigned mark sheets…</StatusBox> :
            progressQuery.isError ? <ErrorBox error={progressQuery.error} retry={() => void progressQuery.refetch()} /> :
            <>
              {progress && <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Sheets submitted" value={`${progress.submitted} / ${progress.total}`} />
                <Metric label="Remaining" value={String(Math.max(progress.total - progress.submitted, 0))} />
                <Metric label="Completion" value={`${progress.total ? Math.round((progress.submitted / progress.total) * 100) : 0}%`} />
              </div>}
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Class / section</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Assigned teacher</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-line">{sheets.map((sheet) => <tr key={`${sheet.sectionId}:${sheet.subjectId}`}>
                    <td className="px-3 py-3 font-medium">{sheet.className} · {sheet.sectionName}</td>
                    <td className="px-3 py-3">{sheet.subjectCode} · {sheet.subjectName}</td>
                    <td className="px-3 py-3">{sheet.teacher?.name ?? "—"}</td>
                    <td className="px-3 py-3">{sheet.entered}/{sheet.students}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold">{sheet.status.replace("_", " ")}</span></td>
                  </tr>)}</tbody>
                </table>
                {!sheets.length && <p className="p-5 text-sm text-muted">No assigned sheets found.</p>}
              </div>
            </>}
          {selectedExam.status === "OPEN" && canLock && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-background p-4">
              <div><h3 className="font-semibold">Lock marks</h3><p className="text-sm text-muted">Locking is available only after every required sheet is submitted.</p></div>
              <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={lockMutation.isPending || !canReviewAll || !progress || progress.submitted !== progress.total} onClick={() => lockMutation.mutate()} type="button">{lockMutation.isPending ? "Locking…" : "Lock exam"}</button>
            </div>
          )}
          {selectedExam.status === "LOCKED" && (
            <div className="grid gap-4 rounded-lg border border-line bg-background p-4 md:grid-cols-2">
              {canPublish && <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Publish results</h3><p className="text-sm text-muted">Make this exam’s results available.</p></div><button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()} type="button">{publishMutation.isPending ? "Publishing…" : "Publish"}</button></div>}
              {canLock && <div className="flex items-end gap-2"><label className="flex-1 text-xs font-semibold text-muted">Unlock reason (10–500 chars)<input className={fieldClass} maxLength={500} minLength={10} onChange={(event) => setUnlockReason(event.target.value)} value={unlockReason} /></label><button className="rounded-md border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={unlockReason.trim().length < 10 || unlockMutation.isPending} onClick={() => unlockMutation.mutate()} type="button">Unlock</button></div>}
            </div>
          )}
          {canReadChanges && <div className="space-y-3 border-t border-line pt-4">
            <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-teal" onClick={() => setShowCorrections((value) => !value)} type="button">{showCorrections ? "Hide" : "View"} mark correction history</button>
            {showCorrections && (changesQuery.isPending ? <StatusBox>Loading correction history…</StatusBox> : changesQuery.isError ? <ErrorBox error={changesQuery.error} retry={() => void changesQuery.refetch()} /> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Changed</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Previous → current</th><th className="px-3 py-3">Changed by</th><th className="px-3 py-3">Reason</th></tr></thead><tbody className="divide-y divide-line">{(changesQuery.data?.items ?? []).map((change) => <tr key={change.id}><td className="px-3 py-3">{new Date(change.changedAt).toLocaleString()}</td><td className="px-3 py-3">{change.studentName ?? "Student"}<span className="block text-xs text-muted">{change.admissionNo ?? ""}</span></td><td className="px-3 py-3">{change.subjectCode ?? "—"}</td><td className="px-3 py-3">{formatMarks(change.from)} → {formatMarks(change.to)}</td><td className="px-3 py-3">{change.changedByName ?? "—"}</td><td className="max-w-72 px-3 py-3">{change.reason}</td></tr>)}</tbody></table>{!changesQuery.data?.items.length && <p className="p-4 text-sm text-muted">No corrections recorded for this exam.</p>}</div>)}
          </div>}
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-teal">{value}</p></div>;
}

function formatMarks(value: { theory: number | null; practical: number | null; absent: boolean } | null) {
  if (!value) return "No previous mark";
  if (value.absent) return "Absent";
  return [value.theory, value.practical].filter((mark) => mark !== null).join(" + ") || "—";
}
