"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { listAcademicYears } from "@/modules/settings/services/academic-setup";
import {
  applyPromotion,
  buildPromotionPlan,
  finalizePromotionRolls,
  getPromotionClassDecisions,
  getPromotionSummary,
  undoPromotionDecision,
  updatePromotionDecision,
} from "./services/promotion";

const fieldClass = "h-10 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function PromotionWorkspace({ permissions }: { permissions: readonly string[] }) {
  const queryClient = useQueryClient();
  const canRead = permissions.includes("promotion:read");
  const canManage = permissions.includes("promotion:manage");
  const canApply = permissions.includes("promotion:apply");
  const [fromYearSelection, setFromYearSelection] = useState("");
  const [toYearSelection, setToYearSelection] = useState("");
  const [classSelection, setClassSelection] = useState("");
  const [acknowledgeEarly, setAcknowledgeEarly] = useState(false);
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears, enabled: canRead || canManage, retry: false });
  const years = yearsQuery.data ?? [];
  const activeYears = years.filter((year) => year.status === "ACTIVE");
  const fromYearId = activeYears.some((year) => year.id === fromYearSelection)
    ? fromYearSelection
    : activeYears[0]?.id ?? "";
  const sourceYear = years.find((year) => year.id === fromYearId);
  const targetYears = years.filter((year) => year.id !== fromYearId && year.status === "PLANNED");
  const toYearId = targetYears.some((year) => year.id === toYearSelection)
    ? toYearSelection
    : targetYears[0]?.id ?? "";

  const summaryQuery = useQuery({
    queryKey: ["promotion", fromYearId, toYearId],
    queryFn: () => getPromotionSummary(fromYearId, { toYearId }),
    enabled: Boolean(canRead && fromYearId && toYearId),
    retry: false,
  });
  const summary = summaryQuery.data;
  const classRows = summary?.classes ?? [];
  const classId = classRows.some((row) => row.classId === classSelection)
    ? classSelection
    : classRows[0]?.classId ?? "";
  const decisionsQuery = useQuery({
    queryKey: ["promotion", fromYearId, toYearId, "class", classId],
    queryFn: () => getPromotionClassDecisions(fromYearId, classId, { toYearId }),
    enabled: Boolean(summary && classId),
    retry: false,
  });
  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["promotion", fromYearId, toYearId] }),
    queryClient.invalidateQueries({ queryKey: ["promotion", fromYearId, toYearId, "class"] }),
    queryClient.invalidateQueries({ queryKey: ["academic-years"] }),
  ]);
  const buildMutation = useMutation({
    mutationFn: () => buildPromotionPlan(fromYearId, toYearId),
    onSuccess: async (result) => { await refresh(); toast.success(`Plan refreshed for ${result.totals.students} students.`); },
    onError: (error) => toast.error(message(error)),
  });
  const decisionMutation = useMutation({
    mutationFn: (input: { enrollmentId: string; action: "PROMOTE" | "REPEAT" | "GRADUATE" | "HOLD" }) =>
      updatePromotionDecision(fromYearId, input.enrollmentId, { action: input.action }, { toYearId }),
    onSuccess: async () => { await refresh(); toast.success("Promotion decision updated."); },
    onError: (error) => toast.error(message(error)),
  });
  const applyMutation = useMutation({
    mutationFn: () => applyPromotion(fromYearId, { toYearId, ...(acknowledgeEarly ? { acknowledgeEarly: true } : {}) }),
    onSuccess: async (result) => { await refresh(); toast.success(`Promotion run complete: ${result.totals.moved} moved, ${result.totals.graduated} graduated, ${result.totals.blocked} blocked.`); },
    onError: (error) => toast.error(message(error)),
  });
  const finalizeMutation = useMutation({
    mutationFn: () => finalizePromotionRolls(fromYearId, { toYearId }),
    onSuccess: (result) => toast.success(`Roll numbers finalized for ${result.sections.length} section(s).`),
    onError: (error) => toast.error(message(error)),
  });
  const undoMutation = useMutation({
    mutationFn: (enrollmentId: string) => undoPromotionDecision(fromYearId, enrollmentId, { toYearId }),
    onSuccess: async () => { await refresh(); toast.success("Student enrollment move was undone."); },
    onError: (error) => toast.error(message(error)),
  });

  if (!canRead && !canManage) return <div className="rounded-xl border border-line bg-panel p-8 text-sm text-muted">Your account does not have permission to access promotion planning.</div>;
  const noPlan = summaryQuery.isError && summaryQuery.error instanceof ApiClientError && summaryQuery.error.status === 404;
  const otherError = yearsQuery.error ?? decisionsQuery.error ?? (summaryQuery.isError && !noPlan ? summaryQuery.error : null);
  const early = sourceYear ? new Date(`${sourceYear.endDate}T23:59:59`) > new Date() : false;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="border-b border-line pb-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Academic operations</p><h1 className="mt-1 text-2xl font-black tracking-tight text-ink">Promotion planning</h1><p className="mt-1 text-sm text-muted">Review published results, adjust student decisions, and apply the next-year enrollment plan.</p></header>
      {otherError && <p role="alert" className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-coral">{message(otherError)}</p>}
      <section className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2"><label className="space-y-1 text-xs font-semibold text-muted">From academic year<select value={fromYearId} onChange={(event) => setFromYearSelection(event.target.value)} className={`${fieldClass} w-full`}>{activeYears.map((year) => <option key={year.id} value={year.id}>{year.name} · active</option>)}</select></label><label className="space-y-1 text-xs font-semibold text-muted">To academic year<select value={toYearId} onChange={(event) => setToYearSelection(event.target.value)} className={`${fieldClass} w-full`}>{targetYears.map((year) => <option key={year.id} value={year.id}>{year.name} · planned</option>)}</select></label></section>
      {!fromYearId && <p className="rounded-xl border border-line bg-panel p-6 text-sm text-muted">An active academic year is required to build a promotion plan.</p>}
      {fromYearId && !toYearId && <p className="rounded-xl border border-line bg-panel p-6 text-sm text-muted">Create a planned academic year after the current year before creating a promotion plan.</p>}
      {noPlan && <section className="rounded-2xl border border-line bg-panel p-8 text-center"><h2 className="text-lg font-bold text-ink">No promotion plan yet</h2><p className="mt-2 text-sm text-muted">Build the plan from published results. You can refresh it later; manual decisions are preserved.</p>{canManage && <button disabled={buildMutation.isPending || !toYearId} onClick={() => { if (window.confirm("Build a promotion proposal using the published results for every currently enrolled student?")) buildMutation.mutate(); }} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><RefreshCw size={15} />{buildMutation.isPending ? "Building…" : "Build promotion plan"}</button>}</section>}
      {summary && <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Students", summary.totals.students], ["Promote", summary.totals.promote], ["Repeat / Graduate", summary.totals.repeat + summary.totals.graduate], ["Held / Needs section", summary.totals.hold + summary.totals.needsSection]].map(([label, value]) => <article key={label} className="rounded-xl border border-line bg-panel p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-2xl font-black text-navy">{value}</p></article>)}</section>
        <section className="rounded-2xl border border-line bg-panel p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-bold text-ink">{summary.run.fromYear.name} <span className="text-muted">to</span> {summary.run.toYear.name}</h2><p className="mt-1 text-xs text-muted">Plan status: {summary.run.status.toLowerCase()} · {summary.totals.applied} applied · {summary.totals.stale} stale results</p></div>{canManage && summary.run.status !== "APPLIED" && <button disabled={buildMutation.isPending} onClick={() => { if (window.confirm("Refresh this plan from the latest published results? Manual decisions are retained.")) buildMutation.mutate(); }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-teal"><RefreshCw size={15} />Refresh proposal</button>}</div>
          {summary.readiness.length > 0 && <div className="mt-4 space-y-2">{summary.readiness.map((item, index) => <p key={`${item.code}-${index}`} className={`flex gap-2 rounded-lg p-3 text-sm ${item.blocking ? "bg-coral/5 text-coral" : "bg-amber-50 text-amber-800"}`}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{item.message}</p>)}</div>}
        </section>
        <section className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav className="space-y-2 rounded-2xl border border-line bg-panel p-3" aria-label="Promotion classes">{classRows.length ? classRows.map((row) => <button key={row.classId} onClick={() => setClassSelection(row.classId)} className={`w-full rounded-lg p-3 text-left ${classId === row.classId ? "bg-teal/10 text-teal" : "text-ink hover:bg-soft"}`}><span className="block font-semibold">{row.className}</span><span className="mt-1 block text-xs text-muted">↑ {row.counts.promote} · ↻ {row.counts.repeat} · hold {row.counts.hold}</span></button>) : <p className="p-3 text-sm text-muted">No enrolled students were found in this plan.</p>}</nav>
          <div className="overflow-hidden rounded-2xl border border-line bg-panel"><div className="border-b border-line p-4"><h2 className="font-bold text-ink">Student decisions</h2><p className="mt-1 text-xs text-muted">Changes are saved to the plan immediately. Review stale results before applying.</p></div>{decisionsQuery.isPending ? <p className="p-8 text-center text-sm text-muted">Loading student decisions…</p> : !decisionsQuery.data?.students.length ? <p className="p-8 text-center text-sm text-muted">No decisions are available for this class.</p> : <div className="divide-y divide-line">{decisionsQuery.data.students.map((student) => <article key={student.enrollmentId} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><p className="font-semibold text-ink">{student.name}</p><p className="text-xs text-muted">{student.admissionNo} · {student.section.name}{student.rollNo ? ` · Roll ${student.rollNo}` : ""}{student.result ? ` · ${student.result.status ?? "No result"}${student.result.percentage !== null ? ` · ${student.result.percentage}%` : ""}` : " · No published result"}</p>{(student.stale || student.applied) && <p className={`mt-1 text-xs font-semibold ${student.stale ? "text-amber-700" : "text-emerald-700"}`}>{student.stale ? "Result changed after proposal" : "Already applied"}</p>}</div><div className="flex flex-wrap items-center gap-2"><select disabled={!canManage || student.applied || summary.run.status === "APPLIED" || decisionMutation.isPending} aria-label={`Decision for ${student.name}`} value={student.action} onChange={(event) => decisionMutation.mutate({ enrollmentId: student.enrollmentId, action: event.target.value as "PROMOTE" | "REPEAT" | "GRADUATE" | "HOLD" })} className={`${fieldClass} min-w-36`}><option value="PROMOTE">Promote</option><option value="REPEAT">Repeat</option><option value="GRADUATE">Graduate</option><option value="HOLD">Hold</option></select>{student.toClass && <span className="hidden text-xs text-muted sm:inline">→ {student.toClass.name}</span>}{canApply && student.applied && <button disabled={undoMutation.isPending} onClick={() => { if (window.confirm(`Undo the move for ${student.name}? This is only possible while the destination year remains planned.`)) undoMutation.mutate(student.enrollmentId); }} className="rounded-md border border-coral/30 px-2.5 py-1.5 text-xs font-semibold text-coral disabled:opacity-50">Undo move</button>}</div></article>)}</div>}</div>
        </section>
        {canApply && summary.run.status !== "APPLIED" && <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-start gap-3"><AlertTriangle size={19} className="mt-0.5 text-amber-700" /><div><h2 className="font-bold text-amber-900">Apply this promotion plan</h2><p className="mt-1 text-sm text-amber-900">This completes eligible students’ current enrollments and creates next-year enrollments. Attendance and marks entry for those students will stop in the current year. Blocked students will remain listed in the result.</p></div></div>{early && <label className="flex items-start gap-2 text-sm text-amber-900"><input type="checkbox" checked={acknowledgeEarly} onChange={(event) => setAcknowledgeEarly(event.target.checked)} className="mt-1 accent-teal" />I understand this applies the plan before the current academic year’s end date.</label>}<div className="flex flex-wrap gap-2"><button disabled={applyMutation.isPending || (early && !acknowledgeEarly)} onClick={() => { if (window.confirm(`Apply promotions for ${summary.totals.students} students from ${summary.run.fromYear.name} to ${summary.run.toYear.name}? This changes enrollment records.`)) applyMutation.mutate(); }} className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{applyMutation.isPending ? "Applying…" : "Apply promotion"}</button><button disabled={finalizeMutation.isPending || summary.totals.applied === 0} onClick={() => { if (window.confirm("Recalculate roll numbers in all destination sections using promotion ranks?")) finalizeMutation.mutate(); }} className="rounded-lg border border-amber-800/30 px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50">Finalize destination rolls</button></div>{applyMutation.data && <p role="status" className="text-sm text-amber-900">Result: {applyMutation.data.totals.moved} moved · {applyMutation.data.totals.graduated} graduated · {applyMutation.data.totals.blocked} blocked · {applyMutation.data.remaining} remaining.</p>}</section>}
        {summary.run.status === "APPLIED" && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><ArrowRightLeft className="mr-2 inline" size={16} />This promotion plan has been applied. Review blocked students and finalize roll numbers if needed.</p>}
        {canApply && summary.run.status === "APPLIED" && <section className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-panel p-5 sm:flex-row sm:items-center"><div><h2 className="font-bold text-ink">Finalize destination rolls</h2><p className="mt-1 text-sm text-muted">Recompute roll numbers in the destination sections using promotion ranks.</p></div><button disabled={finalizeMutation.isPending || summary.totals.applied === 0} onClick={() => { if (window.confirm("Recalculate roll numbers in all destination sections using promotion ranks?")) finalizeMutation.mutate(); }} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-teal disabled:opacity-50">{finalizeMutation.isPending ? "Finalizing…" : "Finalize rolls"}</button></section>}
      </div>}
    </main>
  );
}
