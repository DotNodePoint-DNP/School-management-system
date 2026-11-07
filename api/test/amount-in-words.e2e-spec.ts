import { describe, expect, it } from 'vitest';
import { amountInWords } from '../src/common/utils/amount-in-words.js';

describe('amount in words', () => {
  it('writes rupees with lakh and crore grouping', () => {
    expect(amountInWords(500_000)).toBe('Rupees Five Thousand Only');
    expect(amountInWords(10_000_000)).toBe('Rupees One Lakh Only');
    expect(amountInWords(1_000_000_000)).toBe('Rupees One Crore Only');
    expect(amountInWords(100)).toBe('Rupees One Only');
    expect(amountInWords(1_900)).toBe('Rupees Nineteen Only');
    expect(amountInWords(2_100)).toBe('Rupees Twenty One Only');
    expect(amountInWords(12_000)).toBe('Rupees One Hundred Twenty Only');
    expect(amountInWords(1_234_567_890)).toBe(
      'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Paisa Only',
    );
  });

  it('writes paisa', () => {
    expect(amountInWords(125_050)).toBe(
      'Rupees One Thousand Two Hundred Fifty and Fifty Paisa Only',
    );
    expect(amountInWords(1_333_333)).toBe(
      'Rupees Thirteen Thousand Three Hundred Thirty Three and Thirty Three Paisa Only',
    );
    expect(amountInWords(50)).toBe('Fifty Paisa Only');
    expect(amountInWords(5)).toBe('Five Paisa Only');
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });

  it('refuses absurdly large amounts', () => {
    expect(() => amountInWords(100_000_000_000)).toThrow(RangeError);
  });
});
