"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { ErrorBox, StatusBox } from "./ExamSetupWorkspace";
import { listExamClasses, listExamYears, listExams } from "./services/exams";
import {
  printReportCards,
  type PrintReportCardsResponse,
} from "./services/report-cards";

const fieldClass = "mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

function message(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "The request failed.";
}

function schoolValue(school: Record<string, unknown>, key: string, fallback: string) {
  const value = school[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function ReportCardsWorkspace({
  canPrintSigned,
}: {
  canPrintSigned: boolean;
}) {
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
  const selectedSection = sectionId === "ALL"
    ? undefined
    : sections.find((section) => section.id === sectionId) ?? (!sectionId ? sections[0] : undefined);
  const sectionSelection = sectionId || selectedSection?.id || "ALL";
  const examsQuery = useQuery({
    queryKey: ["examination", "exams", selectedYearId],
    queryFn: () => listExams(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const exams = (examsQuery.data ?? []).filter((exam) => exam.status === "PUBLISHED");
  const [examId, setExamId] = useState("");
  const [version, setVersion] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [order, setOrder] = useState<"ROLL" | "RANK">("ROLL");
  const [signatures, setSignatures] = useState<"auto" | "line">("auto");
  const [batch, setBatch] = useState<PrintReportCardsResponse | null>(null);

  const printMutation = useMutation({
    mutationFn: () => printReportCards({
      academicYearId: selectedYearId,
      classId: selectedClass!.id,
      ...(sectionSelection !== "ALL" && selectedSection ? { sectionId: selectedSection.id } : {}),
      ...(examId ? { examId } : {}),
      ...(version ? { version: Number(version) } : {}),
      ...(issuedOn ? { issuedOn } : {}),
      signatures,
      order,
    }),
    onSuccess: (result) => {
      setBatch(result);
      if (result.documents.length) toast.success(`${result.documents.length} report card${result.documents.length === 1 ? "" : "s"} ready to print.`);
      else toast.warning("No complete report cards were available for this selection.");
    },
    onError: (error) => toast.error(message(error)),
  });

  if (yearsQuery.isPending || classesQuery.isPending) return <StatusBox>Loading report-card options…</StatusBox>;
  if (yearsQuery.isError || classesQuery.isError) return <ErrorBox error={yearsQuery.error ?? classesQuery.error} retry={() => { void yearsQuery.refetch(); void classesQuery.refetch(); }} />;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <header className="border-b border-line pb-5 print:hidden">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Examination workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Report cards</h1>
        <p className="mt-1 text-sm text-muted">Create print-ready cards from published results, including attendance and signatures.</p>
      </header>
      <section className="space-y-4 rounded-xl border border-line bg-panel p-5 print:hidden">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">Academic year<select className={fieldClass} onChange={(event) => { setYearId(event.target.value); setBatch(null); }} value={selectedYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
          <label className="text-sm font-medium">Class<select className={fieldClass} onChange={(event) => { setClassId(event.target.value); setSectionId(""); setBatch(null); }} value={selectedClass?.id ?? ""}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Section<select className={fieldClass} onChange={(event) => { setSectionId(event.target.value); setBatch(null); }} value={sectionSelection}><option value="ALL">Entire class (where permitted)</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
          <label className="text-sm font-medium">Exam<select className={fieldClass} onChange={(event) => { setExamId(event.target.value); setBatch(null); }} value={examId}><option value="">Combined result</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
          <label className="text-sm font-medium">Published version (optional)<input className={fieldClass} min={1} onChange={(event) => { setVersion(event.target.value); setBatch(null); }} placeholder="Latest" type="number" value={version} /></label>
          <label className="text-sm font-medium">Issue date (AD, optional)<input className={fieldClass} max={new Date().toISOString().slice(0, 10)} onChange={(event) => { setIssuedOn(event.target.value); setBatch(null); }} type="date" value={issuedOn} /></label>
          <label className="text-sm font-medium">Sort order<select className={fieldClass} onChange={(event) => { setOrder(event.target.value as "ROLL" | "RANK"); setBatch(null); }} value={order}><option value="ROLL">Roll number</option><option value="RANK">Rank</option></select></label>
          <label className="text-sm font-medium">Signatures<select className={fieldClass} onChange={(event) => { setSignatures(event.target.value as "auto" | "line"); setBatch(null); }} value={signatures}><option value="auto">Available signatures</option><option value="line">Blank signature lines</option></select></label>
        </div>
        {!canPrintSigned && <p className="rounded-md bg-background p-3 text-xs text-muted">Your account prints blank signature lines; digital signatures require signed-report permission.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">Only published results can be printed. Incomplete results will be listed separately.</p>
        <div className="flex gap-2"><button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={!selectedClass || !selectedYearId || printMutation.isPending || (version !== "" && (!Number.isInteger(Number(version)) || Number(version) < 1))} onClick={() => printMutation.mutate()} type="button">{printMutation.isPending ? "Preparing cards…" : "Prepare report cards"}</button>{batch?.documents.length ? <button className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-teal" onClick={() => window.print()} type="button">Print batch</button> : null}</div>
        </div>
      </section>
      {examsQuery.isError && <ErrorBox error={examsQuery.error} retry={() => void examsQuery.refetch()} />}
      {batch && (
        <section className="space-y-5">
          {batch.warnings.length > 0 && <div className="rounded-lg border border-amber bg-amber/10 p-4 print:hidden"><h2 className="font-semibold">Print notes</h2><ul className="mt-2 list-inside list-disc space-y-1 text-sm">{batch.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
          {batch.skipped.length > 0 && <div className="rounded-lg border border-coral bg-coral/10 p-4 print:hidden"><h2 className="font-semibold">Cards skipped: {batch.skipped.length}</h2><p className="mt-1 text-sm">These students have incomplete published results.</p><div className="mt-2 flex flex-wrap gap-2">{batch.skipped.map((item) => <span className="rounded bg-panel px-2 py-1 text-xs" key={item.enrollmentId}>{item.admissionNo ?? item.enrollmentId}</span>)}</div></div>}
          {!batch.documents.length && <StatusBox>No report cards could be created for the selected published result.</StatusBox>}
          <div className="space-y-6">
            {batch.documents.map((document) => {
              const classTeacher = batch.classTeachers[document.section.id];
              const signatories = [...batch.signatories, ...(classTeacher ? [classTeacher] : [])];
              return (
                <article className="mx-auto w-full max-w-[210mm] border border-line bg-white p-8 text-slate-900 shadow-sm print:break-after-page print:border-0 print:shadow-none" key={document.ref}>
                  <header className="flex items-center justify-between gap-5 border-b-2 border-teal pb-4">
                    {batch.assets.logo && <Image alt="" className="h-16 w-16 object-contain" height={64} src={batch.assets.logo} unoptimized width={64} />}
                    <div className="flex-1 text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">{schoolValue(batch.school, "taglineEn", "Official student record")}</p>
                      <h1 className="mt-1 text-2xl font-bold">{schoolValue(batch.school, "nameEn", "School")}</h1>
                      <p className="mt-1 font-semibold">{document.exam?.name ?? "Annual / Combined Result"} · Report Card</p>
                      <p className="text-sm text-slate-600">{document.academicYear.name} · Issued {batch.issuedOn.ad}{batch.issuedOn.bs ? ` (${batch.issuedOn.bs})` : ""}</p>
                      <p className="text-xs text-slate-500">{schoolValue(batch.school, "addressEn", "")}</p>
                    </div>
                    {batch.assets.seal && <Image alt="" className="h-16 w-16 object-contain" height={64} src={batch.assets.seal} unoptimized width={64} />}
                  </header>
                  <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                    <StudentField label="Student" value={document.student.name} /><StudentField label="Admission no." value={document.student.admissionNo} /><StudentField label="Class / section" value={`${document.class.name} / ${document.section.name}`} /><StudentField label="Roll no." value={document.rollNo == null ? "—" : String(document.rollNo)} />
                    <StudentField label="Date of birth" value={document.student.dateOfBirthBs ?? document.student.dateOfBirth} /><StudentField label="Gender" value={document.student.gender} /><StudentField label="Result status" value={document.result.status} /><StudentField label="Position" value={document.result.sectionRank == null ? "—" : `${document.result.sectionRank} / ${document.result.sectionSize}`} />
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                    <ResultMetric label="Total" value={document.result.totalMarks == null ? "—" : `${document.result.totalMarks} / ${document.result.totalFull ?? "—"}`} />
                    <ResultMetric label="Percentage" value={document.result.percentage == null ? "—" : `${document.result.percentage.toFixed(2)}%`} />
                    <ResultMetric label="GPA" value={document.result.gpa == null ? "—" : document.result.gpa.toFixed(2)} />
                  </div>
                  <div className="mt-5 overflow-hidden rounded border border-slate-300">
                    <table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-2">Code</th><th className="p-2">Subject</th><th className="p-2">Marks</th><th className="p-2">Percent</th><th className="p-2">Grade</th><th className="p-2">Status</th></tr></thead>
                      <tbody>{document.subjects.map((subject) => <tr className="border-t border-slate-200" key={subject.code}><td className="p-2">{subject.code}</td><td className="p-2">{subject.name}</td><td className="p-2">{subject.weightedMarks ?? "—"} / {subject.weightedFull}</td><td className="p-2">{subject.percentage == null ? "—" : `${subject.percentage.toFixed(2)}%`}</td><td className="p-2">{subject.grade ?? "—"}</td><td className="p-2">{subject.status}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-between gap-3 rounded bg-slate-50 p-3 text-sm"><span>Attendance: {document.attendance.present} present / {document.attendance.totalDays} days ({document.attendance.percentage == null ? "—" : `${document.attendance.percentage}%`})</span><span>Absent: {document.attendance.absent} · Late: {document.attendance.late} · Leave: {document.attendance.leave}</span></div>
                  {document.remark && <p className="mt-4 rounded border border-slate-200 p-3 text-sm"><strong>Teacher remark:</strong> {document.remark.text}</p>}
                  <footer className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
                    {signatories.map((signatory) => <div className="flex min-h-20 flex-col items-center justify-end" key={`${signatory.slot}:${signatory.nameEn}`}>
                      {signatory.mode === "DIGITAL" && signatory.assetKey && batch.assets[signatory.assetKey] ? <Image alt="" className="mb-1 h-10 max-w-32 object-contain" height={40} src={batch.assets[signatory.assetKey]} unoptimized width={128} /> : <div className="mb-2 w-36 border-t border-slate-500" />}
                      <p className="font-semibold">{signatory.nameEn || " "}</p><p>{signatory.designationEn || signatory.slot}</p>
                    </div>)}
                  </footer>
                  <p className="mt-5 text-right text-[10px] text-slate-500">Ref: {document.ref} · v{document.run.version}</p>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } body { background: white; } }`}</style>
    </main>
  );
}

function StudentField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>;
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}
