export interface FinePolicyInput {
  type: 'FIXED' | 'PERCENT';
  /** FIXED: paisa. PERCENT: hundredths of a percent (2.5% is 250). */
  value: number;
  maxFinePaisa: number | null;
  graceDays: number;
  minOutstandingPaisa: number;
  fineAdmission: boolean;
  /** YYYY-MM-DD. Invoices due before this are never fined. */
  appliesFromDueDate: string;
}

export interface FineSubject {
  kind: 'PERIODIC' | 'ADMISSION' | 'AD_HOC';
  dueDate: string;
  outstandingPaisa: number;
  daysOverdue: number;
}

/** Ad-hoc invoices (including fines themselves) are never fined. */
export function isFinable(inv: FineSubject, policy: FinePolicyInput): boolean {
  if (inv.kind === 'AD_HOC') return false;
  if (inv.kind === 'ADMISSION' && !policy.fineAdmission) return false;
  if (inv.dueDate < policy.appliesFromDueDate) return false;
  if (inv.daysOverdue <= policy.graceDays) return false;
  return (
    inv.outstandingPaisa > 0 &&
    inv.outstandingPaisa >= policy.minOutstandingPaisa
  );
}

/** The fine in whole paisa. A percentage is of the unpaid amount, rounded half up, and capped by maxFine. */
export function fineFor(
  policy: FinePolicyInput,
  outstandingPaisa: number,
): number {
  const raw =
    policy.type === 'FIXED'
      ? policy.value
      : Math.floor((2 * outstandingPaisa * policy.value + 10_000) / 20_000);
  const capped =
    policy.maxFinePaisa === null ? raw : Math.min(raw, policy.maxFinePaisa);
  return Math.max(0, Math.min(capped, 10_000_000_000));
}
