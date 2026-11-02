"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAcademicYears,
  listSchoolClasses,
} from "@/modules/settings/services/academic-setup";
import {
  assignSectionRollNumbers,
  deleteEnrollment,
  enrollStudent,
  getSectionOccupancy,
  listSectionEnrollments,
  moveEnrollment,
  type SectionEnrollment,
} from "./services/enrollments";
import { listStudents } from "./services/students";
import {
  getEnrollmentChoices,
  setEnrollmentChoices,
} from "@/modules/academics/services/optional-subjects";
import {
  AdmissionEmpty,
  AdmissionError,
  AdmissionHeader,
  AdmissionLoading,
  AdmissionMetric,
  AdmissionSelect,
  formFieldClass,
} from "./components/shared";

type Props = {
  canManage: boolean;
  canReadStudents: boolean;
  canReadRoster: boolean;
  canReadOccupancy: boolean;
};

function rosterOrderKey(
  yearId: string,
  sectionId: string,
  roster: SectionEnrollment[],
): string {
  return `${yearId}:${sectionId}:${roster
    .filter((entry) => entry.status === "ENROLLED")
    .map((entry) => entry.enrollmentId)
    .sort()
    .join(",")}`;
}

export default function EnrollmentWorkspace(props: Props) {
  const queryClient = useQueryClient();
  const [yearSelection, setYearSelection] = useState("");
  const [sectionSelection, setSectionSelection] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [choicesEnrollment, setChoicesEnrollment] = useState<string | null>(null);
  const [choiceDraft, setChoiceDraft] = useState<{ enrollmentId: string; subjectIds: string[] } | null>(null);
  const [rollOrderDraft, setRollOrderDraft] = useState<{
    key: string;
    order: string[];
  }>({ key: "", order: [] });
  const deferredSearch = useDeferredValue(studentSearch.trim());

  const yearsQuery = useQuery({
    queryKey: ["admissions", "years"],
    queryFn: listAcademicYears,
  });
  const classesQuery = useQuery({
    queryKey: ["admissions", "classes"],
    queryFn: listSchoolClasses,
  });
  const years = yearsQuery.data ?? [];
  const yearId =
    yearSelection ||
    (years.find((year) => year.status === "ACTIVE") ?? years[0])?.id ||
    "";
  const selectedYear = years.find((year) => year.id === yearId);
  const yearClosed = selectedYear?.status === "CLOSED";
  const sections = useMemo(
    () =>
      (classesQuery.data ?? []).flatMap((schoolClass) =>
        schoolClass.isActive ? schoolClass.sections
          .filter((section) => section.isActive)
          .map((section) => ({
            ...section,
            classId: schoolClass.id,
            className: schoolClass.name,
          })) : [],
      ),
    [classesQuery.data],
  );
  const sectionId = sections.some((section) => section.id === sectionSelection)
    ? sectionSelection
    : (sections[0]?.id ?? "");
  const selectedSection = sections.find((section) => section.id === sectionId);
  const occupancyQuery = useQuery({
    queryKey: ["admissions", "occupancy", yearId],
    queryFn: () => getSectionOccupancy(yearId),
    enabled: Boolean(yearId && props.canReadOccupancy),
    retry: false,
  });
  const occupancy = occupancyQuery.data ?? [];
  const sectionOccupancy = occupancy.find((item) => item.sectionId === sectionId);
  const rosterQuery = useQuery({
    queryKey: ["admissions", "section-roster", yearId, sectionId],
    queryFn: () => listSectionEnrollments(yearId, sectionId),
    enabled: Boolean(yearId && sectionId && props.canReadRoster),
    retry: false,
  });
  const choicesQuery = useQuery({
    queryKey: ["admissions", "optional-subjects", choicesEnrollment],
    queryFn: () => getEnrollmentChoices(choicesEnrollment!),
    enabled: Boolean(choicesEnrollment && props.canManage),
    retry: false,
  });
  const choiceIds = choiceDraft?.enrollmentId === choicesEnrollment
    ? choiceDraft.subjectIds
    : choicesQuery.data?.optional.filter((subject) => subject.chosen).map((subject) => subject.subjectId) ?? [];
  const roster = rosterQuery.data ?? [];
  const activeRoster = roster.filter((item) => item.status === "ENROLLED");
  const completedRoster = roster.filter((item) => item.status !== "ENROLLED");
  const sourceOrder = activeRoster.map((item) => item.enrollmentId);
  const orderKey = rosterOrderKey(yearId, sectionId, roster);
  const rollOrder =
    rollOrderDraft.key === orderKey ? rollOrderDraft.order : sourceOrder;
  const rosterById = new Map(
    activeRoster.map((enrollment) => [enrollment.enrollmentId, enrollment]),
  );
  const orderedRoster = rollOrder
    .map((id) => rosterById.get(id))
    .filter((item): item is SectionEnrollment => Boolean(item));
  const rollOrderChanged =
    rollOrder.length === sourceOrder.length &&
    rollOrder.some((id, index) => id !== sourceOrder[index]);
  const compatibleSections = sections.filter(
    (section) => section.classId === selectedSection?.classId,
  );

  const studentsQuery = useQuery({
    queryKey: ["admissions", "search-students", deferredSearch],
    queryFn: () =>
      listStudents({
        page: 1,
        pageSize: 10,
        search: deferredSearch,
        status: "ACTIVE",
      }),
    enabled: Boolean(props.canManage && props.canReadStudents && deferredSearch.length >= 2),
    retry: false,
  });

  const invalidateEnrollmentData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admissions", "occupancy"] }),
      queryClient.invalidateQueries({ queryKey: ["admissions", "section-roster"] }),
      queryClient.invalidateQueries({ queryKey: ["admissions", "search-students"] }),
      queryClient.invalidateQueries({ queryKey: ["admissions", "student-count"] }),
    ]);
  };
  const enrollMutation = useMutation({
    mutationFn: (studentId: string) => enrollStudent(studentId, { academicYearId: yearId, sectionId }),
    onSuccess: async (result) => {
      toast.success(`${result.studentName} enrolled in ${result.className} · ${result.sectionName}.`);
      setStudentSearch("");
      await invalidateEnrollmentData();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The enrollment request failed."),
  });
  const moveMutation = useMutation({
    mutationFn: (input: { enrollmentId: string; destinationSectionId: string }) =>
      moveEnrollment(input.enrollmentId, { sectionId: input.destinationSectionId }),
    onSuccess: async (result) => {
      toast.success(`${result.studentName} moved to ${result.sectionName}.`);
      await invalidateEnrollmentData();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The move request failed."),
  });
  const deleteMutation = useMutation({
    mutationFn: (enrollmentId: string) => deleteEnrollment(enrollmentId),
    onSuccess: async () => {
      toast.success("Enrollment removed.");
      await invalidateEnrollmentData();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The enrollment could not be removed."),
  });
  const choicesMutation = useMutation({
    mutationFn: () => setEnrollmentChoices(choicesEnrollment!, choiceIds),
    onSuccess: async () => {
      toast.success("Optional subject choices saved.");
      await queryClient.invalidateQueries({ queryKey: ["admissions", "optional-subjects", choicesEnrollment] });
      setChoicesEnrollment(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The optional subject choices could not be saved."),
  });
  const rollMutation = useMutation({
    mutationFn: () => assignSectionRollNumbers(yearId, sectionId, rollOrder),
    onSuccess: async () => {
      toast.success("Section roll numbers assigned in the displayed order.");
      setRollOrderDraft({ key: "", order: [] });
      await invalidateEnrollmentData();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Roll numbers could not be assigned."),
  });

  function moveOrder(enrollmentId: string, delta: -1 | 1) {
    const index = rollOrder.indexOf(enrollmentId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= rollOrder.length) return;
    const next = [...rollOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setRollOrderDraft({ key: orderKey, order: next });
  }

  if (yearsQuery.isPending || classesQuery.isPending) {
    return <AdmissionLoading>Loading enrollment options…</AdmissionLoading>;
  }
  if (yearsQuery.isError) {
    return <AdmissionError error={yearsQuery.error} retry={() => void yearsQuery.refetch()} />;
  }
  if (classesQuery.isError) {
    return <AdmissionError error={classesQuery.error} retry={() => void classesQuery.refetch()} />;
  }
  if (!years.length) {
    return <AdmissionEmpty title="No academic year available">Create an academic year before managing enrollments.</AdmissionEmpty>;
  }
  if (!sections.length) {
    return <AdmissionEmpty title="No active class sections">Create active classes and sections before placing students.</AdmissionEmpty>;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AdmissionHeader
        title="Enrollment & class rosters"
        description="Place active students into academic-year sections, monitor available capacity and keep roll numbers in order."
      />
      <div className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-2">
        <AdmissionSelect label="Academic year" onChange={setYearSelection} value={yearId}>
          {years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
        </AdmissionSelect>
        <AdmissionSelect label="Class and section" onChange={setSectionSelection} value={sectionId}>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.className} · {section.name}</option>)}
        </AdmissionSelect>
      </div>
      {yearClosed && <div className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm"><p className="font-semibold">This academic year is closed</p><p className="mt-1 text-xs text-muted">Historical rosters remain available, but enrollment changes and roll-number assignments are disabled.</p></div>}

      {props.canReadOccupancy && (occupancyQuery.isError ? (
        <AdmissionError error={occupancyQuery.error} retry={() => void occupancyQuery.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <AdmissionMetric label="Students enrolled" value={occupancyQuery.isPending ? "…" : sectionOccupancy?.enrolled ?? 0} detail={`${selectedSection?.className} · ${selectedSection?.name}`} />
          <AdmissionMetric label="Section capacity" value={occupancyQuery.isPending ? "…" : sectionOccupancy?.capacity ?? "Unlimited"} detail={sectionOccupancy?.capacity === null ? "No seat limit configured" : "Configured maximum seats"} />
          <AdmissionMetric label="Seats available" value={occupancyQuery.isPending ? "…" : sectionOccupancy?.capacity === null ? "Unlimited" : Math.max((sectionOccupancy?.capacity ?? 0) - (sectionOccupancy?.enrolled ?? 0), 0)} detail="Based on current enrollment count" />
        </div>
      ))}

      {props.canManage && props.canReadStudents && (
        <section className="space-y-4 rounded-lg border border-line bg-panel p-5">
          <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-mint text-teal"><UserPlus className="h-4 w-4" /></span><div><h2 className="font-semibold">Enroll an existing student</h2><p className="mt-1 text-xs text-muted">Search by student name or admission number. Student details are limited to your API access scope.</p></div></div>
          <label className="relative block max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><input className={`${formFieldClass} pl-9`} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Enter at least 2 characters…" value={studentSearch} /></label>
          {deferredSearch.length >= 2 && studentsQuery.isPending ? <AdmissionLoading>Searching active students…</AdmissionLoading> : null}
          {studentsQuery.isError && <AdmissionError error={studentsQuery.error} retry={() => void studentsQuery.refetch()} />}
          {deferredSearch.length >= 2 && studentsQuery.data && (
            <div className="overflow-hidden rounded-md border border-line">
              {studentsQuery.data.items.length ? studentsQuery.data.items.map((student) => {
                const alreadyEnrolled = student.enrollment?.status === "ENROLLED";
                const capacity = sectionOccupancy
                  ? sectionOccupancy.capacity
                  : selectedSection?.capacity;
                const enrolledCount = sectionOccupancy?.enrolled;
                const full = capacity !== null &&
                  capacity !== undefined &&
                  enrolledCount !== undefined &&
                  enrolledCount >= capacity;
                return (
                  <div className="flex flex-col justify-between gap-3 border-b border-line p-3 last:border-0 sm:flex-row sm:items-center" key={student.id}>
                    <div><p className="text-sm font-semibold">{student.firstName}{student.middleName ? ` ${student.middleName}` : ""} {student.lastName}</p><p className="mt-1 text-xs text-muted">{student.admissionNo} · {student.status}{student.enrollment ? ` · ${student.enrollment.className} ${student.enrollment.sectionName}` : ""}</p></div>
                    <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal px-3 text-xs font-semibold text-white hover:bg-navy disabled:cursor-not-allowed disabled:opacity-45" disabled={!props.canManage || yearClosed || alreadyEnrolled || full || enrollMutation.isPending || !sectionId} onClick={() => enrollMutation.mutate(student.id)} type="button">
                      {enrollMutation.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      {alreadyEnrolled ? "Already enrolled" : full ? "Section full" : "Enroll in section"}
                    </button>
                  </div>
                );
              }              ) : <p className="p-4 text-sm text-muted">No active students matched this search.</p>}
                  {studentsQuery.data.meta.total > studentsQuery.data.items.length && <p className="border-t border-line bg-background/50 px-3 py-2 text-[11px] text-muted">Showing the first {studentsQuery.data.items.length} matches. Refine the search to find a student.</p>}
                </div>
              )}
              {deferredSearch.length < 2 && <p className="text-xs text-muted">Select a student from the results to place them here. The backend assigns the next available roll number automatically.</p>}
        </section>
      )}

      {props.canManage && !props.canReadStudents && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm"><p className="font-semibold">Student search is not available</p><p className="mt-1 text-xs text-muted">The backend requires student read access to search existing records. You can still review rosters and manage roll numbers allowed by your access.</p></div>
      )}

      {props.canReadRoster ? (
        rosterQuery.isPending ? <AdmissionLoading>Loading section roster…</AdmissionLoading> : rosterQuery.isError ? <AdmissionError error={rosterQuery.error} retry={() => void rosterQuery.refetch()} /> : (
          <section className="overflow-hidden rounded-lg border border-line bg-panel">
            <div className="flex flex-col justify-between gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
              <div><h2 className="font-semibold">{selectedSection?.className} · {selectedSection?.name}</h2><p className="mt-1 text-xs text-muted">{activeRoster.length} active enrollment{activeRoster.length === 1 ? "" : "s"} · roll numbers follow the order below</p></div>
              {props.canManage && <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal px-3.5 text-xs font-semibold text-white hover:bg-navy disabled:opacity-45" disabled={yearClosed || !rollOrderChanged || rollMutation.isPending || !activeRoster.length || activeRoster.length > 200} onClick={() => rollMutation.mutate()} type="button">{rollMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}Assign roll numbers</button>}
            </div>
            {props.canManage && activeRoster.length > 200 && <p className="border-b border-line bg-amber/10 px-4 py-2 text-xs text-ink">Bulk roll assignment supports at most 200 enrollments.</p>}
            {roster.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-background text-xs uppercase text-muted"><tr><th className="px-4 py-3">Roll</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Admission no.</th><th className="px-4 py-3">Status</th>{props.canManage && <th className="px-4 py-3">Actions</th>}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {orderedRoster.map((student, index) => (
                      <EnrollmentRow
                        key={student.enrollmentId}
                        student={student}
                        orderNumber={index + 1}
                        rollOrderChanged={rollOrderChanged}
                        canManage={props.canManage}
                        canManageOperations={!yearClosed}
                        sections={compatibleSections}
                        sectionId={sectionId}
                        movePending={moveMutation.isPending}
                        removePending={deleteMutation.isPending}
                        onChoices={() => setChoicesEnrollment(student.enrollmentId)}
                        onMove={(destinationSectionId) => moveMutation.mutate({ enrollmentId: student.enrollmentId, destinationSectionId })}
                        onRemove={() => {
                          if (window.confirm(`Remove ${student.name}'s enrollment? This is only allowed if no attendance or exam records depend on it.`)) {
                            deleteMutation.mutate(student.enrollmentId);
                          }
                        }}
                        onUp={() => moveOrder(student.enrollmentId, -1)}
                        onDown={() => moveOrder(student.enrollmentId, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < orderedRoster.length - 1}
                      />
                    ))}
                    {completedRoster.map((student) => (
                      <tr className="bg-background/40" key={student.enrollmentId}><td className="px-4 py-3 text-sm text-muted">{student.rollNo ?? "—"}</td><td className="px-4 py-3 text-sm font-medium">{student.name}</td><td className="px-4 py-3 text-xs text-muted">{student.admissionNo}</td><td className="px-4 py-3"><span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-semibold text-muted">{student.status}</span></td>{props.canManage && <td className="px-4 py-3 text-xs text-muted">Historical enrollment</td>}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-8 text-center"><Users className="mx-auto h-6 w-6 text-muted" /><p className="mt-2 text-sm font-semibold">No students enrolled yet</p><p className="mt-1 text-xs text-muted">Search for an active student above to add them to this section.</p></div>}
          </section>
        )
      ) : (
        <AdmissionEmpty title="Roster access is restricted">Your role does not have permission to read this section&apos;s roster.</AdmissionEmpty>
      )}
      {choicesEnrollment && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setChoicesEnrollment(null); }}><section role="dialog" aria-modal="true" aria-labelledby="optional-subject-title" className="w-full max-w-lg rounded-xl border border-line bg-panel p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><h2 id="optional-subject-title" className="text-lg font-bold text-ink">Optional subject choices</h2><p className="mt-1 text-sm text-muted">Select up to 20 optional subjects. Compulsory subjects are included automatically.</p></div><button onClick={() => setChoicesEnrollment(null)} className="rounded-md border border-line px-3 py-1 text-sm text-muted">Close</button></div>{choicesQuery.isPending ? <p className="py-8 text-center text-sm text-muted">Loading curriculum choices…</p> : choicesQuery.isError ? <p role="alert" className="py-6 text-sm text-coral">{choicesQuery.error instanceof Error ? choicesQuery.error.message : "Choices could not be loaded."}</p> : choicesQuery.data &&       <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{choicesQuery.data.compulsory.map((subject) => <div key={subject.subjectId} className="flex items-center justify-between rounded-lg bg-soft p-3 text-sm"><span className="text-ink">{subject.code} · {subject.name}</span><span className="text-xs font-semibold text-teal">Compulsory</span></div>)}{choicesQuery.data.optional.map((subject) => <label key={subject.subjectId} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm hover:bg-soft"><span className="text-ink">{subject.code} · {subject.name}</span><input type="checkbox" checked={choiceIds.includes(subject.subjectId)} disabled={!subject.chosen && choiceIds.length >= 20} onChange={(event) => setChoiceDraft({ enrollmentId: choicesEnrollment, subjectIds: event.target.checked ? [...choiceIds, subject.subjectId] : choiceIds.filter((id) => id !== subject.subjectId) })} className="h-4 w-4 accent-teal" /></label>)}</div>}<div className="mt-5 flex justify-end gap-2 border-t border-line pt-4"><button onClick={() => setChoicesEnrollment(null)} className="rounded-md border border-line px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={choicesQuery.isPending || choicesQuery.isError || choicesMutation.isPending || choiceIds.length > 20} onClick={() => choicesMutation.mutate()} className="rounded-md bg-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{choicesMutation.isPending ? "Saving…" : "Save choices"}</button></div></section></div>}
    </main>
  );
}

function EnrollmentRow({
  student,
  orderNumber,
  rollOrderChanged,
  canManage,
  canManageOperations,
  sections,
  sectionId,
  movePending,
  removePending,
  onChoices,
  onMove,
  onRemove,
  onUp,
  onDown,
  canMoveUp,
  canMoveDown,
}: {
  student: SectionEnrollment;
  orderNumber: number;
  rollOrderChanged: boolean;
  canManage: boolean;
  canManageOperations: boolean;
  sections: { id: string; name: string; className: string }[];
  sectionId: string;
  movePending: boolean;
  removePending: boolean;
  onChoices: () => void;
  onMove: (sectionId: string) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <tr>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          {canManage && <span className="flex flex-col"><button aria-label={`Move ${student.name} up`} className="rounded p-0.5 text-muted hover:bg-background disabled:opacity-25" disabled={!canManageOperations || !canMoveUp} onClick={onUp} type="button"><ArrowUp className="h-3 w-3" /></button><button aria-label={`Move ${student.name} down`} className="rounded p-0.5 text-muted hover:bg-background disabled:opacity-25" disabled={!canManageOperations || !canMoveDown} onClick={onDown} type="button"><ArrowDown className="h-3 w-3" /></button></span>}
          {rollOrderChanged ? orderNumber : student.rollNo ?? orderNumber}
        </span>
      </td>
      <td className="px-4 py-3"><p className="text-sm font-semibold">{student.name}</p>{student.fullNameNp && <p className="text-xs text-muted">{student.fullNameNp}</p>}</td>
      <td className="px-4 py-3 text-xs text-muted">{student.admissionNo}</td>
      <td className="px-4 py-3"><span className="rounded-full bg-mint px-2.5 py-1 text-[10px] font-semibold text-teal">{student.status}</span></td>
      {canManage && <td className="px-4 py-3"><div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-teal hover:bg-background disabled:opacity-50" disabled={!canManageOperations} onClick={onChoices} type="button"><SlidersHorizontal className="h-3.5 w-3.5" />Subjects</button>
        <select aria-label={`Move ${student.name} to section`} className="max-w-48 rounded-md border border-line bg-panel px-2 py-1.5 text-xs" disabled={!canManageOperations || movePending || sections.length < 2} onChange={(event) => { if (event.target.value && event.target.value !== sectionId && window.confirm(`Move ${student.name} to the selected section?`)) onMove(event.target.value); }} value={sectionId}>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.className} · {section.name}</option>)}
        </select>
        <button className="text-xs font-semibold text-coral hover:underline disabled:opacity-50" disabled={!canManageOperations || removePending} onClick={onRemove} type="button">Remove</button>
      </div></td>}
    </tr>
  );
}
