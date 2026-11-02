"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { listAcademicYears, listSchoolClasses } from "@/modules/settings/services/academic-setup";
import { listStaff } from "@/modules/staff/services/staff";
import { assignClassTeacher, assignSubjectTeacher, getMyTeachingAssignments, getSectionTeaching, getStaffAssignments } from "./services/teaching";
import { getSubjectRoster } from "./services/optional-subjects";

const fieldClass = "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function TeachingWorkspace({ permissions }: { permissions: readonly string[] }) {
  const queryClient = useQueryClient();
  const canRead = permissions.includes("teaching:read");
  const canAssignPermission = permissions.includes("teaching:assign");
  const canSelectStaff = permissions.includes("staff:read");
  const canAssign = canAssignPermission && canSelectStaff;
  const [yearSelection, setYearSelection] = useState("");
  const [sectionSelection, setSectionSelection] = useState("");
  const [rosterSubjectId, setRosterSubjectId] = useState("");
  const [assignmentStaffId, setAssignmentStaffId] = useState("");
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears, enabled: canRead, retry: false });
  const classesQuery = useQuery({ queryKey: ["school-classes"], queryFn: listSchoolClasses, enabled: canRead, retry: false });
  const staffQuery = useQuery({ queryKey: ["staff", "teaching-select"], queryFn: () => listStaff({ page: 1, pageSize: 100, kind: "TEACHING", status: "ACTIVE", sortBy: "name", sortOrder: "asc" }), enabled: canRead && canAssign, retry: false });
  const years = yearsQuery.data ?? [];
  const activeYears = years.filter((year) => year.status === "ACTIVE");
  const yearId = years.some((year) => year.id === yearSelection)
    ? yearSelection
    : activeYears[0]?.id ?? years[0]?.id ?? "";
  const classes = classesQuery.data ?? [];
  const sections = classes.flatMap((schoolClass) => schoolClass.sections.map((section) => ({ ...section, className: schoolClass.name })));
  const sectionId = sections.some((section) => section.id === sectionSelection)
    ? sectionSelection
    : sections[0]?.id ?? "";
  const teachingQuery = useQuery({ queryKey: ["teaching", yearId, sectionId], queryFn: () => getSectionTeaching(yearId, sectionId), enabled: Boolean(canRead && yearId && sectionId), retry: false });
  const myAssignmentsQuery = useQuery({
    queryKey: ["teaching", "my-assignments"],
    queryFn: getMyTeachingAssignments,
    enabled: canRead,
    retry: false,
  });
  const rosterQuery = useQuery({
    queryKey: ["teaching", "subject-roster", yearId, sectionId, rosterSubjectId],
    queryFn: () => getSubjectRoster(yearId, sectionId, rosterSubjectId),
    enabled: Boolean(canRead && yearId && sectionId && rosterSubjectId),
    retry: false,
  });
  const staffAssignmentsQuery = useQuery({
    queryKey: ["teaching", "staff-assignments", assignmentStaffId, yearId],
    queryFn: () => getStaffAssignments(assignmentStaffId, yearId),
    enabled: Boolean(canRead && assignmentStaffId && yearId),
    retry: false,
  });
  const teachers = staffQuery.data?.items ?? [];
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["teaching", yearId, sectionId] }),
    queryClient.invalidateQueries({ queryKey: ["staff", "teaching-assignments"] }),
  ]);
  const classTeacherMutation = useMutation({
    mutationFn: (staffId: string | null) => assignClassTeacher(yearId, sectionId, staffId),
    onSuccess: async () => { await refresh(); toast.success("Class teacher assignment saved."); },
    onError: (error) => toast.error(message(error)),
  });
  const subjectMutation = useMutation({
    mutationFn: (input: { subjectId: string; staffId: string | null }) => assignSubjectTeacher(yearId, sectionId, input.subjectId, input.staffId),
    onSuccess: async () => { await refresh(); toast.success("Subject teacher assignment saved."); },
    onError: (error) => toast.error(message(error)),
  });

  if (!canRead) return <div className="rounded-xl border border-line bg-panel p-8 text-sm text-muted">Your account does not have permission to view teaching assignments.</div>;
  const teaching = teachingQuery.data;
  const error = yearsQuery.error ?? classesQuery.error ?? staffQuery.error ?? teachingQuery.error;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="border-b border-line pb-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Academic setup</p><h1 className="mt-1 text-2xl font-black tracking-tight text-ink">Teaching assignments</h1><p className="mt-1 text-sm text-muted">Assign class teachers and subject teachers to sections for an academic year.</p></header>
      {error && <p role="alert" className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-coral">{message(error)}</p>}
      {canAssignPermission && !canSelectStaff && <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-ink">Teaching assignment changes are unavailable because your account cannot read the active staff directory.</p>}
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <div><h2 className="font-bold text-ink">My teaching assignments</h2><p className="mt-1 text-xs text-muted">Your current class and subject responsibilities.</p></div>
        {myAssignmentsQuery.isPending ? <p className="text-sm text-muted">Loading your assignments…</p> : myAssignmentsQuery.isError ? <p role="alert" className="text-sm text-coral">{message(myAssignmentsQuery.error)}</p> : myAssignmentsQuery.data && <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg bg-soft p-3"><h3 className="text-sm font-semibold text-ink">Class teacher</h3>{myAssignmentsQuery.data.classTeacherOf.length ? myAssignmentsQuery.data.classTeacherOf.map((assignment) => <p key={assignment.sectionId} className="mt-2 text-sm text-muted">{assignment.className} · {assignment.sectionName}</p>) : <p className="mt-2 text-sm text-muted">No class-teacher assignment.</p>}</div><div className="rounded-lg bg-soft p-3"><h3 className="text-sm font-semibold text-ink">Subjects</h3>{myAssignmentsQuery.data.teaches.length ? myAssignmentsQuery.data.teaches.map((assignment) => <p key={`${assignment.sectionId}-${assignment.subjectId}`} className="mt-2 text-sm text-muted">{assignment.className} · {assignment.sectionName} · {assignment.subjectName}</p>) : <p className="mt-2 text-sm text-muted">No subject-teacher assignments.</p>}</div></div>}
      </section>
      <section className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2"><label className="space-y-1 text-xs font-semibold text-muted">Academic year<select value={yearId} onChange={(event) => setYearSelection(event.target.value)} className={fieldClass}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status.toLowerCase()}</option>)}</select></label><label className="space-y-1 text-xs font-semibold text-muted">Section<select value={sectionId} onChange={(event) => setSectionSelection(event.target.value)} className={fieldClass}>{sections.map((section) => <option key={section.id} value={section.id}>{section.className} · {section.name}</option>)}</select></label></section>
      {canAssign && <section className="space-y-3 rounded-2xl border border-line bg-panel p-5"><div><h2 className="font-bold text-ink">Staff assignment summary</h2><p className="mt-1 text-xs text-muted">Review a teacher’s classes and subjects for the selected year.</p></div><select aria-label="View staff assignments" value={assignmentStaffId} onChange={(event) => setAssignmentStaffId(event.target.value)} className={`${fieldClass} max-w-xl`}><option value="">Select a teaching staff member…</option>{teachers.map((staff) => <option key={staff.id} value={staff.id}>{staff.firstName} {staff.lastName} · {staff.staffNo}</option>)}</select>{staffAssignmentsQuery.isPending && assignmentStaffId && <p className="text-sm text-muted">Loading staff assignments…</p>}{staffAssignmentsQuery.isError && <p role="alert" className="text-sm text-coral">{message(staffAssignmentsQuery.error)}</p>}{staffAssignmentsQuery.data && <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg bg-soft p-3"><h3 className="text-sm font-semibold text-ink">Class teacher</h3>{staffAssignmentsQuery.data.classTeacherOf.length ? staffAssignmentsQuery.data.classTeacherOf.map((assignment) => <p key={assignment.sectionId} className="mt-2 text-sm text-muted">{assignment.className} · {assignment.sectionName}</p>) : <p className="mt-2 text-sm text-muted">No class-teacher assignment.</p>}</div><div className="rounded-lg bg-soft p-3"><h3 className="text-sm font-semibold text-ink">Subjects</h3>{staffAssignmentsQuery.data.teaches.length ? staffAssignmentsQuery.data.teaches.map((assignment) => <p key={`${assignment.sectionId}-${assignment.subjectId}`} className="mt-2 text-sm text-muted">{assignment.className} · {assignment.sectionName} · {assignment.subjectName}</p>) : <p className="mt-2 text-sm text-muted">No subject-teacher assignments.</p>}</div></div>}</section>}
      {teachingQuery.isPending && yearId && sectionId ? <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-muted">Loading teaching assignments…</div> : teaching && <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
        <article className="flex flex-col justify-between gap-3 rounded-xl bg-soft p-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><UserRoundCog className="text-teal" /><div><h2 className="font-bold text-ink">Class teacher</h2><p className="text-xs text-muted">Responsible for the selected section.</p></div></div><select aria-label="Class teacher" disabled={!canAssign || classTeacherMutation.isPending || staffQuery.isPending} value={teaching.classTeacher?.id ?? ""} onChange={(event) => classTeacherMutation.mutate(event.target.value || null)} className={`${fieldClass} sm:max-w-sm`}><option value="">Unassigned</option>{teachers.map((staff) => <option key={staff.id} value={staff.id}>{staff.firstName} {staff.lastName} · {staff.staffNo}</option>)}</select></article>
        <div><h2 className="mb-3 font-bold text-ink">Subject teachers & rosters</h2>{teaching.subjects.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">Set up this class curriculum before assigning subject teachers.</p> : <div className="divide-y divide-line rounded-xl border border-line">{teaching.subjects.map((subject) => <div key={subject.subjectId} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold text-ink">{subject.name}</p><p className="text-xs text-muted">{subject.code} · {subject.isCompulsory ? "Compulsory" : "Optional"}</p></div><div className="flex flex-wrap gap-2"><select aria-label={`Teacher for ${subject.name}`} disabled={!canAssign || subjectMutation.isPending || staffQuery.isPending} value={subject.teacher?.id ?? ""} onChange={(event) => subjectMutation.mutate({ subjectId: subject.subjectId, staffId: event.target.value || null })} className={`${fieldClass} sm:max-w-sm`}><option value="">Unassigned</option>{teachers.map((staff) => <option key={staff.id} value={staff.id}>{staff.firstName} {staff.lastName} · {staff.staffNo}</option>)}</select><button onClick={() => setRosterSubjectId((current) => current === subject.subjectId ? "" : subject.subjectId)} className="rounded-lg border border-line px-3 text-xs font-semibold text-teal hover:border-teal">{rosterSubjectId === subject.subjectId ? "Hide roster" : "View roster"}</button></div></div>)}</div>}{rosterSubjectId && <div className="mt-3 rounded-xl bg-soft p-4">{rosterQuery.isPending ? <p className="text-sm text-muted">Loading enrolled subject roster…</p> : rosterQuery.isError ? <p role="alert" className="text-sm text-coral">{message(rosterQuery.error)}</p> : rosterQuery.data && <><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-ink">{rosterQuery.data.subject.name} roster</h3><span className="text-xs text-muted">{rosterQuery.data.count} students</span></div>{rosterQuery.data.students.length ? <div className="divide-y divide-line rounded-lg border border-line bg-panel">{rosterQuery.data.students.map((student) => <div key={student.enrollmentId} className="flex justify-between gap-3 p-3 text-sm"><span className="font-medium text-ink">{student.name}</span><span className="text-xs text-muted">{student.admissionNo} · Roll {student.rollNo ?? "—"}</span></div>)}</div> : <p className="text-sm text-muted">No students are enrolled in this subject.</p>}</>}</div>}</div>
      </section>}
      {!canAssign && <p className="text-xs text-muted">Assignments are read-only for your account.</p>}
    </main>
  );
}
