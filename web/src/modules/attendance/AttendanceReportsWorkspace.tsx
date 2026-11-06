"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  listAcademicYears,
  listSchoolClasses,
} from "@/modules/settings/services/academic-setup";
import {
  getSectionAttendanceSummary,
  getStudentAttendanceHistory,
  getStudentAttendanceSummary,
  type SectionAttendanceStudent,
  type StudentAttendanceHistoryItem,
} from "./services/reports";
import {
  AttendanceHeader,
  EmptyBox,
  ErrorBox,
  Field,
  formatDate,
  inputClass,
  LoadingBox,
  localDate,
  SelectField,
  StatusPill,
  SummaryBreakdown,
  SummaryCard,
} from "./components/shared";

export default function AttendanceReportsWorkspace() {
  const [yearSelection, setYearSelection] = useState("");
  const [sectionSelection, setSectionSelection] = useState("");
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [to, setTo] = useState(localDate);
  const yearsQuery = useQuery({
    queryKey: ["attendance", "years"],
    queryFn: listAcademicYears,
  });
  const classesQuery = useQuery({
    queryKey: ["attendance", "classes"],
    queryFn: listSchoolClasses,
  });
  const years = yearsQuery.data ?? [];
  const yearId =
    yearSelection ||
    (years.find((item) => item.status === "ACTIVE") ?? years[0])?.id ||
    "";
  const sections = useMemo(
    () =>
      (classesQuery.data ?? []).flatMap((schoolClass) =>
        schoolClass.sections
          .filter((section) => section.isActive)
          .map((section) => ({
            ...section,
            className: schoolClass.name,
          })),
      ),
    [classesQuery.data],
  );
  const sectionId = sections.some((section) => section.id === sectionSelection)
    ? sectionSelection
    : (sections[0]?.id ?? "");
  const reportQuery = useQuery({
    queryKey: ["attendance", "section-summary", yearId, sectionId, from, to],
    queryFn: () => getSectionAttendanceSummary(yearId, sectionId, { from, to }),
    enabled: Boolean(yearId && sectionId && from && to),
    retry: false,
  });
  const students = useMemo(
    () => reportQuery.data?.students ?? [],
    [reportQuery.data],
  );
  const selectedStudentId = students.some(
    (student) => student.studentId === studentId,
  )
    ? studentId
    : "";
  const selectedStudent = students.find(
    (student) => student.studentId === selectedStudentId,
  );
  const filteredStudents = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return students;
    return students.filter((student) =>
      `${student.name} ${student.admissionNo} ${student.rollNo ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [search, students]);
  const summaryQuery = useQuery({
    queryKey: ["attendance", "student-summary", selectedStudentId, from, to],
    queryFn: () => getStudentAttendanceSummary(selectedStudentId, { from, to }),
    enabled: Boolean(selectedStudentId),
  });
  const historyQuery = useInfiniteQuery({
    queryKey: ["attendance", "student-history", selectedStudentId, from, to],
    queryFn: ({ pageParam }) =>
      getStudentAttendanceHistory(selectedStudentId, {
        from,
        to,
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    enabled: Boolean(selectedStudentId),
  });

  if (yearsQuery.isPending || classesQuery.isPending) {
    return <LoadingBox>Loading attendance reports…</LoadingBox>;
  }
  if (yearsQuery.isError) {
    return (
      <ErrorBox
        error={yearsQuery.error}
        retry={() => void yearsQuery.refetch()}
      />
    );
  }
  if (classesQuery.isError) {
    return (
      <ErrorBox
        error={classesQuery.error}
        retry={() => void classesQuery.refetch()}
      />
    );
  }
  if (!years.length) {
    return (
      <EmptyBox title="No academic year available">
        Create an academic year before viewing attendance reports.
      </EmptyBox>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AttendanceHeader
        title="Attendance reports"
        description="Review section trends and follow up on individual student attendance."
      />
      <div className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-4">
        <SelectField
          label="Academic year"
          onChange={setYearSelection}
          value={yearId}
        >
          {years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name} · {year.status}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Class and section"
          onChange={(value) => {
            setSectionSelection(value);
            setStudentId("");
          }}
          value={sectionId}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.className} · {section.name}
            </option>
          ))}
        </SelectField>
        <Field label="From · AD">
          <input
            className={inputClass}
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </Field>
        <Field label="To · AD">
          <input
            className={inputClass}
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </Field>
      </div>
      {reportQuery.isPending ? (
        <LoadingBox>Building section report…</LoadingBox>
      ) : reportQuery.isError ? (
        <ErrorBox
          error={reportQuery.error}
          retry={() => void reportQuery.refetch()}
        />
      ) : reportQuery.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              label="Days recorded"
              value={reportQuery.data.daysTaken}
              detail={`${formatDate(reportQuery.data.from)} – ${formatDate(reportQuery.data.to)}`}
            />
            <SummaryCard
              label="Students"
              value={students.length}
              detail="Enrolled in this section"
            />
            <SummaryCard
              label="Below 80%"
              value={
                students.filter(
                  (student) =>
                    student.percentage !== null && student.percentage < 80,
                ).length
              }
              detail="May need a follow-up"
            />
            <SummaryCard
              label="Section average"
              value={
                students.length
                  ? `${(students.reduce((sum, student) => sum + (student.percentage ?? 0), 0) / students.length).toFixed(1)}%`
                  : "—"
              }
              detail="Present plus late"
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
            <section className="overflow-hidden rounded-lg border border-line bg-panel">
              <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Student attendance</h2>
                  <p className="mt-1 text-xs text-muted">
                    Select a student to open their attendance history.
                  </p>
                </div>
                <label className="relative block sm:w-56">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    className="h-9 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-xs outline-none focus:border-teal"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or admission"
                    value={search}
                  />
                </label>
              </div>
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="sticky top-0 bg-background text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Attended</th>
                      <th className="px-4 py-3">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredStudents.map(
                      (student: SectionAttendanceStudent) => (
                        <tr
                          aria-selected={
                            selectedStudentId === student.studentId
                          }
                          className={`cursor-pointer hover:bg-mint/40 ${selectedStudentId === student.studentId ? "bg-mint/40" : ""}`}
                          key={student.studentId}
                          onClick={() => setStudentId(student.studentId)}
                        >
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold">
                              {student.name}
                            </p>
                            <p className="text-xs text-muted">
                              Roll {student.rollNo ?? "—"} ·{" "}
                              {student.admissionNo}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {student.daysRecorded}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {student.attended}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm font-bold ${(student.percentage ?? 0) < 80 ? "text-coral" : "text-teal"}`}
                          >
                            {student.percentage === null
                              ? "—"
                              : `${student.percentage}%`}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {!filteredStudents.length && (
                  <p className="p-8 text-center text-sm text-muted">
                    No students match this search.
                  </p>
                )}
              </div>
            </section>
            <StudentHistory
              history={
                historyQuery.data?.pages.flatMap((page) => page.items) ?? []
              }
              isError={summaryQuery.isError || historyQuery.isError}
              isLoading={summaryQuery.isLoading || historyQuery.isLoading}
              error={summaryQuery.error ?? historyQuery.error}
              student={selectedStudent}
              summary={summaryQuery.data}
              hasMore={historyQuery.hasNextPage}
              loadingMore={historyQuery.isFetchingNextPage}
              onRetry={() => {
                void summaryQuery.refetch();
                void historyQuery.refetch();
              }}
              onLoadMore={() => void historyQuery.fetchNextPage()}
            />
          </div>
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="font-semibold">Attendance by day</h2>
            <p className="mb-4 mt-1 text-xs text-muted">
              Daily totals across the selected range.
            </p>
            {reportQuery.data.days.length ? (
              <div className="space-y-3">
                {reportQuery.data.days
                  .slice()
                  .reverse()
                  .map((day) => (
                    <div
                      className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-xs"
                      key={day.date}
                    >
                      <span className="text-muted">{formatDate(day.date)}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-teal"
                          style={{ width: `${day.percentage ?? 0}%` }}
                        />
                      </div>
                      <span className="font-semibold">
                        {day.percentage === null ? "—" : `${day.percentage}%`}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No attendance records in this range.
              </p>
            )}
          </section>
        </>
      ) : (
        <EmptyBox title="Select a class and report range">
          Choose the dates to view section attendance and student trends.
        </EmptyBox>
      )}
    </main>
  );
}

