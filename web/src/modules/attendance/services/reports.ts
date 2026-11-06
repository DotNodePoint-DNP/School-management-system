import { attendanceClient, attendanceId, attendanceQuery } from "./client";
import type { AttendanceStatus } from "./attendance";

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  LEAVE: number;
}

export interface AttendanceSummary {
  counts: AttendanceCounts;
  daysRecorded: number;
  attended: number;
  percentage: number | null;
}

export interface SectionAttendanceStudent extends AttendanceSummary {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  rollNo: number | null;
}

export interface SectionAttendanceDay extends AttendanceSummary {
  date: string;
  dateBs: string | null;
}

export interface SectionAttendanceSummary {
  academicYearId: string;
  sectionId: string;
  from: string;
  to: string;
  daysTaken: number;
  students: SectionAttendanceStudent[];
  days: SectionAttendanceDay[];
}

export interface AttendanceRange {
  from?: string;
  to?: string;
  fromBs?: string;
  toBs?: string;
}

export interface StudentAttendanceHistoryItem {
  date: string;
  dateBs: string | null;
  status: AttendanceStatus;
  note: string | null;
  source: string;
  className: string;
  sectionName: string;
}

export interface CursorPage<T> {
  items: T[];
  meta: { limit: number; nextCursor: string | null };
}

export interface PendingAttendance {
  date: string;
  academicYearId: string | null;
  isSchoolDay: boolean;
  nonSchoolReason: string | null;
  sections: {
    sectionId: string;
    sectionName: string;
    classId: string;
    className: string;
    enrolled: number;
    classTeacher: { id: string; name: string } | null;
  }[];
}

export interface AttendanceChange {
  id: string;
  date: string;
  dateBs: string | null;
  changedAt: string;
  changedByName: string | null;
  studentId: string | null;
  admissionNo: string | null;
  studentName: string | null;
  fromStatus: AttendanceStatus | null;
  toStatus: AttendanceStatus;
  reason: string | null;
  withinWindow: boolean;
}

export async function getSectionAttendanceSummary(
  yearId: string,
  sectionId: string,
  range: AttendanceRange = {},
): Promise<SectionAttendanceSummary> {
  return attendanceClient().get<SectionAttendanceSummary>(
    `/academic-years/${attendanceId(yearId)}/sections/${attendanceId(sectionId)}/attendance-summary${attendanceQuery(range)}`,
  );
}

export async function getStudentAttendanceHistory(
  studentId: string,
  options: AttendanceRange & { limit?: number; cursor?: string } = {},
): Promise<CursorPage<StudentAttendanceHistoryItem>> {
  return attendanceClient().get<CursorPage<StudentAttendanceHistoryItem>>(
    `/students/${attendanceId(studentId)}/attendance${attendanceQuery(options)}`,
  );
}

export async function getStudentAttendanceSummary(
  studentId: string,
  range: AttendanceRange = {},
): Promise<AttendanceSummary> {
  return attendanceClient().get<AttendanceSummary>(
    `/students/${attendanceId(studentId)}/attendance/summary${attendanceQuery(range)}`,
  );
}

export async function getPendingAttendance(
  date?: string,
): Promise<PendingAttendance> {
  return attendanceClient().get<PendingAttendance>(
    `/attendance/pending${attendanceQuery({ date })}`,
  );
}

export async function getAttendanceChanges(options: {
  studentId?: string;
  sectionId?: string;
  date?: string;
  limit?: number;
  cursor?: string;
} = {}): Promise<CursorPage<AttendanceChange>> {
  return attendanceClient().get<CursorPage<AttendanceChange>>(
    `/attendance/changes${attendanceQuery(options)}`,
  );
}
