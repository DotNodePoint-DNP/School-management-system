"use client";

import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserRoundPen } from "lucide-react";
import { toast } from "sonner";
import { listGuardians } from "@/modules/students/services/guardians";
import {
  changeStudentStatus,
  deleteStudent,
  getStudent,
  listStudents,
  reactivateStudent,
  replaceStudentGuardians,
  updateStudent,
  type GuardianRelationship,
  type StudentGuardianLinkInput,
  type StudentStatus,
  type UpdateStudentInput,
} from "./services/students";
import {
  AdmissionEmpty,
  AdmissionError,
  AdmissionField,
  AdmissionHeader,
  AdmissionLoading,
  AdmissionSelect,
  formFieldClass,
} from "./components/shared";

const STUDENT_STATUSES: { value: StudentStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export default function StudentsWorkspace({
  permissions,
  initialSelectedId,
}: {
  permissions: readonly string[];
  initialSelectedId?: string;
}) {
  const queryClient = useQueryClient();
  const can = (permission: string) => permissions.includes(permission);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "">("ACTIVE");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [studentDraft, setStudentDraft] = useState<{ studentId: string; input: UpdateStudentInput } | null>(null);
  const [guardianDraft, setGuardianDraft] = useState<{ studentId: string; links: StudentGuardianLinkInput[] } | null>(null);
  const [statusChoice, setStatusChoice] = useState<"WITHDRAWN" | "TRANSFERRED" | "GRADUATED">("WITHDRAWN");
  const [statusReason, setStatusReason] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [guardianToAdd, setGuardianToAdd] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const studentsQuery = useQuery({
    queryKey: ["admissions", "students", deferredSearch, status, page],
    queryFn: () =>
      listStudents({
        page,
        pageSize: 20,
        ...(deferredSearch ? { search: deferredSearch } : {}),
        ...(status ? { status } : {}),
        sortBy: "admissionDate",
        sortOrder: "desc",
      }),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["admissions", "student-detail", selectedId],
    queryFn: () => getStudent(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const guardiansQuery = useQuery({
    queryKey: ["guardians", "student-link-options"],
    queryFn: () => listGuardians({ page: 1, pageSize: 100 }),
    enabled: Boolean(selectedId && can("students:update") && can("guardians:read")),
    retry: false,
  });
  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admissions", "students"] }),
    queryClient.invalidateQueries({ queryKey: ["admissions", "student-detail", selectedId] }),
  ]);
  const profileMutation = useMutation({
    mutationFn: () => updateStudent(selectedId!, studentDraft?.input ?? {}),
    onSuccess: async () => { setStudentDraft(null); await refresh(); toast.success("Student profile updated."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The student profile could not be updated."),
  });
  const guardianMutation = useMutation({
    mutationFn: () => replaceStudentGuardians(selectedId!, guardianDraft?.links ?? []),
    onSuccess: async () => { setGuardianDraft(null); await refresh(); toast.success("Guardian links updated."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Guardian links could not be updated."),
  });
  const statusMutation = useMutation({
    mutationFn: () => changeStudentStatus(selectedId!, { status: statusChoice, reason: statusReason.trim(), ...(effectiveOn ? { effectiveOn } : {}) }),
    onSuccess: async (result) => { setStatusReason(""); await refresh(); toast.success(`Student status changed to ${result.status}. ${result.enrollmentsClosed} enrollment(s) closed.`); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The student status could not be changed."),
  });
  const reactivateMutation = useMutation({
    mutationFn: () => reactivateStudent(selectedId!),
    onSuccess: async () => { await refresh(); toast.success("Student reactivated. Enroll the student again to assign a class."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The student could not be reactivated."),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteStudent(selectedId!),
    onSuccess: async () => { setSelectedId(null); await refresh(); toast.success("Student record deleted."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The student record could not be deleted."),
  });
  const result = studentsQuery.data;
  const student = detailQuery.data;
  const draftInput = student && studentDraft?.studentId === student.id ? studentDraft.input : null;
  const guardianLinks = student && guardianDraft?.studentId === student.id
    ? guardianDraft.links
    : student?.guardians.map((guardian) => ({
        guardianId: guardian.guardianId,
        relationship: guardian.relationship,
        isPrimary: guardian.isPrimary,
        isEmergencyContact: guardian.isEmergencyContact,
      })) ?? [];

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AdmissionHeader
        title="Student admissions"
        description="Search the student register and review each student’s current enrollment in the active academic year."
      />
      <div className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-[minmax(240px,1fr)_220px]">
        <AdmissionField label="Search student">
          <span className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><input className={`${formFieldClass} pl-9`} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Name or admission number" value={search} /></span>
        </AdmissionField>
        <AdmissionSelect label="Student status" onChange={(value) => { setStatus(value as StudentStatus | ""); setPage(1); }} value={status}>
          {STUDENT_STATUSES.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
        </AdmissionSelect>
      </div>
      {studentsQuery.isPending ? (
        <AdmissionLoading>Loading student records…</AdmissionLoading>
      ) : studentsQuery.isError ? (
        <AdmissionError error={studentsQuery.error} retry={() => void studentsQuery.refetch()} />
      ) : result?.items.length ? (
        <section className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line p-4"><div><h2 className="font-semibold">Student register</h2><p className="mt-1 text-xs text-muted">{result.meta.total} record{result.meta.total === 1 ? "" : "s"}</p></div><span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-teal">Page {result.meta.page} of {Math.max(result.meta.totalPages, 1)}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Admission no.</th><th className="px-4 py-3">Gender</th><th className="px-4 py-3">Active-year placement</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Profile</th></tr></thead>
              <tbody className="divide-y divide-line">{result.items.map((student) => <tr key={student.id}>
                <td className="px-4 py-3"><p className="text-sm font-semibold">{student.firstName}{student.middleName ? ` ${student.middleName}` : ""} {student.lastName}</p>{student.fullNameNp && <p className="text-xs text-muted">{student.fullNameNp}</p>}</td>
                <td className="px-4 py-3 text-xs font-medium text-muted">{student.admissionNo}</td>
                <td className="px-4 py-3 text-xs">{student.gender}</td>
                <td className="px-4 py-3 text-xs">{student.enrollment ? <><span className="font-medium">{student.enrollment.className} · {student.enrollment.sectionName}</span><span className="mt-1 block text-muted">Roll {student.enrollment.rollNo ?? "—"}</span></> : <span className="text-muted">Not enrolled</span>}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${student.status === "ACTIVE" ? "bg-mint text-teal" : "bg-background text-muted"}`}>{student.status}</span></td>
                <td className="px-4 py-3"><button onClick={() => { setSelectedId(student.id); setStudentDraft(null); setGuardianDraft(null); setGuardianToAdd(""); }} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-teal hover:border-teal"><UserRoundPen size={14} />Manage</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line p-4">
            <p className="text-xs text-muted">Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–{Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total}</p>
            <div className="flex gap-2"><button className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-background disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">Previous</button><button className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-background disabled:opacity-40" disabled={page >= result.meta.totalPages} onClick={() => setPage((current) => current + 1)} type="button">Next</button></div>
          </div>
        </section>
      ) : (
        <AdmissionEmpty title="No student records found">Try another search or status filter.</AdmissionEmpty>
      )}
      {selectedId && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside role="dialog" aria-modal="true" aria-labelledby="student-profile-title" className="h-full w-full max-w-2xl overflow-y-auto bg-panel p-5 shadow-xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-teal">Student record</p><h2 id="student-profile-title" className="mt-1 text-xl font-bold text-ink">{student ? `${student.firstName} ${student.lastName}` : "Loading profile…"}</h2></div><button onClick={() => setSelectedId(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted">Close</button></div>{detailQuery.isPending ? <p className="py-8 text-sm text-muted">Loading student details…</p> : detailQuery.isError ? <p role="alert" className="py-6 text-sm text-coral">{detailQuery.error instanceof Error ? detailQuery.error.message : "The student profile could not be loaded."}</p> : student && <div className="mt-6 space-y-6">
        <section className="grid gap-3 rounded-xl bg-soft p-4 text-sm sm:grid-cols-2"><p><span className="text-muted">Admission no.</span><strong className="ml-2 text-ink">{student.admissionNo}</strong></p><p><span className="text-muted">Status</span><strong className="ml-2 text-ink">{student.status}</strong></p><p><span className="text-muted">Date of birth</span><strong className="ml-2 text-ink">{student.dateOfBirth}</strong></p><p><span className="text-muted">Admission date</span><strong className="ml-2 text-ink">{student.admissionDate}</strong></p>{student.statusNote && <p className="sm:col-span-2"><span className="text-muted">Status reason</span><strong className="ml-2 text-ink">{student.statusNote}</strong></p>}</section>
        {can("students:update") && <section className="space-y-3"><h3 className="font-bold text-ink">Personal information</h3><div className="grid gap-3 sm:grid-cols-2">{(["firstName", "middleName", "lastName", "fullNameNp", "dateOfBirth", "address"] as const).map((field) => <label key={field} className="space-y-1 text-xs font-semibold capitalize text-muted">{field.replace(/([A-Z])/g, " $1")}<input type={field === "dateOfBirth" ? "date" : "text"} value={draftInput?.[field] ?? student[field] ?? ""} onChange={(event) => setStudentDraft({ studentId: student.id, input: { ...(draftInput ?? {}), [field]: event.target.value } })} className={formFieldClass} /></label>)}</div><button disabled={!draftInput || profileMutation.isPending} onClick={() => profileMutation.mutate()} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{profileMutation.isPending ? "Saving…" : "Save profile"}</button></section>}
        {can("students:update") && can("guardians:read") && <section className="space-y-3 border-t border-line pt-5"><h3 className="font-bold text-ink">Guardian relationships</h3><div className="space-y-2">{guardianLinks.map((link, index) => { const guardian = student.guardians.find((item) => item.guardianId === link.guardianId); const candidate = guardiansQuery.data?.items.find((item) => item.id === link.guardianId); const label = guardian?.name ?? [candidate?.firstName, candidate?.middleName, candidate?.lastName].filter(Boolean).join(" ") ?? link.guardianId; return <div key={link.guardianId} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_150px_auto_auto_auto] sm:items-center"><p className="text-sm font-medium text-ink">{label}</p><select aria-label={`Relationship for ${label}`} value={link.relationship} onChange={(event) => setGuardianDraft({ studentId: student.id, links: guardianLinks.map((item, current) => current === index ? { ...item, relationship: event.target.value as GuardianRelationship } : item) })} className={formFieldClass}>{["FATHER", "MOTHER", "GRANDPARENT", "SIBLING", "UNCLE", "AUNT", "LEGAL_GUARDIAN", "OTHER"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={link.isPrimary} onChange={(event) => setGuardianDraft({ studentId: student.id, links: guardianLinks.map((item, current) => ({ ...item, isPrimary: current === index && event.target.checked })) })} />Primary</label><label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={Boolean(link.isEmergencyContact)} onChange={(event) => setGuardianDraft({ studentId: student.id, links: guardianLinks.map((item, current) => current === index ? { ...item, isEmergencyContact: event.target.checked } : item) })} />Emergency</label><button disabled={guardianLinks.length <= 1} onClick={() => { const remaining = guardianLinks.filter((_, current) => current !== index); if (!remaining.some((item) => item.isPrimary)) remaining[0] = { ...remaining[0], isPrimary: true }; setGuardianDraft({ studentId: student.id, links: remaining }); }} className="text-xs font-semibold text-coral disabled:opacity-40">Remove</button></div>; })}</div><div className="flex flex-wrap gap-2"><select aria-label="Add existing guardian" value={guardianToAdd} onChange={(event) => setGuardianToAdd(event.target.value)} className={`${formFieldClass} max-w-sm`}><option value="">Add an existing guardian…</option>{guardiansQuery.data?.items.filter((guardian) => !guardianLinks.some((link) => link.guardianId === guardian.id)).map((guardian) => <option key={guardian.id} value={guardian.id}>{[guardian.firstName, guardian.middleName, guardian.lastName].filter(Boolean).join(" ")}</option>)}</select><button disabled={!guardianToAdd || guardianLinks.length >= 6} onClick={() => { const newLink: StudentGuardianLinkInput = { guardianId: guardianToAdd, relationship: "LEGAL_GUARDIAN", isPrimary: guardianLinks.length === 0, isEmergencyContact: false }; setGuardianDraft({ studentId: student.id, links: [...guardianLinks, newLink] }); setGuardianToAdd(""); }} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40">Add guardian</button><button disabled={!guardianDraft || guardianMutation.isPending || guardianLinks.length < 1 || guardianLinks.filter((link) => link.isPrimary).length !== 1} onClick={() => guardianMutation.mutate()} className="rounded-lg bg-teal px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{guardianMutation.isPending ? "Saving…" : "Save guardian links"}</button></div>{guardiansQuery.isError && <p role="alert" className="text-sm text-coral">{guardiansQuery.error instanceof Error ? guardiansQuery.error.message : "Guardian options could not be loaded."}</p>}</section>}
        {can("students:change-status") && <section className="space-y-3 border-t border-line pt-5"><h3 className="font-bold text-ink">Lifecycle status</h3>{student.status === "ACTIVE" ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (window.confirm(`Change ${student.firstName} ${student.lastName} to ${statusChoice.toLowerCase()}? This also closes current enrollments.`)) statusMutation.mutate(); }}><label className="space-y-1 text-xs font-semibold text-muted">Change status<select value={statusChoice} onChange={(event) => setStatusChoice(event.target.value as typeof statusChoice)} className={formFieldClass}><option value="WITHDRAWN">Withdrawn</option><option value="TRANSFERRED">Transferred</option><option value="GRADUATED">Graduated</option></select></label><label className="space-y-1 text-xs font-semibold text-muted">Effective date (optional)<input type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} className={formFieldClass} /></label><label className="space-y-1 text-xs font-semibold text-muted sm:col-span-2">Reason (10–500 characters)<textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} minLength={10} maxLength={500} required className={`${formFieldClass} min-h-20`} /></label><button disabled={statusMutation.isPending || statusReason.trim().length < 10} className="rounded-lg border border-coral/30 px-4 py-2 text-sm font-semibold text-coral disabled:opacity-50">{statusMutation.isPending ? "Updating…" : "Change status"}</button></form> : <button disabled={reactivateMutation.isPending} onClick={() => { if (window.confirm(`Reactivate ${student.firstName} ${student.lastName}? They will need a new enrollment.`)) reactivateMutation.mutate(); }} className="rounded-lg border border-teal/30 px-4 py-2 text-sm font-semibold text-teal disabled:opacity-50">{reactivateMutation.isPending ? "Reactivating…" : "Reactivate student"}</button>}</section>}
        {can("students:delete") && <section className="border-t border-line pt-5"><button disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(`Permanently delete ${student.firstName} ${student.lastName}? This is only possible if no records depend on the student.`)) deleteMutation.mutate(); }} className="rounded-lg border border-coral/30 px-4 py-2 text-sm font-semibold text-coral disabled:opacity-50">{deleteMutation.isPending ? "Deleting…" : "Delete student record"}</button></section>}
      </div>}</aside></div>}
    </main>
  );
}
