import { describe, expect, it } from 'vitest';
import { formatNpr } from '../src/common/utils/money.js';
import { mapPool } from '../src/common/utils/pool.js';
import {
  reminderSubject,
  reminderText,
} from '../src/modules/fees/reminder-text.js';

describe('formatNpr', () => {
  it('uses lakh and crore grouping, with paisa only when present', () => {
    expect(formatNpr(0)).toBe('NPR 0');
    expect(formatNpr(10_000)).toBe('NPR 100');
    expect(formatNpr(99_900)).toBe('NPR 999');
    expect(formatNpr(100_000)).toBe('NPR 1,000');
    expect(formatNpr(500_000)).toBe('NPR 5,000');
    expect(formatNpr(1_000_000)).toBe('NPR 10,000');
    expect(formatNpr(10_000_000)).toBe('NPR 1,00,000');
    expect(formatNpr(12_345_600)).toBe('NPR 1,23,456');
    expect(formatNpr(123_456_789)).toBe('NPR 12,34,567.89');
    expect(formatNpr(1_000_000_000)).toBe('NPR 1,00,00,000');
    expect(formatNpr(5)).toBe('NPR 0.05');
    expect(formatNpr(250_050)).toBe('NPR 2,500.50');
  });
});

describe('reminder text', () => {
  const tail = 'Overdue since 2082-01-10. Please pay at the school office.';

  it('names one child and the amount', () => {
    expect(
      reminderText(
        'Sunrise School',
        [{ firstName: 'Anil', paisa: 500_000 }],
        '2082-01-10',
      ),
    ).toBe(`Sunrise School: Fee reminder. Anil owes NPR 5,000. ${tail}`);
  });

  it('lists siblings with a total', () => {
    expect(
      reminderText(
        'Sunrise School',
        [
          { firstName: 'Anil', paisa: 500_000 },
          { firstName: 'Sita', paisa: 300_000 },
        ],
        '2082-01-10',
      ),
    ).toBe(
      `Sunrise School: Fee reminder. Anil NPR 5,000; Sita NPR 3,000. Total NPR 8,000. ${tail}`,
    );
  });

  it('shows three children and counts the rest, with the total of all of them', () => {
    const kids = [100_000, 200_000, 300_000, 400_000, 500_000].map(
      (paisa, i) => ({ firstName: `Kid${i + 1}`, paisa }),
    );
    expect(reminderText('Sunrise School', kids, '2082-01-10')).toBe(
      `Sunrise School: Fee reminder. Kid1 NPR 1,000; Kid2 NPR 2,000; Kid3 NPR 3,000 and 2 more. Total NPR 15,000. ${tail}`,
    );
  });

  it('cuts long names, and stays short enough for a normal SMS in the worst case', () => {
    const text = reminderText(
      'A'.repeat(80),
      ['B', 'C', 'D', 'E'].map((c) => ({
        firstName: c.repeat(40),
        paisa: 12_345_678_99,
      })),
      '2082-01-10',
    );
    expect(text.startsWith(`${'A'.repeat(39)}.: Fee reminder.`)).toBe(true);
    expect(text).toContain(`${'B'.repeat(19)}. NPR`);
    expect(text).not.toContain('B'.repeat(21));
    expect(text.length).toBeLessThanOrEqual(320);
    expect(reminderSubject('S'.repeat(80))).toBe(
      `${'S'.repeat(49)}.: fee reminder`,
    );
  });

  it('only ever contains first names, amounts and the date', () => {
    const text = reminderText(
      'Sunrise School',
      [{ firstName: 'Anil', paisa: 500_000 }],
      '2082-01-10',
    );
    expect(text).not.toMatch(/ADM-|@|\+977/);
  });
});

describe('mapPool', () => {
  it('keeps the order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapPool([30, 5, 20, 1, 10, 15], 2, async (ms) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running -= 1;
      return ms * 2;
    });
    expect(result).toEqual([60, 10, 40, 2, 20, 30]);
    expect(peak).toBe(2);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapPool([], 5, async (x: number) => x)).toEqual([]);
    expect(await mapPool([1, 2], 10, async (x) => x + 1)).toEqual([2, 3]);
  });
});
