"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  listAcademicYears,
  listSchoolClasses,
} from "@/modules/settings/services/academic-setup";
import {
  createStudent,
  type CreateStudentResponse,
  type GuardianRelationship,
  type GuardianInput,
  type StudentGender,
} from "./services/students";
import {
  AdmissionError,
  AdmissionField,
  AdmissionHeader,
  AdmissionLoading,
  AdmissionSelect,
  formFieldClass,
} from "./components/shared";

import { GuardianPicker } from "@/modules/students/GuardianPicker";

type Props = { canSetAdmissionNumber: boolean; canManageGuardians: boolean; canReadGuardians: boolean; canManageEnrollments: boolean };
type FormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  fullNameNp: string;
  gender: StudentGender | "";
  dateOfBirth: string;
  admissionDate: string;
  address: string;
  calendar: "AD" | "BS";
  admissionNo: string;
  rollNo: string;
  placeStudent: boolean;
  academicYearId: string;
  sectionId: string;
};

const initialForm: FormValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  fullNameNp: "",
  gender: "",
  dateOfBirth: "",
  admissionDate: "",
  address: "",
  calendar: "AD",
  admissionNo: "",
  rollNo: "",
  placeStudent: false,
  academicYearId: "",
  sectionId: "",
};

const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "UNCLE", label: "Uncle" },
  { value: "AUNT", label: "Aunt" },
  { value: "LEGAL_GUARDIAN", label: "Legal guardian" },
  { value: "OTHER", label: "Other" },
];

