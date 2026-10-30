import { attendanceClient, attendanceId } from "./client";

export interface AttendanceCalendarEntry {
  id: string;
  date: string;
  dateBs: string | null;
  kind: "HOLIDAY" | "WORKING_DAY";
  name: string;
}

export interface AttendanceCalendar {
  academicYearId: string;
  weeklyOffDays: number[];
  attendanceEditWindowDays: number;
  entries: AttendanceCalendarEntry[];
}

export interface CalendarSettingsInput {
  weeklyOffDays?: number[];
  attendanceEditWindowDays?: number;
}

export interface CalendarEntryInput {
  kind: "HOLIDAY" | "WORKING_DAY";
  name: string;
  startDate?: string;
  endDate?: string;
  startDateBs?: string;
  endDateBs?: string;
}

export async function getAttendanceCalendar(
  yearId: string,
): Promise<AttendanceCalendar> {
  return attendanceClient().get<AttendanceCalendar>(
    `/academic-years/${attendanceId(yearId)}/calendar`,
  );
}

export async function updateAttendanceCalendar(
  yearId: string,
  input: CalendarSettingsInput,
): Promise<AttendanceCalendar> {
  return attendanceClient().patch<AttendanceCalendar>(
    `/academic-years/${attendanceId(yearId)}/calendar`,
    input,
  );
}

export async function addAttendanceCalendarEntries(
  yearId: string,
  input: CalendarEntryInput,
): Promise<AttendanceCalendarEntry[]> {
  return attendanceClient().post<AttendanceCalendarEntry[]>(
    `/academic-years/${attendanceId(yearId)}/calendar/entries`,
    input,
  );
}

export async function deleteAttendanceCalendarEntry(
  yearId: string,
  entryId: string,
): Promise<{ deleted: true }> {
  return attendanceClient().delete<{ deleted: true }>(
    `/academic-years/${attendanceId(yearId)}/calendar/entries/${attendanceId(entryId)}`,
  );
}

export async function convertAttendanceDate(
  input: { ad: string } | { bs: string },
): Promise<{ ad: string; bs: string | null }> {
  const query = new URLSearchParams(input).toString();
  return attendanceClient().get<{ ad: string; bs: string | null }>(
    `/dates/convert?${query}`,
  );
}
