"use client";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { listStudents, type StudentStatus } from "./services/students";
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

export default function StudentsWorkspace() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "">("ACTIVE");
  const [page, setPage] = useState(1);
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
  const result = studentsQuery.data;
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AdmissionHeader
        title="Student directory"
        description="Search the student register and review each student’s current enrollment in the active academic year."
      />
      <div className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-[minmax(240px,1fr)_220px]">
        <AdmissionField label="Search student">
          <span className="relative block">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <input
              className={`${formFieldClass} pl-9`}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name or admission number"
              value={search}
            />
          </span>
        </AdmissionField>
        <AdmissionSelect
          label="Student status"
          onChange={(value) => {
            setStatus(value as StudentStatus | "");
            setPage(1);
          }}
          value={status}
        >
          {STUDENT_STATUSES.map((item) => (
            <option key={item.value || "all"} value={item.value}>
              {item.label}
            </option>
          ))}
        </AdmissionSelect>
      </div>
      {studentsQuery.isPending ? (
        <AdmissionLoading>Loading student records…</AdmissionLoading>
      ) : studentsQuery.isError ? (
        <AdmissionError
          error={studentsQuery.error}
          retry={() => void studentsQuery.refetch()}
        />
      ) : result?.items.length ? (
        <section className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div>
              <h2 className="font-semibold">Student register</h2>
              <p className="mt-1 text-xs text-muted">
                {result.meta.total} record{result.meta.total === 1 ? "" : "s"}
              </p>
            </div>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-teal">
              Page {result.meta.page} of {Math.max(result.meta.totalPages, 1)}
            </span>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {result.items.map((student) => (
              <li key={student.id}>
                <Link
                  href={
                    "/dashboard/student-info/student-directory/" +
                    encodeURIComponent(student.id)
                  }
                  className="flex min-w-0 items-center justify-between gap-3 p-4 hover:bg-mint/30 focus-visible:outline-teal"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {[student.firstName, student.middleName, student.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                    {student.fullNameNp && (
                      <p lang="ne" className="text-sm text-muted">
                        {student.fullNameNp}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {student.admissionNo} ·{" "}
                      {student.enrollment
                        ? student.enrollment.className +
                          " · " +
                          student.enrollment.sectionName
                        : "No current placement"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-teal">
                    View profile
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-background text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Admission no.</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Active-year placement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((student) => (
                  <tr key={student.id}>
                    <td className="px-4 py-3">
                      <Link
                        className="text-sm font-semibold hover:text-teal hover:underline"
                        href={
                          "/dashboard/student-info/student-directory/" +
                          encodeURIComponent(student.id)
                        }
                      >
                        {student.firstName}
                        {student.middleName
                          ? ` ${student.middleName}`
                          : ""}{" "}
                        {student.lastName}
                      </Link>
                      {student.fullNameNp && (
                        <p className="text-xs text-muted">
                          {student.fullNameNp}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-muted">
                      {student.admissionNo}
                    </td>
                    <td className="px-4 py-3 text-xs">{student.gender}</td>
                    <td className="px-4 py-3 text-xs">
                      {student.enrollment ? (
                        <>
                          <span className="font-medium">
                            {student.enrollment.className} ·{" "}
                            {student.enrollment.sectionName}
                          </span>
                          <span className="mt-1 block text-muted">
                            Roll {student.enrollment.rollNo ?? "—"}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Not enrolled</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${student.status === "ACTIVE" ? "bg-mint text-teal" : "bg-background text-muted"}`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={
                          "/dashboard/student-info/student-directory/" +
                          encodeURIComponent(student.id)
                        }
                        className="inline-flex min-h-10 items-center font-semibold text-teal underline"
                      >
                        View profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line p-4">
            <p className="text-xs text-muted">
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
              {Math.min(
                result.meta.page * result.meta.pageSize,
                result.meta.total,
              )}{" "}
              of {result.meta.total}
            </p>
            <div className="flex gap-2">
              <button
                className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-background disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-background disabled:opacity-40"
                disabled={page >= result.meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : (
        <AdmissionEmpty title="No student records found">
          Try another search or status filter.
        </AdmissionEmpty>
      )}
    </main>
  );
}
