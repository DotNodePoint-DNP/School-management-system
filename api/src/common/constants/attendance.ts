export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'LEAVE',
] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];

/** Counted as attended for percentages. ABSENT and LEAVE are reported separately, as not attended. */
export const ATTENDED_STATUSES: readonly AttendanceStatusValue[] = [
  'PRESENT',
  'LATE',
];