export default function AdmissionIntakeWorkspace({
  canManageEnrollments, canReadGuardians, canManageGuardians, canSetAdmissionNumber,
}: Props) {
  const queryClient = useQueryClient();
  const firstGuardian = { key: "first", relationship: "FATHER" as GuardianRelationship, isPrimary: true, isEmergencyContact: true, createLogin: false };
  const [guardians, setGuardians] = useState<(GuardianInput & { key: string; displayName?: string })[]>([firstGuardian]);
  function editGuardian(key: string, changes: Partial<GuardianInput>) {
    setGuardians(rows => rows.map(row => row.key === key ? { ...row, ...changes } : changes.isPrimary ? { ...row, isPrimary: false } : row));
  }
  const [form, setForm] = useState(initialForm);
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);
  const [duplicateReviewRequired, setDuplicateReviewRequired] = useState(false);
  const [created, setCreated] = useState<CreateStudentResponse | null>(null);

  const yearsQuery = useQuery({
    queryKey: ["admissions", "years"],
    queryFn: listAcademicYears,
    enabled: canManageEnrollments,
  });
  const classesQuery = useQuery({
    queryKey: ["admissions", "classes"],
    queryFn: listSchoolClasses,
    enabled: canManageEnrollments,
  });
  const years = yearsQuery.data ?? [];
  const placementYears = years.filter((year) => year.status !== "CLOSED");
  const yearId =
    (placementYears.some((year) => year.id === form.academicYearId)
      ? form.academicYearId
      : "") ||
    (placementYears.find((year) => year.status === "ACTIVE") ?? placementYears[0])?.id ||
    "";
  const sections = useMemo(
    () =>
      (classesQuery.data ?? []).flatMap((schoolClass) =>
        schoolClass.isActive ? schoolClass.sections
          .filter((section) => section.isActive)
          .map((section) => ({
            ...section,
            className: schoolClass.name,
          })) : [],
      ),
    [classesQuery.data],
  );
  const selectedSectionId = sections.some(
    (section) => section.id === form.sectionId,
  )
    ? form.sectionId
    : (sections[0]?.id ?? "");
  const section = sections.find((item) => item.id === selectedSectionId);

  const createMutation = useMutation({
    mutationFn: () =>
      createStudent({
        firstName: form.firstName.trim(),
        ...(form.middleName.trim() ? { middleName: form.middleName.trim() } : {}),
        lastName: form.lastName.trim(),
        ...(form.fullNameNp.trim() ? { fullNameNp: form.fullNameNp.trim() } : {}),
        gender: form.gender as StudentGender,
        [form.calendar === "AD" ? "dateOfBirth" : "dateOfBirthBs"]: form.dateOfBirth,
        ...(form.admissionDate ? { [form.calendar === "AD" ? "admissionDate" : "admissionDateBs"]: form.admissionDate } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        ...(canSetAdmissionNumber && form.admissionNo.trim() ? { admissionNo: form.admissionNo.trim() } : {}),
        confirmNotDuplicate,
        guardians: guardians.map(g => {
          const link = { relationship: g.relationship, isPrimary: g.isPrimary, isEmergencyContact: g.isEmergencyContact, createLogin: g.createLogin, portalAccess: g.portalAccess };
          if (g.guardianId) return { ...link, guardianId: g.guardianId };
          return { ...link, firstName: g.firstName?.trim(), middleName: g.middleName?.trim() || undefined,
            lastName: g.lastName?.trim() || undefined, fullNameNp: g.fullNameNp?.trim() || undefined,
            phone: g.phone?.trim() || undefined, email: g.email?.trim() || undefined,
            address: g.address?.trim() || undefined, occupation: g.occupation?.trim() || undefined, phoneConfirmed: g.phoneConfirmed };
        }),
        ...(form.placeStudent && canManageEnrollments
          ? {
              placement: {
                academicYearId: yearId,
                sectionId: selectedSectionId,
                ...(form.rollNo ? { rollNo: Number(form.rollNo) } : {}),
              },
            }
          : {}),
      }),
    onSuccess: async (result) => {
      setCreated(result);
      setDuplicateReviewRequired(false);
      setConfirmNotDuplicate(false);
      toast.success(`Student ${result.student.admissionNo} registered.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admissions"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
      ]);
    },
    onError: (error) => {
      const errorText = error instanceof Error ? error.message : "The request failed.";
      if (errorText.toLowerCase().includes("possible duplicate")) {
        setDuplicateReviewRequired(true);
      }
      toast.error(errorText);
    },
  });

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (["firstName", "lastName", "dateOfBirth", "calendar"].includes(key)) {
      setDuplicateReviewRequired(false);
      setConfirmNotDuplicate(false);
    }
    if (created) setCreated(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const guardian of guardians) {
      if (guardian.guardianId) continue;
      if (!guardian.phone?.trim() && !guardian.email?.trim()) {
        toast.error("Enter a phone number or email for each new guardian.");
        return;
      }
      if (guardian.createLogin && (!guardian.phone?.trim() || !guardian.phoneConfirmed)) {
        toast.error("Confirm the phone number for each new login.");
        return;
      }
    }
    if (form.placeStudent && (!yearId || !selectedSectionId)) {
      toast.error("Choose an available academic year and active class section for placement.");
      return;
    }
    createMutation.mutate();
  }

  if (canManageEnrollments && (yearsQuery.isPending || classesQuery.isPending)) {
    return <AdmissionLoading>Loading academic placement options…</AdmissionLoading>;
  }
  if (canManageEnrollments && yearsQuery.isError) {
    return <AdmissionError error={yearsQuery.error} retry={() => void yearsQuery.refetch()} />;
  }
  if (canManageEnrollments && classesQuery.isError) {
    return <AdmissionError error={classesQuery.error} retry={() => void classesQuery.refetch()} />;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 text-ink md:p-6">
      <AdmissionHeader
        title="Student admission"
        description="Create a student record with a primary guardian. Admission numbers are assigned automatically by the school register."
      />
      {created && <AdmissionSuccess result={created} onNew={() => { setForm(initialForm); setGuardians([firstGuardian]); setCreated(null); }} />}
      <form onSubmit={submit}><fieldset disabled={createMutation.isPending || Boolean(created)} className="space-y-5">
        <section className="space-y-4 rounded-lg border border-line bg-panel p-5">
          <div className="border-b border-line pb-3"><h2 className="font-semibold">Student details</h2><p className="mt-1 text-xs text-muted">Enter the student&apos;s legal name and date of birth.</p></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <AdmissionField label="First name" required><input autoComplete="given-name" className={formFieldClass} maxLength={60} onChange={(event) => update("firstName", event.target.value)} required value={form.firstName} /></AdmissionField>
            <AdmissionField label="Middle name"><input className={formFieldClass} maxLength={60} onChange={(event) => update("middleName", event.target.value)} value={form.middleName} /></AdmissionField>
            <AdmissionField label="Last name" required><input autoComplete="family-name" className={formFieldClass} maxLength={60} onChange={(event) => update("lastName", event.target.value)} required value={form.lastName} /></AdmissionField>
            <AdmissionField label="Name in Nepali"><input className={formFieldClass} maxLength={150} onChange={(event) => update("fullNameNp", event.target.value)} value={form.fullNameNp} /></AdmissionField>
            <AdmissionSelect label="Gender" onChange={(value) => update("gender", value as StudentGender | "")} required value={form.gender}>
              <option value="">Select gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
            </AdmissionSelect>
            <AdmissionSelect label="Date calendar" value={form.calendar} onChange={value => {
              setForm(current => ({ ...current, calendar: value as "AD" | "BS", dateOfBirth: "", admissionDate: "" }));
              setConfirmNotDuplicate(false); setDuplicateReviewRequired(false);
            }}><option>AD</option><option>BS</option></AdmissionSelect>
            {(["dateOfBirth", "admissionDate"] as const).map(field => <AdmissionField key={field} label={(field === "dateOfBirth" ? "Date of birth" : "Admission date") + " · " + form.calendar} required={field === "dateOfBirth"}>
              <input className={formFieldClass} required={field === "dateOfBirth"} type={form.calendar === "AD" ? "date" : "text"}
                pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" placeholder="YYYY-MM-DD" value={form[field]} onChange={event => update(field, event.target.value)} />
            </AdmissionField>)}
            {canSetAdmissionNumber && <AdmissionField label="Existing admission number" hint="For an existing register. Leave blank to assign automatically."><input className={formFieldClass} maxLength={30} value={form.admissionNo} onChange={event => update("admissionNo", event.target.value)} /></AdmissionField>}
            <AdmissionField label="Home address" hint="Optional · up to 255 characters"><input autoComplete="street-address" className={formFieldClass} maxLength={255} onChange={(event) => update("address", event.target.value)} value={form.address} /></AdmissionField>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-line bg-panel p-5">
          <h2 className="font-semibold">Guardians</h2>
          {guardians.map((guardian, index) => <fieldset key={guardian.key} className="space-y-3 rounded border border-line p-3">
            <legend>{guardian.displayName ?? `Guardian ${index + 1}`}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {!guardian.guardianId && ([
                ["firstName", "First name", 60], ["middleName", "Middle name", 60], ["lastName", "Last name", 60],
                ["fullNameNp", "Name in Nepali", 150], ["phone", "Phone", 20], ["email", "Email", 254],
                ["address", "Address", 255], ["occupation", "Occupation", 80],
              ] as const).map(([field, label, max]) => <AdmissionField key={field} label={label} required={field === "firstName"}>
                <input className={formFieldClass} required={field === "firstName"} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                  maxLength={max} value={guardian[field] ?? ""} onChange={event => editGuardian(guardian.key, { [field]: event.target.value, ...(field === "phone" ? { phoneConfirmed: false } : {}) })} />
              </AdmissionField>)}
              <AdmissionSelect label="Relationship" value={guardian.relationship} onChange={value => editGuardian(guardian.key, { relationship: value as GuardianRelationship })}>
                {RELATIONSHIPS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </AdmissionSelect>
            </div>
            <div className="flex flex-wrap gap-4">
              <label><input type="radio" name="primaryGuardian" checked={guardian.isPrimary} onChange={() => editGuardian(guardian.key, { isPrimary: true })} /> Primary guardian</label>
              <label><input type="checkbox" checked={guardian.isEmergencyContact} onChange={event => editGuardian(guardian.key, { isEmergencyContact: event.target.checked })} /> Emergency contact</label>
              {canManageGuardians && <label><input type="checkbox" checked={guardian.portalAccess ?? true} onChange={event => editGuardian(guardian.key, { portalAccess: event.target.checked, ...(!event.target.checked ? { createLogin: false, phoneConfirmed: false } : {}) })} /> Can view this child</label>}
              {!guardian.guardianId && guardian.portalAccess !== false && <label><input type="checkbox" checked={guardian.createLogin} onChange={event => editGuardian(guardian.key, { createLogin: event.target.checked, phoneConfirmed: false })} /> Create login</label>}
              {guardian.createLogin && <label><input type="checkbox" checked={guardian.phoneConfirmed ?? false} onChange={event => editGuardian(guardian.key, { phoneConfirmed: event.target.checked })} /> I confirmed this phone number</label>}
              {guardians.length > 1 && <button type="button" onClick={() => setGuardians(rows => {
                const remaining = rows.filter(row => row.key !== guardian.key);
                return guardian.isPrimary ? remaining.map((row, i) => ({ ...row, isPrimary: i === 0 })) : remaining;
              })}>Remove guardian</button>}
            </div>
          </fieldset>)}
          {guardians.length < 6 && <>
            <button type="button" className="font-semibold text-teal" onClick={() => setGuardians(rows => [...rows, { ...firstGuardian, key: crypto.randomUUID(), isPrimary: false, isEmergencyContact: false }])}>Add new guardian</button>
            {canReadGuardians && <GuardianPicker exclude={guardians.flatMap(row => row.guardianId ? [row.guardianId] : [])} onSelect={g => setGuardians(rows => {
              const replaceBlank = rows.length === 1 && !rows[0].guardianId && !["firstName", "middleName", "lastName", "fullNameNp", "phone", "email", "address", "occupation"].some(field => rows[0][field as keyof GuardianInput]);
              return [...(replaceBlank ? [] : rows), { ...firstGuardian, key: g.id, guardianId: g.id, displayName: [g.firstName, g.lastName].filter(Boolean).join(" "), isPrimary: replaceBlank, isEmergencyContact: replaceBlank }];
            })} />}
          </>}
        </section>

        {canManageEnrollments && <section className="space-y-4 rounded-lg border border-line bg-panel p-5">
          <div className="border-b border-line pb-3"><h2 className="font-semibold">Academic placement</h2><p className="mt-1 text-xs text-muted">Optionally place the new student in the selected year and section as part of this admission.</p></div>
          <label className="flex items-start gap-3 text-sm"><input checked={form.placeStudent} className="mt-0.5 accent-teal" disabled={!placementYears.length || !sections.length} onChange={(event) => update("placeStudent", event.target.checked)} type="checkbox" /><span><span className="font-semibold">Enroll this student now</span><span className="mt-0.5 block text-xs text-muted">Student creation and seat assignment are saved together.</span></span></label>
          {(!placementYears.length || !sections.length) && <p className="rounded-md bg-amber/10 p-3 text-xs text-muted">{!placementYears.length ? "No planned or active academic year is available for enrollment." : "Create an active class section before placing students."}</p>}
          {form.placeStudent && <div className="grid gap-4 sm:grid-cols-2">
            <AdmissionSelect label="Academic year" onChange={(value) => { setForm((current) => ({ ...current, academicYearId: value, sectionId: "" })); }} required value={yearId}>
              {placementYears.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
            </AdmissionSelect>
            <AdmissionSelect label="Class and section" onChange={(value) => update("sectionId", value)} required value={selectedSectionId}>
              {sections.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}
            </AdmissionSelect>
            <AdmissionField label="Roll number" hint="Leave blank for automatic assignment."><input className={formFieldClass} type="number" min={1} max={999} value={form.rollNo} onChange={event => update("rollNo", event.target.value)} /></AdmissionField>
            {section && <p className="text-xs text-muted sm:col-span-2">Selected section: {section.name}{section.capacity !== null ? ` · section capacity ${section.capacity}` : ""}.</p>}
          </div>}
        </section>}

        {duplicateReviewRequired && <div className="rounded-lg border border-amber/40 bg-amber/10 p-4">
          <p>{createMutation.error?.message.split(". If this is")[0]}</p>
          <label className="flex items-start gap-3 text-sm"><input checked={confirmNotDuplicate} className="mt-0.5 accent-teal" onChange={(event) => setConfirmNotDuplicate(event.target.checked)} type="checkbox" /><span><span className="font-semibold">I reviewed the possible match and confirmed this is a different student.</span><span className="mt-1 block text-xs text-muted">The backend checks first name, last name and date of birth before creating a record.</span></span></label>
        </div>}

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted"><span className="text-coral">*</span> Required fields · The admission number is generated by the backend.</p>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal px-5 text-sm font-semibold text-white transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50" disabled={createMutation.isPending || (duplicateReviewRequired && !confirmNotDuplicate)} type="submit">
            {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {createMutation.isPending ? "Saving student…" : "Create student record"}
          </button>
        </div>
      </fieldset></form>
    </main>
  );
}

function AdmissionSuccess({
  result,
  onNew,
}: {
  result: CreateStudentResponse;
  onNew: () => void;
}) {
  const student = result.student;
  return (
    <section className="rounded-lg border border-teal/30 bg-mint/50 p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
          <div><p className="font-semibold text-ink">Student record created</p><p className="mt-1 text-sm text-muted">{student.firstName} {student.middleName ? `${student.middleName} ` : ""}{student.lastName} · Admission no. <strong className="text-ink">{student.admissionNo}</strong></p><p className="mt-1 text-xs text-muted">{student.enrollment ? `Enrolled in ${student.enrollment.className} · ${student.enrollment.sectionName} · Roll ${student.enrollment.rollNo ?? "—"}` : "No class placement was included."}</p></div>
        </div>
        <button className="rounded-md border border-teal/30 px-3 py-2 text-xs font-semibold text-teal hover:bg-white/50" onClick={onNew} type="button">Register another student</button>
      </div>
      <p className="text-sm">Birth date {student.dateOfBirth} AD{student.dateOfBirthBs && ` · ${student.dateOfBirthBs} BS`} · Admission date {student.admissionDate} AD{student.admissionDateBs && ` · ${student.admissionDateBs} BS`}</p>
      {result.logins.length > 0 && <div className="mt-4 flex items-start gap-2 border-t border-teal/20 pt-3 text-xs"><ShieldCheck className="h-4 w-4 shrink-0 text-teal" /><p>Guardian login provisioning: {result.logins.map((login) => login.message ?? login.status).join(" · ")}</p></div>}
    </section>
  );
}