function StudentHistory({
  student,
  summary,
  history,
  isLoading,
  isError,
  error,
  hasMore,
  loadingMore,
  onRetry,
  onLoadMore,
}: {
  student?: SectionAttendanceStudent;
  summary?: Awaited<ReturnType<typeof getStudentAttendanceSummary>>;
  history: StudentAttendanceHistoryItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasMore?: boolean;
  loadingMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  if (!student) {
    return (
      <EmptyBox title="Student history">
        Select a student from the report to review their attendance.
      </EmptyBox>
    );
  }
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">{student.name}</h2>
        <p className="mt-1 text-xs text-muted">
          Attendance history · {student.admissionNo}
        </p>
      </div>
      {isLoading ? (
        <p className="p-6 text-sm text-muted">Loading student history…</p>
      ) : isError ? (
        <ErrorBox error={error} retry={onRetry} />
      ) : (
        <>
          {summary && (
            <div className="border-b border-line p-4">
              <p className="mb-3 text-sm font-semibold">
                {summary.percentage === null
                  ? "No records yet"
                  : `${summary.percentage}% attendance`}
                <span className="ml-1 font-normal text-muted">
                  · {summary.daysRecorded} days recorded
                </span>
              </p>
              <SummaryBreakdown counts={summary.counts} />
            </div>
          )}
          <div className="max-h-[380px] divide-y divide-line overflow-auto">
            {history.map((item) => (
              <div
                className="flex items-start justify-between gap-3 px-4 py-3"
                key={`${item.date}-${item.className}-${item.sectionName}`}
              >
                <div>
                  <p className="text-sm font-semibold">
                    {formatDate(item.date)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {item.className} · {item.sectionName}
                    {item.dateBs ? ` · BS ${item.dateBs}` : ""}
                  </p>
                  {item.note && (
                    <p className="mt-1 text-xs text-muted">{item.note}</p>
                  )}
                </div>
                <StatusPill status={item.status} />
              </div>
            ))}
            {!history.length && (
              <p className="p-6 text-center text-sm text-muted">
                No history in the selected range.
              </p>
            )}
          </div>
          {hasMore && (
            <button
              className="w-full border-t border-line py-3 text-xs font-semibold text-teal hover:bg-background disabled:opacity-50"
              disabled={loadingMore}
              onClick={onLoadMore}
              type="button"
            >
              {loadingMore ? "Loading…" : "Load older records"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
