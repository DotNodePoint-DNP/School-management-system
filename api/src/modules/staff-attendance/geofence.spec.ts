import { describe, expect, it } from 'vitest';
import { verifyPosition } from './geofence.js';

const school = { latitude: 27.7, longitude: 85.3, radius: 90 };
const fix = {
  ...school,
  kind: 'IN' as const,
  workDate: '2026-11-25',
  accuracy: 10,
  capturedAt: 500000,
};
describe('staff campus geofence', () => {
  it('accepts a fresh position inside the configured area', () => {
    expect(verifyPosition(school, fix, fix.capturedAt)).toBe(0);
  });
  it('distinguishes an uncertain boundary from a clearly outside reading', () => {
    expect(() =>
      verifyPosition(school, { ...fix, latitude: 27.7008 }, fix.capturedAt),
    ).toThrow('uncertain');
    expect(() =>
      verifyPosition(school, { ...fix, latitude: 27.71 }, fix.capturedAt),
    ).toThrow('Outside');
  });
  it('rejects stale, future and imprecise readings', () => {
    expect(() => verifyPosition(school, fix, fix.capturedAt + 60001)).toThrow(
      'expired',
    );
    expect(() => verifyPosition(school, fix, fix.capturedAt - 6000)).toThrow(
      'expired',
    );
    expect(() =>
      verifyPosition(
        { ...school, radius: 500 },
        { ...fix, accuracy: 150 },
        fix.capturedAt,
      ),
    ).toThrow('uncertain');
  });
});
