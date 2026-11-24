"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StudentDocuments } from "@/modules/students/StudentDocuments";
import { StudentProfile } from "@/modules/students/StudentProfile";
import { RecordDisclosure } from "@/components/RecordDisclosure";
import { getStudentAttendanceSummary } from "@/modules/attendance/services/reports";
import { createApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { GuardianPicker } from "@/modules/students/GuardianPicker";
import {
  changeStudentStatus,
  deleteStudent,
  getStudent,
  reactivateStudent,
  replaceStudentGuardians,
  updateStudent,
  type GuardianRelationship,
  type StudentGuardianLinkInput,
  type UpdateStudentInput,
} from "./services/students";
import {
  AdmissionError,
  AdmissionLoading,
  formFieldClass,
} from "./components/shared";
const directoryHref = "/dashboard/student-info/student-directory";
export function DirectoryProfile({
  selectedId,
  permissions,
}: {
  selectedId: string;
  permissions: readonly string[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const can = (permission: string) => permissions.includes(permission);
  const [studentDraft, setStudentDraft] = useState<{
    studentId: string;
    input: UpdateStudentInput;
  } | null>(null);
  const [guardianDraft, setGuardianDraft] = useState<{
    studentId: string;
    links: StudentGuardianLinkInput[];
  } | null>(null);
  const [statusChoice, setStatusChoice] = useState<
    "WITHDRAWN" | "TRANSFERRED" | "GRADUATED"
  >("WITHDRAWN");
  const [statusReason, setStatusReason] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [guardianNames, setGuardianNames] = useState<Record<string, string>>({});
  const detailQuery = useQuery({
    queryKey: ["admissions", "student-detail", selectedId],
    queryFn: () => getStudent(selectedId),
    retry: false,
  });
  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["guardians"] }),
      queryClient.invalidateQueries({ queryKey: ["admissions", "students"] }),
      queryClient.invalidateQueries({
        queryKey: ["admissions", "student-detail", selectedId],
      }),
    ]);
  const profileMutation = useMutation({
    mutationFn: () => updateStudent(selectedId, studentDraft?.input ?? {}),
    onSuccess: async () => {
      setStudentDraft(null);
      await refresh();
      toast.success("Student profile updated.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "The student profile could not be updated.",
      ),
  });
  const guardianMutation = useMutation({
    mutationFn: () =>
      replaceStudentGuardians(selectedId, guardianDraft?.links ?? []),
    onSuccess: async () => {
      setGuardianDraft(null);
      await refresh();
      toast.success("Guardian links updated.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Guardian links could not be updated.",
      ),
  });
  const statusMutation = useMutation({
    mutationFn: () =>
      changeStudentStatus(selectedId, {
        status: statusChoice,
        reason: statusReason.trim(),
        ...(effectiveOn ? { effectiveOn } : {}),
      }),
    onSuccess: async (result) => {
      setStatusReason("");
      await refresh();
      toast.success(
        `Student status changed to ${result.status}. ${result.enrollmentsClosed} enrollment(s) closed.`,
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "The student status could not be changed.",
      ),
  });
  const reactivateMutation = useMutation({
    mutationFn: () => reactivateStudent(selectedId),
    onSuccess: async () => {
      await refresh();
      toast.success(
        "Student reactivated. Enroll the student again to assign a class.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "The student could not be reactivated.",
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteStudent(selectedId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admissions", "students"],
      });
      router.replace(directoryHref);
      toast.success("Student record deleted.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "The student record could not be deleted.",
      ),
  });
  const student = detailQuery.data;
  const draftInput =
    student && studentDraft?.studentId === student.id
      ? studentDraft.input
      : null;
  const guardianLinks: StudentGuardianLinkInput[] =
    student && guardianDraft?.studentId === student.id
      ? guardianDraft.links
      : (student?.guardians.map((guardian) => ({
          guardianId: guardian.guardianId,
          relationship: guardian.relationship,
          isPrimary: guardian.isPrimary,
          isEmergencyContact: guardian.isEmergencyContact,
        })) ?? []);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href={directoryHref}
        className="inline-flex min-h-10 items-center text-sm font-semibold text-teal hover:underline"
      >
        ? Student directory
      </Link>
      {detailQuery.isPending ? (
        <AdmissionLoading>Loading student profile?</AdmissionLoading>
      ) : detailQuery.isError ? (
        <AdmissionError
          error={detailQuery.error}
          retry={() => void detailQuery.refetch()}
        />
      ) : (
        student && (
          <>
            <StudentProfile
              photoPath={`/students/${student.id}/photo`}
              current={student.enrollment}
              record={{
                ...student,
                name: [student.firstName, student.middleName, student.lastName]
                  .filter(Boolean)
                  .join(" "),
                nameNp: student.fullNameNp,
              }}
            />
            {can("students:read-all") && <StudentDocuments studentId={student.id} canUpload={can("students:update")} />}
            <div className="grid gap-3 sm:grid-cols-2">
              {permissions.some((p) =>
                [
                  "attendance:read",
                  "attendance:read-all",
                  "attendance:mark",
                  "attendance:mark-any",
                  "attendance:correct",
                ].includes(p),
              ) && (
                <RecordDisclosure
                  label="Attendance summary"
                  queryKey={["attendance", "student-profile", selectedId]}
                  load={() => getStudentAttendanceSummary(selectedId)}
                />
              )}
              {can("fees:read") && (
                <RecordDisclosure
                  label="Fee statement"
                  queryKey={[
                    "finance",
                    "student-profile-statement",
                    selectedId,
                  ]}
                  load={() =>
                    createApiClient().get(
                      "/students/" +
                        encodeURIComponent(selectedId) +
                        "/statement",
                    )
                  }
                />
              )}
            </div>
            {permissions.some((p) =>
              [
                "students:update",
                "students:change-status",
                "students:delete",
              ].includes(p),
            ) && (
              <details className="rounded-xl border border-line bg-panel p-5">
                <summary className="cursor-pointer font-semibold text-ink">
                  Manage student record
                </summary>
                <div className="mt-5 space-y-6">
                  {can("students:update") && (
                    <section className="space-y-3">
                      <h3 className="font-bold text-ink">
                        Personal information
                      </h3>
                      {can("students:read-all") && <StudentDocuments studentId={student.id} canUpload={can("students:update")} />}
            <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            "firstName",
                            "middleName",
                            "lastName",
                            "fullNameNp",
                            "dateOfBirth",
                            "address",
                          ] as const
                        ).map((field) => (
                          <label
                            key={field}
                            className="space-y-1 text-xs font-semibold capitalize text-muted"
                          >
                            {field.replace(/([A-Z])/g, " $1")}
                            <input
                              type={field === "dateOfBirth" ? "date" : "text"}
                              value={
                                draftInput?.[field] ?? student[field] ?? ""
                              }
                              onChange={(event) =>
                                setStudentDraft({
                                  studentId: student.id,
                                  input: {
                                    ...(draftInput ?? {}),
                                    [field]: event.target.value,
                                  },
                                })
                              }
                              className={formFieldClass}
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        disabled={!draftInput || profileMutation.isPending}
                        onClick={() => profileMutation.mutate()}
                        className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {profileMutation.isPending ? "Saving…" : "Save profile"}
                      </button>
                    </section>
                  )}
                  {can("students:update") && can("guardians:read") && (
                    <section className="space-y-3 border-t border-line pt-5">
                      <h3 className="font-bold text-ink">
                        Guardian relationships
                      </h3>
                      <div className="space-y-2">
                        {guardianLinks.map((link, index) => {
                          const guardian = student.guardians.find(
                            (item) => item.guardianId === link.guardianId,
                          );
                          const label = guardian?.name ?? guardianNames[link.guardianId] ?? link.guardianId;
                          return (
                            <div
                              key={link.guardianId}
                              className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_150px_auto_auto_auto] sm:items-center"
                            >
                              <p className="text-sm font-medium text-ink">
                                {label}
                              </p>
                              <select
                                aria-label={`Relationship for ${label}`}
                                value={link.relationship}
                                onChange={(event) =>
                                  setGuardianDraft({
                                    studentId: student.id,
                                    links: guardianLinks.map((item, current) =>
                                      current === index
                                        ? {
                                            ...item,
                                            relationship: event.target
                                              .value as GuardianRelationship,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                                className={formFieldClass}
                              >
                                {[
                                  "FATHER",
                                  "MOTHER",
                                  "GRANDPARENT",
                                  "SIBLING",
                                  "UNCLE",
                                  "AUNT",
                                  "LEGAL_GUARDIAN",
                                  "OTHER",
                                ].map((item) => (
                                  <option key={item} value={item}>
                                    {item.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                              <label className="flex items-center gap-1 text-xs text-muted">
                                <input
                                  type="checkbox"
                                  checked={link.isPrimary}
                                  onChange={(event) =>
                                    setGuardianDraft({
                                      studentId: student.id,
                                      links: guardianLinks.map(
                                        (item, current) => ({
                                          ...item,
                                          isPrimary:
                                            current === index &&
                                            event.target.checked,
                                        }),
                                      ),
                                    })
                                  }
                                />
                                Primary
                              </label>
                              <label className="flex items-center gap-1 text-xs text-muted">
                                <input
                                  type="checkbox"
                                  checked={Boolean(link.isEmergencyContact)}
                                  onChange={(event) =>
                                    setGuardianDraft({
                                      studentId: student.id,
                                      links: guardianLinks.map(
                                        (item, current) =>
                                          current === index
                                            ? {
                                                ...item,
                                                isEmergencyContact:
                                                  event.target.checked,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                />
                                Emergency
                              </label>
                              <label className="flex items-center gap-1 text-xs text-muted">
                                <input type="checkbox" disabled={!can("guardians:manage")}
                                  checked={link.portalAccess ?? guardian?.portalAccess ?? true}
                                  onChange={event => setGuardianDraft({ studentId: student.id, links: guardianLinks.map((item, i) => i === index ? { ...item, portalAccess: event.target.checked } : item) })} />
                                Can view this child
                              </label>
                              <button
                                disabled={guardianLinks.length <= 1}
                                onClick={() => {
                                  const remaining = guardianLinks.filter(
                                    (_, current) => current !== index,
                                  );
                                  if (!remaining.some((item) => item.isPrimary))
                                    remaining[0] = {
                                      ...remaining[0],
                                      isPrimary: true,
                                    };
                                  setGuardianDraft({
                                    studentId: student.id,
                                    links: remaining,
                                  });
                                }}
                                className="text-xs font-semibold text-coral disabled:opacity-40"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {guardianLinks.length < 6 && <GuardianPicker exclude={guardianLinks.map(g => g.guardianId)} onSelect={g => {
                          setGuardianNames(names => ({ ...names, [g.id]: [g.firstName, g.middleName, g.lastName].filter(Boolean).join(" ") }));
                          setGuardianDraft({ studentId: student.id, links: [...guardianLinks, { guardianId: g.id, relationship: "LEGAL_GUARDIAN", isPrimary: !guardianLinks.length, isEmergencyContact: false }] });
                        }} />}
                        <button
                          disabled={
                            !guardianDraft ||
                            guardianMutation.isPending ||
                            guardianLinks.length < 1 ||
                            guardianLinks.filter((link) => link.isPrimary)
                              .length !== 1
                          }
                          onClick={() => guardianMutation.mutate()}
                          className="rounded-lg bg-teal px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {guardianMutation.isPending
                            ? "Saving…"
                            : "Save guardian links"}
                        </button>
                      </div>
                    </section>
                  )}
                  {can("students:change-status") && (
                    <section className="space-y-3 border-t border-line pt-5">
                      <h3 className="font-bold text-ink">Lifecycle status</h3>
                      {student.status === "ACTIVE" ? (
                        <form
                          className="grid gap-3 sm:grid-cols-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (
                              window.confirm(
                                `Change ${student.firstName} ${student.lastName} to ${statusChoice.toLowerCase()}? This also closes current enrollments.`,
                              )
                            )
                              statusMutation.mutate();
                          }}
                        >
                          <label className="space-y-1 text-xs font-semibold text-muted">
                            Change status
                            <select
                              value={statusChoice}
                              onChange={(event) =>
                                setStatusChoice(
                                  event.target.value as typeof statusChoice,
                                )
                              }
                              className={formFieldClass}
                            >
                              <option value="WITHDRAWN">Withdrawn</option>
                              <option value="TRANSFERRED">Transferred</option>
                              <option value="GRADUATED">Graduated</option>
                            </select>
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-muted">
                            Effective date (optional)
                            <input
                              type="date"
                              value={effectiveOn}
                              onChange={(event) =>
                                setEffectiveOn(event.target.value)
                              }
                              className={formFieldClass}
                            />
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-muted sm:col-span-2">
                            Reason (10–500 characters)
                            <textarea
                              value={statusReason}
                              onChange={(event) =>
                                setStatusReason(event.target.value)
                              }
                              minLength={10}
                              maxLength={500}
                              required
                              className={`${formFieldClass} min-h-20`}
                            />
                          </label>
                          <button
                            disabled={
                              statusMutation.isPending ||
                              statusReason.trim().length < 10
                            }
                            className="rounded-lg border border-coral/30 px-4 py-2 text-sm font-semibold text-coral disabled:opacity-50"
                          >
                            {statusMutation.isPending
                              ? "Updating…"
                              : "Change status"}
                          </button>
                        </form>
                      ) : (
                        <button
                          disabled={reactivateMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Reactivate ${student.firstName} ${student.lastName}? They will need a new enrollment.`,
                              )
                            )
                              reactivateMutation.mutate();
                          }}
                          className="rounded-lg border border-teal/30 px-4 py-2 text-sm font-semibold text-teal disabled:opacity-50"
                        >
                          {reactivateMutation.isPending
                            ? "Reactivating…"
                            : "Reactivate student"}
                        </button>
                      )}
                    </section>
                  )}
                  {can("students:delete") && (
                    <section className="border-t border-line pt-5">
                      <button
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently delete ${student.firstName} ${student.lastName}? This is only possible if no records depend on the student.`,
                            )
                          )
                            deleteMutation.mutate();
                        }}
                        className="rounded-lg border border-coral/30 px-4 py-2 text-sm font-semibold text-coral disabled:opacity-50"
                      >
                        {deleteMutation.isPending
                          ? "Deleting…"
                          : "Delete student record"}
                      </button>
                    </section>
                  )}
                </div>
              </details>
            )}
          </>
        )
      )}
    </div>
  );
}
