import { attendanceClient, attendanceId } from "./client";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

export interface AttendanceRosterStudent {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
  status: AttendanceStatus | null;
  note: string | null;
}

export interface AttendanceRoster {
  academicYearId: string;
  sectionId: string;
  date: string;
  dateBs: string | null;
  isSchoolDay: boolean;
  nonSchoolReason: string | null;
  session: { id: string; takenAt: string; takenByName: string | null } | null;
  editableByMe: boolean;
  editWindowDays: number;
  students: AttendanceRosterStudent[];
}

export interface AttendanceRecordInput {
  enrollmentId: string;
  status: AttendanceStatus;
  note?: string;
}

export interface ChangeAttendanceInput {
  status?: AttendanceStatus;
  note?: string;
  reason?: string;
}

export async function getAttendanceRoster(
  yearId: string,
  sectionId: string,
  date: string,
): Promise<AttendanceRoster> {
  return attendanceClient().get<AttendanceRoster>(
    `/academic-years/${attendanceId(yearId)}/sections/${attendanceId(sectionId)}/attendance/${date}`,
  );
}

export async function submitAttendance(
  yearId: string,
  sectionId: string,
  date: string,
  records: AttendanceRecordInput[],
  reason?: string,
): Promise<AttendanceRoster> {
  return attendanceClient().put<AttendanceRoster>(
    `/academic-years/${attendanceId(yearId)}/sections/${attendanceId(sectionId)}/attendance/${date}`,
    { records, ...(reason ? { reason } : {}) },
  );
}

export async function changeAttendanceRecord(
  yearId: string,
  sectionId: string,
  date: string,
  enrollmentId: string,
  input: ChangeAttendanceInput,
): Promise<unknown> {
  return attendanceClient().patch<unknown>(
    `/academic-years/${attendanceId(yearId)}/sections/${attendanceId(sectionId)}/attendance/${date}/records/${attendanceId(enrollmentId)}`,
    input,
  );
}
