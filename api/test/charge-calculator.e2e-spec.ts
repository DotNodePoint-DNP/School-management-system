import { describe, expect, it } from 'vitest';
import {
  calculateCharges,
  distribute,
  reductionFor,
  type ChargeLineInput,
  type DiscountInput,
} from '../src/modules/fees/charge-calculator.js';

const line = (feeHeadId: string, rupees: number): ChargeLineInput => ({
  feeHeadId,
  code: feeHeadId.toUpperCase(),
  source: 'STRUCTURE',
  amountPaisa: Math.round(rupees * 100),
});
const pct = (
  id: string,
  percent: number,
  feeHeadId: string | null,
  createdAt = 1,
): DiscountInput => ({
  id,
  type: 'PERCENT',
  value: Math.round(percent * 100),
  feeHeadId,
  createdAt,
});
const off = (
  id: string,
  rupees: number,
  feeHeadId: string | null,
  createdAt = 1,
): DiscountInput => ({
  id,
  type: 'FIXED_OFF',
  value: Math.round(rupees * 100),
  feeHeadId,
  createdAt,
});
const price = (
  id: string,
  rupees: number,
  feeHeadId: string,
  createdAt = 1,
): DiscountInput => ({
  id,
  type: 'PRICE_OVERRIDE',
  value: Math.round(rupees * 100),
  feeHeadId,
  createdAt,
});
const rupees = (paisa: number): number => paisa / 100;

