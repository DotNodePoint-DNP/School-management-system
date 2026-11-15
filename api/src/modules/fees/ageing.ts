export const AGEING_BUCKETS = [
  { key: 'CURRENT', label: 'Not yet due' },
  { key: 'D1_30', label: '1-30 days overdue' },
  { key: 'D31_60', label: '31-60 days overdue' },
  { key: 'D61_90', label: '61-90 days overdue' },
  { key: 'D90_PLUS', label: 'Over 90 days overdue' },
] as const;
export type AgeingKey = (typeof AGEING_BUCKETS)[number]['key'];

/** Days past the due date (zero or negative: not overdue). */
export function ageingKey(daysOverdue: number): AgeingKey {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'D1_30';
  if (daysOverdue <= 60) return 'D31_60';
  if (daysOverdue <= 90) return 'D61_90';
  return 'D90_PLUS';
}

export function daysPast(dueIso: string, todayIso: string): number {
  return Math.round(
    (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dueIso}T00:00:00Z`)) /
      86_400_000,
  );
}
