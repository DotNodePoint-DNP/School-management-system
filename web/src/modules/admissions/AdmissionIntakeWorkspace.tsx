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

type Props = { canManageEnrollments: boolean };
type FormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  fullNameNp: string;
  gender: StudentGender | "";
  dateOfBirth: string;
  admissionDate: string;
  address: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: GuardianRelationship | "";
  guardianPhone: string;
  guardianEmail: string;
  guardianOccupation: string;
  createLogin: boolean;
  phoneConfirmed: boolean;
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
  guardianFirstName: "",
  guardianLastName: "",
  guardianRelationship: "",
  guardianPhone: "",
  guardianEmail: "",
  guardianOccupation: "",
  createLogin: false,
  phoneConfirmed: false,
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
  canManageEnrollments,
}: Props) {
  const queryClient = useQueryClient();
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
        dateOfBirth: form.dateOfBirth,
        ...(form.admissionDate ? { admissionDate: form.admissionDate } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        confirmNotDuplicate,
        guardians: [
          {
            firstName: form.guardianFirstName.trim(),
            ...(form.guardianLastName.trim()
              ? { lastName: form.guardianLastName.trim() }
              : {}),
            relationship: form.guardianRelationship as GuardianRelationship,
            ...(form.guardianPhone.trim()
              ? { phone: form.guardianPhone.trim() }
              : {}),
            ...(form.guardianEmail.trim()
              ? { email: form.guardianEmail.trim() }
              : {}),
            ...(form.guardianOccupation.trim()
              ? { occupation: form.guardianOccupation.trim() }
              : {}),
            isPrimary: true,
            isEmergencyContact: true,
            createLogin: form.createLogin,
            ...(form.createLogin && form.phoneConfirmed
              ? { phoneConfirmed: true }
              : {}),
          },
        ],
        ...(form.placeStudent && canManageEnrollments
          ? {
              placement: {
                academicYearId: yearId,
                sectionId: selectedSectionId,
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
    if (created) setCreated(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.guardianPhone.trim() && !form.guardianEmail.trim()) {
      toast.error("Add a guardian phone number or email address.");
      return;
    }
    if (form.createLogin && (!form.guardianPhone.trim() || !form.phoneConfirmed)) {
      toast.error("Confirm the guardian phone number before enabling login.");
      return;
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
      {created && <AdmissionSuccess result={created} onNew={() => { setForm(initialForm); setCreated(null); }} />}
      <form className="space-y-5" onSubmit={submit}>
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
            <AdmissionField label="Date of birth · AD" required><input className={formFieldClass} max={new Date().toISOString().slice(0, 10)} onChange={(event) => update("dateOfBirth", event.target.value)} required type="date" value={form.dateOfBirth} /></AdmissionField>
            <AdmissionField label="Admission date · AD" hint="Leave blank to use today."><input className={formFieldClass} onChange={(event) => update("admissionDate", event.target.value)} type="date" value={form.admissionDate} /></AdmissionField>
            <AdmissionField label="Home address" hint="Optional · up to 255 characters"><input autoComplete="street-address" className={formFieldClass} maxLength={255} onChange={(event) => update("address", event.target.value)} value={form.address} /></AdmissionField>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-line bg-panel p-5">
          <div className="border-b border-line pb-3"><h2 className="font-semibold">Primary guardian</h2><p className="mt-1 text-xs text-muted">Add at least one reachable guardian. Login creation is optional.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdmissionField label="Guardian first name" required><input autoComplete="given-name" className={formFieldClass} maxLength={60} onChange={(event) => update("guardianFirstName", event.target.value)} required value={form.guardianFirstName} /></AdmissionField>
            <AdmissionField label="Guardian last name"><input autoComplete="family-name" className={formFieldClass} maxLength={60} onChange={(event) => update("guardianLastName", event.target.value)} value={form.guardianLastName} /></AdmissionField>
            <AdmissionSelect label="Relationship" onChange={(value) => update("guardianRelationship", value as GuardianRelationship | "")} required value={form.guardianRelationship}>
              <option value="">Select relationship</option>{RELATIONSHIPS.map((relationship) => <option key={relationship.value} value={relationship.value}>{relationship.label}</option>)}
            </AdmissionSelect>
            <AdmissionField label="Occupation"><input className={formFieldClass} maxLength={80} onChange={(event) => update("guardianOccupation", event.target.value)} value={form.guardianOccupation} /></AdmissionField>
            <AdmissionField label="Phone number" hint="At least one phone number or email is required."><input autoComplete="tel" className={formFieldClass} maxLength={20} onChange={(event) => update("guardianPhone", event.target.value)} type="tel" value={form.guardianPhone} /></AdmissionField>
            <AdmissionField label="Email address" hint="At least one phone number or email is required."><input autoComplete="email" className={formFieldClass} maxLength={254} onChange={(event) => update("guardianEmail", event.target.value)} type="email" value={form.guardianEmail} /></AdmissionField>
          </div>
          <div className="space-y-3 rounded-md bg-background p-4">
            <label className="flex items-start gap-3 text-sm">
              <input checked={form.createLogin} className="mt-0.5 accent-teal" onChange={(event) => update("createLogin", event.target.checked)} type="checkbox" />
              <span><span className="font-semibold">Create a guardian portal login</span><span className="mt-0.5 block text-xs text-muted">Credentials will be provisioned after the student is saved.</span></span>
            </label>
            {form.createLogin && <label className="flex items-start gap-3 border-t border-line pt-3 text-sm">
              <input checked={form.phoneConfirmed} className="mt-0.5 accent-teal" onChange={(event) => update("phoneConfirmed", event.target.checked)} type="checkbox" />
              <span><span className="font-semibold">I confirmed this guardian&apos;s phone number</span><span className="mt-0.5 block text-xs text-muted">Backend requires confirmation before sending credentials to a new phone.</span></span>
            </label>}
          </div>
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
            {section && <p className="text-xs text-muted sm:col-span-2">Roll number is assigned automatically{section.capacity !== null ? ` · section capacity ${section.capacity}` : ""}.</p>}
          </div>}
        </section>}

        {duplicateReviewRequired && <div className="rounded-lg border border-amber/40 bg-amber/10 p-4">
          <label className="flex items-start gap-3 text-sm"><input checked={confirmNotDuplicate} className="mt-0.5 accent-teal" onChange={(event) => setConfirmNotDuplicate(event.target.checked)} type="checkbox" /><span><span className="font-semibold">I reviewed the possible match and confirmed this is a different student.</span><span className="mt-1 block text-xs text-muted">The backend checks first name, last name and date of birth before creating a record.</span></span></label>
        </div>}

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted"><span className="text-coral">*</span> Required fields · The admission number is generated by the backend.</p>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal px-5 text-sm font-semibold text-white transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50" disabled={createMutation.isPending || (duplicateReviewRequired && !confirmNotDuplicate)} type="submit">
            {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {createMutation.isPending ? "Saving student…" : "Create student record"}
          </button>
        </div>
      </form>
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
      {result.logins.length > 0 && <div className="mt-4 flex items-start gap-2 border-t border-teal/20 pt-3 text-xs"><ShieldCheck className="h-4 w-4 shrink-0 text-teal" /><p>Guardian login provisioning: {result.logins.map((login) => login.message ?? login.status).join(" · ")}</p></div>}
    </section>
  );
}
