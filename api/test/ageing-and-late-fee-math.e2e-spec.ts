import { describe, expect, it } from 'vitest';
import { ageingKey, daysPast } from '../src/modules/fees/ageing.js';
import {
  fineFor,
  isFinable,
  type FinePolicyInput,
} from '../src/modules/fees/late-fee-calculator.js';

const policy = (over: Partial<FinePolicyInput> = {}): FinePolicyInput => ({
  type: 'FIXED',
  value: 20_000,
  maxFinePaisa: null,
  graceDays: 5,
  minOutstandingPaisa: 10_000,
  fineAdmission: false,
  appliesFromDueDate: '2026-01-01',
  ...over,
});
const inv = (over: object = {}) => ({
  kind: 'PERIODIC' as const,
  dueDate: '2026-02-01',
  outstandingPaisa: 500_000,
  daysOverdue: 10,
  ...over,
});

describe('ageing buckets', () => {
  it('puts days past the due date in the right bucket', () => {
    expect([-5, 0].map(ageingKey)).toEqual(['CURRENT', 'CURRENT']);
    expect([1, 30].map(ageingKey)).toEqual(['D1_30', 'D1_30']);
    expect([31, 60].map(ageingKey)).toEqual(['D31_60', 'D31_60']);
    expect([61, 90].map(ageingKey)).toEqual(['D61_90', 'D61_90']);
    expect([91, 400].map(ageingKey)).toEqual(['D90_PLUS', 'D90_PLUS']);
  });

  it('counts whole days between two dates', () => {
    expect(daysPast('2026-03-01', '2026-03-11')).toBe(10);
    expect(daysPast('2026-03-11', '2026-03-01')).toBe(-10);
    expect(daysPast('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysPast('2026-03-01', '2026-03-01')).toBe(0);
  });
});

describe('late fines', () => {
  it('fines only regular invoices that are overdue, big enough and recent enough', () => {
    expect(isFinable(inv(), policy())).toBe(true);
    expect(isFinable(inv({ kind: 'AD_HOC' }), policy())).toBe(false); // ad-hoc invoices and fines are never fined
    expect(isFinable(inv({ kind: 'ADMISSION' }), policy())).toBe(false);
    expect(
      isFinable(inv({ kind: 'ADMISSION' }), policy({ fineAdmission: true })),
    ).toBe(true);
    expect(isFinable(inv({ daysOverdue: 5 }), policy())).toBe(false); // inside the grace period
    expect(isFinable(inv({ daysOverdue: 6 }), policy())).toBe(true); // the day after
    expect(isFinable(inv({ dueDate: '2025-12-31' }), policy())).toBe(false); // due before the policy applies
    expect(isFinable(inv({ dueDate: '2026-01-01' }), policy())).toBe(true);
    expect(isFinable(inv({ outstandingPaisa: 9_999 }), policy())).toBe(false);
    expect(isFinable(inv({ outstandingPaisa: 10_000 }), policy())).toBe(true);
    expect(
      isFinable(
        inv({ outstandingPaisa: 0 }),
        policy({ minOutstandingPaisa: 0 }),
      ),
    ).toBe(false); // nothing owed, nothing to fine
  });

  it('charges a fixed fine, or a percentage of what is unpaid, rounded half up', () => {
    expect(fineFor(policy(), 123_456)).toBe(20_000);
    const pct = (p: number, max: number | null = null) =>
      policy({ type: 'PERCENT', value: p, maxFinePaisa: max });
    expect(fineFor(pct(250), 250_000)).toBe(6_250); // 2.5% of 2,500.00
    expect(fineFor(pct(250), 1_999)).toBe(50); // 49.975 paisa
    expect(fineFor(pct(250), 20)).toBe(1); // exactly half a paisa rounds up
    expect(fineFor(pct(250), 1)).toBe(0); // too small to fine
    expect(fineFor(pct(10_000), 123_456)).toBe(123_456); // 100%
    expect(fineFor(pct(250, 10_000), 500_000)).toBe(10_000); // capped
    expect(fineFor(policy({ maxFinePaisa: 5_000 }), 500_000)).toBe(5_000); // a fixed fine is capped too
  });
});
