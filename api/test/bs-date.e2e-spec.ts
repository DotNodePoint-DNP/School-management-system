import { describe, expect, it } from 'vitest';
import {
  MAX_SUPPORTED_BS_YEAR,
  adToBsString,
  bsToIso,
  parseIsoDate,
  resolveDate,
} from '../src/common/utils/bs-date.js';

// [BS, AD]. First pair: bikram-sambat-ts README (checked against go-bs).
// The other two: output/docs of nepkit, a separate library.
const ANCHORS = [
  ['2083-06-06', '2026-09-22'],
  ['2083-04-27', '2026-08-12'],
  ['2081-04-15', '2024-07-30'],
] as const;

describe('BS/AD conversion', () => {
  it.each(ANCHORS)('BS %s is AD %s in both directions', (bs, ad) => {
    expect(bsToIso(bs, 'date')).toBe(ad);
    expect(adToBsString(ad)).toBe(bs);
  });

  it('round-trips every day from April 2026 to April 2027', () => {
    for (let t = Date.UTC(2026, 3, 1); t <= Date.UTC(2027, 3, 30); t += 86_400_000) {
      const ad = new Date(t).toISOString().slice(0, 10);
      const bs = adToBsString(ad);
      expect(bs, ad).not.toBeNull();
      expect(bsToIso(bs as string, 'date')).toBe(ad);
    }
  });

  it('rejects impossible or badly formatted BS dates', () => {
    for (const bad of ['2083-13-01', '2083-02-32', '2083-6-6', 'not-a-date']) {
      expect(() => bsToIso(bad, 'startDateBs'), bad).toThrow();
    }
  });

  it('rejects BS years outside the supported range', () => {
    expect(() => bsToIso(`${MAX_SUPPORTED_BS_YEAR + 1}-01-01`, 'startDateBs')).toThrow(/supported/);
    expect(() => bsToIso('1999-01-01', 'startDateBs')).toThrow(/supported/);
  });

  it('returns null BS for dates beyond the supported range', () => {
    expect(adToBsString('2061-04-01')).toBeNull();
  });

  it('rejects AD dates that do not exist', () => {
    expect(() => parseIsoDate('2061-02-30', 'startDate')).toThrow();
    expect(() => parseIsoDate('2061-13-01', 'startDate')).toThrow();
  });

  it('rejects sending both AD and BS for the same field', () => {
    expect(() => resolveDate('startDate', '2026-09-22', '2083-06-06')).toThrow(/not both/);
  });
});