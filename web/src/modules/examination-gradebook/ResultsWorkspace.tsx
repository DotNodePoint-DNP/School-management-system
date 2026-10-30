"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { listGradeScales } from "@/modules/settings/services/grade-scales";
import { ErrorBox, StatusBox } from "./ExamSetupWorkspace";
import {
  deleteResultPolicy,
  getPublishedResults,
  getRollOrder,
  getResultPolicy,
  getResultsRemarks,
  listResultRuns,
  previewResults,
  saveResultsRemarks,
  setResultPolicy,
  type GradePolicyUpdate,
  type ResultStudent,
} from "./services/results";
import { listExamClasses, listExamYears, listExams } from "./services/exams";

const fieldClass = "mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

function message(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "The request failed.";
}

export default function ResultsWorkspace({
  canPreview,
  canReadResults,
  canReadAll,
  canManagePolicy,
  canReadRemarks,
  canEnterRemarks,
}: {
  canPreview: boolean;
  canReadResults: boolean;
  canReadAll: boolean;
  canManagePolicy: boolean;
  canReadRemarks: boolean;
  canEnterRemarks: boolean;
}) {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery({ queryKey: ["examination", "years"], queryFn: listExamYears });
  const classesQuery = useQuery({ queryKey: ["examination", "classes"], queryFn: listExamClasses });
  const years = yearsQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((item) => item.isActive);
  const defaultYear = years.find((year) => year.status === "ACTIVE") ?? years[0];
  const [yearId, setYearId] = useState("");
  const selectedYearId = yearId || defaultYear?.id || "";
  const [classId, setClassId] = useState("");
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0];
  const sections = selectedClass?.sections.filter((section) => section.isActive) ?? [];
  const [sectionId, setSectionId] = useState("");
  const sectionSelection = sectionId || (canReadAll ? "ALL" : sections[0]?.id ?? "ALL");
  const selectedSection = sectionSelection === "ALL" ? undefined : sections.find((section) => section.id === sectionSelection);
  const examsQuery = useQuery({
    queryKey: ["examination", "exams", selectedYearId],
    queryFn: () => listExams(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const exams = examsQuery.data ?? [];
  const [examId, setExamId] = useState("");
  const selectedExamId = examId || "";
  const [showRuns, setShowRuns] = useState(false);
  const [showRollOrder, setShowRollOrder] = useState(false);
  const runsQuery = useQuery({
    queryKey: ["examination", "result-runs", selectedYearId, selectedClass?.id, selectedExamId],
    queryFn: () => listResultRuns(selectedYearId, selectedClass!.id, selectedExamId || undefined),
    enabled: Boolean(canReadAll && showRuns && selectedYearId && selectedClass),
  });
  const rollOrderQuery = useQuery({
    queryKey: ["examination", "roll-order", selectedYearId, selectedClass?.id, selectedSection?.id],
    queryFn: () => getRollOrder(selectedYearId, selectedClass!.id, selectedSection?.id),
    enabled: Boolean(canReadAll && showRollOrder && selectedYearId && selectedClass),
  });
  const [resultMode, setResultMode] = useState<"preview" | "published">(canPreview ? "preview" : "published");
  const showPreview = resultMode === "preview" && canPreview;
  const previewQuery = useQuery({
    queryKey: ["examination", "result-preview", selectedYearId, selectedClass?.id, selectedExamId],
    queryFn: () => previewResults(selectedYearId, selectedClass!.id, selectedExamId || undefined),
    enabled: Boolean(showPreview && selectedYearId && selectedClass),
  });
  const publishedQuery = useQuery({
    queryKey: ["examination", "published-results", selectedYearId, selectedClass?.id, selectedSection?.id, selectedExamId],
    queryFn: () => getPublishedResults(selectedYearId, selectedClass!.id, {
      ...(selectedExamId ? { examId: selectedExamId } : {}),
      ...(selectedSection?.id ? { sectionId: selectedSection.id } : {}),
    }),
    enabled: Boolean(!showPreview && canReadResults && selectedYearId && selectedClass && (canReadAll || selectedSection)),
  });
  const scalesQuery = useQuery({ queryKey: ["grading-scales"], queryFn: listGradeScales, enabled: canManagePolicy });
  const policyQuery = useQuery({
    queryKey: ["examination", "result-policy", selectedYearId, selectedClass?.id],
    queryFn: () => getResultPolicy(selectedYearId, selectedClass!.id),
    enabled: Boolean(selectedYearId && selectedClass),
  });
  const results = showPreview ? previewQuery.data?.students ?? [] : publishedQuery.data?.students ?? [];
  const warnings = showPreview ? previewQuery.data?.warnings ?? [] : [];
  const activePolicy = policyQuery.data;
  const policyKey = activePolicy
    ? `${activePolicy.gradeScale.id}:${activePolicy.components.map((component) => `${component.examId}-${component.weightPercent}`).join(",")}`
    : "";
  const policyEditorKey = `${selectedYearId}:${selectedClass?.id}:${policyKey}:${scalesQuery.dataUpdatedAt}`;
  const policyMissing = policyQuery.error instanceof ApiClientError && policyQuery.error.status === 404;

  const savePolicyMutation = useMutation({
    mutationFn: (input: GradePolicyUpdate) => setResultPolicy(selectedYearId, selectedClass!.id, input),
    onSuccess: () => { toast.success("Result policy saved."); void queryClient.invalidateQueries({ queryKey: ["examination", "result-policy"] }); void previewQuery.refetch(); },
    onError: (error) => toast.error(message(error)),
  });
  const deletePolicyMutation = useMutation({
    mutationFn: () => deleteResultPolicy(selectedYearId, selectedClass!.id),
    onSuccess: () => { toast.success("Custom policy removed; the default policy will apply."); void queryClient.invalidateQueries({ queryKey: ["examination", "result-policy"] }); void previewQuery.refetch(); },
    onError: (error) => toast.error(message(error)),
  });

  const remarksQuery = useQuery({
    queryKey: ["examination", "remarks", selectedYearId, selectedSection?.id, selectedExamId],
    queryFn: () => getResultsRemarks(selectedYearId, selectedSection!.id, selectedExamId || undefined),
    enabled: Boolean((canReadRemarks || canEnterRemarks) && selectedYearId && selectedSection),
  });
  const remarksKey = remarksQuery.data?.entries.map((entry) => `${entry.enrollmentId}:${entry.remark ?? ""}`).join("|") ?? "";
  const resultsTableKey = `${selectedYearId}:${selectedSection?.id}:${selectedExamId}:${remarksKey}:${results.map((student) => student.enrollmentId).join("|")}`;

  if (yearsQuery.isPending || classesQuery.isPending) return <StatusBox>Loading results workspace…</StatusBox>;
  if (yearsQuery.isError || classesQuery.isError) return <ErrorBox error={yearsQuery.error ?? classesQuery.error} retry={() => { void yearsQuery.refetch(); void classesQuery.refetch(); }} />;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Examination workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Results & grading policy</h1>
        <p className="mt-1 text-sm text-muted">Preview outcomes, review published results, and configure class-level result weighting.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium">Academic year<select className={fieldClass} onChange={(event) => { setYearId(event.target.value); setExamId(""); setSectionId(""); }} value={selectedYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
        <label className="text-sm font-medium">Class<select className={fieldClass} onChange={(event) => { setClassId(event.target.value); setSectionId(""); }} value={selectedClass?.id ?? ""}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">Section<select className={fieldClass} onChange={(event) => setSectionId(event.target.value)} value={sectionSelection}>{canReadAll && <option value="ALL">All sections</option>}{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label className="text-sm font-medium">Result scope<select className={fieldClass} onChange={(event) => setExamId(event.target.value)} value={selectedExamId}><option value="">Combined result</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
      </div>

      {canManagePolicy && selectedClass && (
        <PolicyEditor
          canManage={canManagePolicy}
          exams={exams}
          key={policyEditorKey}
          policy={activePolicy}
          queryError={scalesQuery.isError ? scalesQuery.error : policyQuery.isError && !policyMissing ? policyQuery.error : undefined}
          policyMissing={policyMissing}
          retryQuery={() => { void policyQuery.refetch(); void scalesQuery.refetch(); }}
          gradeScales={scalesQuery.data ?? []}
          saving={savePolicyMutation.isPending || deletePolicyMutation.isPending}
          onSave={(input) => savePolicyMutation.mutate(input)}
          onDelete={() => deletePolicyMutation.mutate()}
        />
      )}

      {canPreview && canReadResults && <div className="flex gap-2">
        <button className={`rounded-md px-4 py-2 text-sm font-semibold ${showPreview ? "bg-teal text-white" : "border border-line bg-panel"}`} onClick={() => setResultMode("preview")} type="button">Preview results</button>
        <button className={`rounded-md px-4 py-2 text-sm font-semibold ${!showPreview ? "bg-teal text-white" : "border border-line bg-panel"}`} onClick={() => setResultMode("published")} type="button">Published results</button>
      </div>}
      {(showPreview ? previewQuery.isPending : publishedQuery.isPending) && <StatusBox>Loading results…</StatusBox>}
      {(showPreview ? previewQuery.isError : publishedQuery.isError) && (
        <ErrorBox error={showPreview ? previewQuery.error : publishedQuery.error} retry={() => { void previewQuery.refetch(); void publishedQuery.refetch(); }} />
      )}
      {!canPreview && !canReadAll && <StatusBox>Published results are limited to sections assigned to your account. Choose your assigned section above.</StatusBox>}
      {warnings.length > 0 && <div className="rounded-lg border border-amber bg-amber/10 p-4"><h2 className="font-semibold">Preview notes</h2><ul className="mt-2 list-inside list-disc space-y-1 text-sm">{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
      {showPreview && previewQuery.data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Students" value={previewQuery.data.summary.students} />
          <Metric label="Pass" value={previewQuery.data.summary.pass} />
          <Metric label="Fail" value={previewQuery.data.summary.fail} />
          <Metric label="Incomplete" value={previewQuery.data.summary.incomplete} />
        </div>
      )}
      {(showPreview ? previewQuery.data : publishedQuery.data) && (
        <ResultsTable
          key={resultsTableKey}
          results={results}
          canEnterRemarks={canEnterRemarks && Boolean(selectedSection) && !showPreview}
          yearId={selectedYearId}
          sectionId={selectedSection?.id ?? ""}
          examId={selectedExamId || undefined}
          initialRemarks={remarksQuery.data?.entries ?? []}
          onRemarksSaved={() => void remarksQuery.refetch()}
          remarksBusy={remarksQuery.isPending}
          remarksError={remarksQuery.isError ? remarksQuery.error : null}
          retryRemarks={() => void remarksQuery.refetch()}
        />
      )}
      {canReadAll && selectedClass && <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
        <div><h2 className="text-lg font-semibold">Result administration</h2><p className="mt-1 text-sm text-muted">Review published run versions and the final roll order.</p></div>
        <div className="flex flex-wrap gap-2"><button className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-teal" onClick={() => setShowRuns((value) => !value)} type="button">{showRuns ? "Hide" : "Show"} publication history</button><button className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-teal" onClick={() => setShowRollOrder((value) => !value)} type="button">{showRollOrder ? "Hide" : "Show"} final roll order</button></div>
        {showRuns && (runsQuery.isPending ? <StatusBox>Loading publication history…</StatusBox> : runsQuery.isError ? <ErrorBox error={runsQuery.error} retry={() => void runsQuery.refetch()} /> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Version</th><th className="px-3 py-3">Published at</th><th className="px-3 py-3">Published by</th><th className="px-3 py-3">Revision</th><th className="px-3 py-3">Reason</th></tr></thead><tbody className="divide-y divide-line">{(runsQuery.data ?? []).map((run) => <tr key={run.version}><td className="px-3 py-3 font-semibold">v{run.version}</td><td className="px-3 py-3">{new Date(run.createdAt).toLocaleString()}</td><td className="px-3 py-3">{run.createdByName ?? "—"}</td><td className="px-3 py-3">{run.revised ? "Revised" : "Initial"}</td><td className="px-3 py-3">{run.reason ?? "—"}</td></tr>)}</tbody></table>{!runsQuery.data?.length && <p className="p-4 text-sm text-muted">No published versions yet.</p>}</div>)}
        {showRollOrder && (rollOrderQuery.isPending ? <StatusBox>Loading final roll order…</StatusBox> : rollOrderQuery.isError ? <ErrorBox error={rollOrderQuery.error} retry={() => void rollOrderQuery.refetch()} /> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Position</th><th className="px-3 py-3">Roll order</th><th className="px-3 py-3">Admission no.</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-line">{rollOrderQuery.data?.order.map((student) => <tr key={student.enrollmentId}><td className="px-3 py-3 font-bold text-teal">{student.position}</td><td className="px-3 py-3">{student.name ?? "Student"}</td><td className="px-3 py-3">{student.admissionNo ?? "—"}</td><td className="px-3 py-3">{student.status}</td></tr>)}</tbody></table>{!rollOrderQuery.data?.order.length && <p className="p-4 text-sm text-muted">No final result roll order available.</p>}</div>)}
      </section>}
      {policyQuery.isPending && canManagePolicy && <StatusBox>Loading class result policy…</StatusBox>}
    </main>
  );
}

function PolicyEditor({
  canManage,
  exams,
  policy,
  queryError,
  retryQuery,
  policyMissing,
  gradeScales,
  saving,
  onSave,
  onDelete,
}: {
  canManage: boolean;
  exams: { id: string; name: string; sequence: number }[];
  policy?: { source: "EXPLICIT" | "DEFAULT"; gradeScale: { id: string; name: string }; components: { examId: string; examName: string; sequence: number; status: string; weightPercent: number }[] };
  queryError?: unknown;
  retryQuery: () => void;
  policyMissing: boolean;
  gradeScales: { id: string; name: string; isDefault: boolean }[];
  saving: boolean;
  onSave: (input: GradePolicyUpdate) => void;
  onDelete: () => void;
}) {
  const [gradeScaleId, setGradeScaleId] = useState(policy?.gradeScale.id ?? gradeScales.find((scale) => scale.isDefault)?.id ?? "");
  const [components, setComponents] = useState<{ examId: string; weight: string }[]>(() =>
    policy?.components.map((item) => ({ examId: item.examId, weight: String(item.weightPercent) })) ?? [],
  );
  const totalWeight = components.reduce((total, item) => total + (Number(item.weight) || 0), 0);
  const totalHundredths = components.reduce((total, item) => total + Math.round((Number(item.weight) || 0) * 100), 0);
  const hasUniqueExams = new Set(components.map((item) => item.examId).filter(Boolean)).size === components.length;
  const save = () => onSave({
    gradeScaleId,
    components: components.map((item) => ({ examId: item.examId, weightPercent: Number(item.weight) })),
  });

  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Class result policy</h2><p className="mt-1 text-sm text-muted">Choose a grade scale and assign component weights totaling exactly 100%.</p></div>
        {policy && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${policy.source === "EXPLICIT" ? "bg-teal/10 text-teal" : "bg-background text-muted"}`}>{policy.source === "EXPLICIT" ? "Custom policy" : "Default policy"}</span>}
      </div>
      {queryError ? <ErrorBox error={queryError} retry={retryQuery} /> : (
        <>
          {policyMissing && <p className="rounded-md border border-amber bg-amber/10 p-3 text-sm text-navy">No effective policy exists yet. Configure a grade scale and exam weights to enable result calculation.</p>}
          <label className="block max-w-md text-sm font-medium">Grade scale<select className={fieldClass} onChange={(event) => setGradeScaleId(event.target.value)} value={gradeScaleId}><option value="">Select a grade scale</option>{gradeScales.map((scale) => <option key={scale.id} value={scale.id}>{scale.name}{scale.isDefault ? " · default" : ""}</option>)}</select></label>
          <div className="space-y-2">
            {components.map((component, index) => (
              <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]" key={`${component.examId}:${index}`}>
                <select aria-label={`Exam component ${index + 1}`} className={fieldClass} onChange={(event) => setComponents(components.map((item, itemIndex) => itemIndex === index ? { ...item, examId: event.target.value } : item))} value={component.examId}><option value="">Select exam</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.sequence}. {exam.name}</option>)}</select>
                <label className="text-xs font-semibold text-muted">Weight (%)<input className={fieldClass} max={100} min={0} onChange={(event) => setComponents(components.map((item, itemIndex) => itemIndex === index ? { ...item, weight: event.target.value } : item))} step="0.01" type="number" value={component.weight} /></label>
                <button aria-label="Remove exam component" className="self-end rounded-md border border-line px-3 py-2 text-sm" onClick={() => setComponents(components.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove</button>
              </div>
            ))}
            <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-teal hover:border-teal disabled:opacity-50" disabled={components.length >= 10} onClick={() => setComponents([...components, { examId: "", weight: "" }])} type="button">Add exam component</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className={`text-sm font-semibold ${totalHundredths === 10000 ? "text-teal" : "text-coral"}`}>Total weight: {totalWeight}% {totalHundredths === 10000 ? "· Ready to save" : "· Must equal 100%"}</p>
            <div className="flex gap-2"><button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={!canManage || saving || !gradeScaleId || components.length < 1 || components.length > 10 || totalHundredths !== 10000 || !hasUniqueExams || components.some((item) => !item.examId || item.weight === "")} onClick={save} type="button">Save policy</button>{policy?.source === "EXPLICIT" && <button className="rounded-md border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={saving} onClick={onDelete} type="button">Use default policy</button>}</div>
          </div>
        </>
      )}
    </section>
  );
}

function ResultsTable({
  results,
  canEnterRemarks,
  yearId,
  sectionId,
  examId,
  initialRemarks,
  onRemarksSaved,
  remarksBusy,
  remarksError,
  retryRemarks,
}: {
  results: ResultStudent[];
  canEnterRemarks: boolean;
  yearId: string;
  sectionId: string;
  examId?: string;
  initialRemarks: { enrollmentId: string; remark: string | null; updatedAt: string | null }[];
  onRemarksSaved: () => void;
  remarksBusy: boolean;
  remarksError: unknown | null;
  retryRemarks: () => void;
}) {
  const [remarks, setRemarks] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialRemarks.map((entry) => [entry.enrollmentId, entry.remark ?? ""])),
  );
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!sectionId) throw new Error("Select a section to save remarks.");
      const entries = results.map((student) => ({
        enrollmentId: student.enrollmentId,
        remark: remarks[student.enrollmentId] ?? null,
      }));
      for (let index = 0; index < entries.length; index += 200) {
        await saveResultsRemarks(yearId, sectionId, entries.slice(index, index + 200), examId);
      }
    },
    onSuccess: () => { toast.success("Student remarks saved."); onRemarksSaved(); },
    onError: (error) => toast.error(message(error)),
  });
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Student results</h2><p className="text-sm text-muted">{results.length} records {canEnterRemarks ? "· Remarks are editable for your authorized section" : ""}</p></div>{canEnterRemarks && results.length > 0 && <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saveMutation.isPending || remarksBusy} onClick={() => saveMutation.mutate()} type="button">{saveMutation.isPending ? "Saving…" : "Save remarks"}</button>}</div>
      {remarksError !== null && <ErrorBox error={remarksError} retry={retryRemarks} />}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-3 py-3">Roll</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Percentage</th><th className="px-3 py-3">GPA</th><th className="px-3 py-3">Rank</th><th className="px-3 py-3">Result</th>{canEnterRemarks && <th className="min-w-60 px-3 py-3">Remark</th>}</tr></thead>
          <tbody className="divide-y divide-line">{results.map((student) => <tr key={student.enrollmentId}>
            <td className="px-3 py-3">{student.rollNo ?? "—"}</td><td className="px-3 py-3"><span className="font-medium">{student.name ?? "Student"}</span><span className="block text-xs text-muted">{student.admissionNo ?? ""}</span></td>
            <td className="px-3 py-3"><span className="rounded-full bg-background px-2 py-1 text-xs font-semibold">{student.status}</span></td>
            <td className="px-3 py-3">{student.percentage == null ? "—" : `${student.percentage.toFixed(2)}%`}</td><td className="px-3 py-3">{student.gpa == null ? "—" : student.gpa.toFixed(2)}</td><td className="px-3 py-3">{student.sectionRank ?? "—"}{student.classRank ? ` / ${student.classRank}` : ""}</td>
            <td className="px-3 py-3">{student.failedSubjects.length ? <span className="text-coral">{student.failedSubjects.join(", ")}</span> : student.missing.length ? <span className="text-amber">{student.missing.join(", ")}</span> : <span className="text-teal">Complete</span>}</td>
            {canEnterRemarks && <td className="px-3 py-2"><input aria-label={`Remark for ${student.name ?? "student"}`} className={fieldClass} maxLength={500} onChange={(event) => setRemarks((current) => ({ ...current, [student.enrollmentId]: event.target.value }))} value={remarks[student.enrollmentId] ?? ""} /></td>}
          </tr>)}</tbody>
        </table>
        {!results.length && <p className="p-5 text-sm text-muted">No results are available for this selection.</p>}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-panel p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-teal">{value}</p></div>;
}