describe('charge calculation', () => {
  it('charges the full amount when there are no discounts', () => {
    const r = calculateCharges([line('tui', 5000), line('exm', 1000)], []);
    expect(r).toMatchObject({
      grossPaisa: 600_000,
      lineDiscountsPaisa: 0,
      invoiceDiscountPaisa: 0,
      netPaisa: 600_000,
      invoiceDiscountId: null,
    });
    expect(calculateCharges([], [pct('d', 10, null)])).toMatchObject({
      lines: [],
      grossPaisa: 0,
      netPaisa: 0,
    });
  });

  it('applies a percentage to one head only', () => {
    const r = calculateCharges(
      [line('tui', 5000), line('exm', 1000)],
      [pct('d1', 10, 'tui')],
    );
    expect(
      r.lines.map((l) => [
        l.feeHeadId,
        rupees(l.lineDiscountPaisa),
        rupees(l.netPaisa),
        l.lineDiscountId,
      ]),
    ).toEqual([
      ['tui', 500, 4500, 'd1'],
      ['exm', 0, 1000, null],
    ]);
  });

  it('rounds percentages half-up to the paisa', () => {
    expect(reductionFor(pct('d', 12.5, 'x'), 3333)).toBe(417); // 33.33 x 12.5% = 4.16625 rupees
    expect(reductionFor(pct('d', 12.5, 'x'), 3332)).toBe(417); // 4.165 rounds up
    expect(reductionFor(pct('d', 0.01, 'x'), 4999)).toBe(0); // under half a paisa
    expect(reductionFor(pct('d', 100, 'x'), 12345)).toBe(12345);
  });

  it('gives each line only its single best discount, and breaks ties by age', () => {
    const r = calculateCharges(
      [line('tui', 5000)],
      [
        pct('ten', 10, 'tui'),
        off('seven', 700, 'tui'),
        price('override', 4200, 'tui'),
      ],
    );
    expect(r.lines[0]).toMatchObject({
      lineDiscountPaisa: 80_000,
      lineDiscountId: 'override',
      netPaisa: 420_000,
    }); // 800 off beats 500 and 700
    const tie = calculateCharges(
      [line('tui', 5000)],
      [off('later', 500, 'tui', 20), off('earlier', 500, 'tui', 10)],
    );
    expect(tie.lines[0]?.lineDiscountId).toBe('earlier');
    const sameAge = calculateCharges(
      [line('tui', 5000)],
      [off('b', 500, 'tui', 5), off('a', 500, 'tui', 5)],
    );
    expect(sameAge.lines[0]?.lineDiscountId).toBe('a');
  });

  it('never raises a price, and ignores discounts for heads that are not charged', () => {
    const above = calculateCharges(
      [line('tui', 5000)],
      [price('p', 6000, 'tui')],
    );
    expect(above.lines[0]).toMatchObject({
      lineDiscountPaisa: 0,
      lineDiscountId: null,
      netPaisa: 500_000,
    });
    expect(
      calculateCharges([line('tui', 5000)], [pct('other', 50, 'exm')]).netPaisa,
    ).toBe(500_000);
    expect(
      calculateCharges([line('tui', 5000)], [price('free', 0, 'tui')]).netPaisa,
    ).toBe(0); // price 0 means free
  });

  it('spreads an invoice-level discount across the lines exactly, to the paisa', () => {
    const r = calculateCharges(
      [line('tui', 5000), line('exm', 1000)],
      [pct('d1', 10, 'tui'), off('inv', 300, null)],
    );
    // After the line discount: 4500 and 1000. 300 split in that proportion, leftover paisa to the larger remainder.
    expect(r.lines.map((l) => l.invoiceDiscountPaisa)).toEqual([24_545, 5_455]);
    expect(r.invoiceDiscountPaisa).toBe(30_000);
    expect(r.invoiceDiscountId).toBe('inv');
    expect(r.netPaisa).toBe(550_000 - 30_000);
    expect(r.lines.map((l) => rupees(l.netPaisa))).toEqual([
      4500 - 245.45,
      1000 - 54.55,
    ]);
  });

  it('applies a percentage invoice discount to what remains after line discounts', () => {
    const r = calculateCharges(
      [line('tui', 5000), line('exm', 1000)],
      [pct('d1', 10, 'tui'), pct('inv', 5, null)],
    );
    expect(r.invoiceDiscountPaisa).toBe(27_500); // 5% of 5500
    expect(r.lines.map((l) => l.invoiceDiscountPaisa)).toEqual([22_500, 5_000]);
    expect(r.netPaisa).toBe(550_000 - 27_500);
  });

  it('stacks one line discount with one invoice discount, but never two on the same line', () => {
    const r = calculateCharges(
      [line('tui', 1000)],
      [
        pct('a', 10, 'tui'),
        pct('b', 20, 'tui'),
        pct('invA', 5, null),
        pct('invB', 6, null),
      ],
    );
    expect(r.lines[0]).toMatchObject({
      lineDiscountId: 'b',
      lineDiscountPaisa: 20_000,
    }); // 20% beats 10%, they do not add
    expect(r.invoiceDiscountId).toBe('invB'); // 6% of 800 beats 5%
    expect(r.invoiceDiscountPaisa).toBe(4_800);
    expect(r.netPaisa).toBe(100_000 - 20_000 - 4_800);
  });

  it('caps discounts at what is owed', () => {
    const r = calculateCharges(
      [line('tui', 500), line('exm', 100)],
      [off('big', 999_999, null)],
    );
    expect(r.invoiceDiscountPaisa).toBe(60_000);
    expect(r.netPaisa).toBe(0);
    expect(r.lines.every((l) => l.netPaisa === 0)).toBe(true);
    expect(
      calculateCharges(
        [line('tui', 500)],
        [pct('all', 100, 'tui'), pct('inv', 50, null)],
      ),
    ).toMatchObject({
      netPaisa: 0,
      invoiceDiscountPaisa: 0,
      invoiceDiscountId: null,
    });
  });

  it('splits amounts exactly', () => {
    expect(distribute(10, [1, 1, 1])).toEqual([4, 3, 3]); // the leftover paisa goes to the first of equal remainders
    expect(distribute(0, [5, 5])).toEqual([0, 0]);
    expect(distribute(7, [0, 0])).toEqual([0, 0]);
    expect(distribute(100, [0, 5, 5])).toEqual([0, 50, 50]);
    expect(distribute(1, [3, 3])).toEqual([1, 0]);
  });

  it('keeps the books exact for any mix of amounts and discounts', () => {
    let seed = 20_260_101;
    const next = (max: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let round = 0; round < 500; round++) {
      const lines = Array.from({ length: 1 + next(5) }, (_, i) => ({
        ...line(`h${i}`, 0),
        amountPaisa: 1 + next(900_000),
      }));
      const discounts: DiscountInput[] = Array.from(
        { length: next(5) },
        (_, i) => {
          const head = next(3) === 0 ? null : `h${next(lines.length)}`;
          const kind = next(3);
          const base = { id: `d${i}`, feeHeadId: head, createdAt: next(100) };
          if (kind === 0)
            return {
              ...base,
              type: 'PERCENT' as const,
              value: 1 + next(10_000),
            };
          if (kind === 1 || head === null)
            return {
              ...base,
              type: 'FIXED_OFF' as const,
              value: 1 + next(800_000),
            };
          return {
            ...base,
            type: 'PRICE_OVERRIDE' as const,
            value: next(900_000),
          };
        },
      );
      const r = calculateCharges(lines, discounts);
      const grossSum = lines.reduce((n, l) => n + l.amountPaisa, 0);
      expect(r.grossPaisa).toBe(grossSum);
      expect(r.netPaisa).toBe(
        r.grossPaisa - r.lineDiscountsPaisa - r.invoiceDiscountPaisa,
      );
      expect(r.lines.reduce((n, l) => n + l.invoiceDiscountPaisa, 0)).toBe(
        r.invoiceDiscountPaisa,
      );
      expect(r.lines.reduce((n, l) => n + l.netPaisa, 0)).toBe(r.netPaisa);
      for (const l of r.lines) {
        expect(l.netPaisa).toBeGreaterThanOrEqual(0);
        expect(
          l.lineDiscountPaisa + l.invoiceDiscountPaisa,
        ).toBeLessThanOrEqual(l.grossPaisa);
      }
    }
  });
});
