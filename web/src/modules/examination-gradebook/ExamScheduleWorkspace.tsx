"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorBox, StatusBox } from "./ExamSetupWorkspace";
import { getExamSetup, listExamClasses, listExamYears, listExams } from "./services/exams";

const fieldClass = "mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

export default function ExamScheduleWorkspace() {
  const yearsQuery = useQuery({ queryKey: ["examination", "years"], queryFn: listExamYears });
  const classesQuery = useQuery({ queryKey: ["examination", "classes"], queryFn: listExamClasses });
  const years = yearsQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((item) => item.isActive);
  const defaultYear = years.find((year) => year.status === "ACTIVE") ?? years[0];
  const [yearId, setYearId] = useState("");
  const selectedYearId = yearId || defaultYear?.id || "";
  const [classId, setClassId] = useState("");
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0];
  const examsQuery = useQuery({
    queryKey: ["examination", "exams", selectedYearId],
    queryFn: () => listExams(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const exams = examsQuery.data ?? [];
  const [examId, setExamId] = useState("");
  const selectedExam = exams.find((exam) => exam.id === examId) ?? exams[0];
  const setupQuery = useQuery({
    queryKey: ["examination", "setup", selectedExam?.id, selectedClass?.id],
    queryFn: () => getExamSetup(selectedExam!.id, selectedClass!.id),
    enabled: Boolean(selectedExam && selectedClass),
  });
  const entries = (setupQuery.data?.subjects ?? []).filter((subject) => subject.examDate).sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? ""));

  if (yearsQuery.isPending || classesQuery.isPending) return <StatusBox>Loading exam schedule…</StatusBox>;
  if (yearsQuery.isError || classesQuery.isError) return <ErrorBox error={yearsQuery.error ?? classesQuery.error} retry={() => { void yearsQuery.refetch(); void classesQuery.refetch(); }} />;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Examination workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Exam schedule</h1>
        <p className="mt-1 text-sm text-muted">Review scheduled subject assessments by academic year, exam, and class.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">Academic year<select className={fieldClass} onChange={(event) => setYearId(event.target.value)} value={selectedYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
        <label className="text-sm font-medium">Exam<select className={fieldClass} onChange={(event) => setExamId(event.target.value)} value={selectedExam?.id ?? ""}><option value="">Select an exam</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.sequence}. {exam.name} · {exam.status}</option>)}</select></label>
        <label className="text-sm font-medium">Class<select className={fieldClass} onChange={(event) => setClassId(event.target.value)} value={selectedClass?.id ?? ""}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {examsQuery.isError && <ErrorBox error={examsQuery.error} retry={() => void examsQuery.refetch()} />}
      {setupQuery.isPending && selectedExam && <StatusBox>Loading scheduled subjects…</StatusBox>}
      {setupQuery.isError && <ErrorBox error={setupQuery.error} retry={() => void setupQuery.refetch()} />}
      {selectedExam && !setupQuery.isPending && !setupQuery.isError && (
        <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{selectedExam.name} · {selectedClass?.name}</h2><p className="text-sm text-muted">{entries.length} scheduled subjects</p></div><span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-bold text-teal">{selectedExam.status}</span></div>
          {!entries.length ? <StatusBox>No exam dates are configured for this exam and class.</StatusBox> : (
            <ol className="space-y-3">{entries.map((subject) => (
              <li className="flex flex-col gap-3 rounded-lg border border-line bg-background p-4 sm:flex-row sm:items-center" key={subject.subjectId}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal/10 text-sm font-bold text-teal">{new Date(`${subject.examDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                <div className="min-w-0 flex-1"><h3 className="font-semibold">{subject.name}</h3><p className="text-sm text-muted">{subject.code} · {subject.totalFull} total marks · Theory {subject.fullTheory}{subject.fullPractical != null ? ` + Practical ${subject.fullPractical}` : ""}</p></div>
                <p className="text-sm font-medium text-ink">{new Date(`${subject.examDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              </li>
            ))}</ol>
          )}
        </section>
      )}
      {!selectedExam && !examsQuery.isPending && <StatusBox>No exams are configured for this academic year.</StatusBox>}
    </main>
  );
}
