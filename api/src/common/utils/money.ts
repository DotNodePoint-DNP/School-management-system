/** Amounts are validated to at most 2 decimals, so this is exact. All arithmetic is done in whole paisa. */
export const toPaisa = (rupees: number): number => Math.round(rupees * 100);
export const fromPaisa = (paisa: number): number => Math.round(paisa) / 100;

/** paisa x (1 + percent/100), rounded half-up to a whole paisa. `percent` may have 2 decimals and may be negative. */
export function increaseByPercent(paisa: number, percent: number): number {
  const hundredths = Math.round(percent * 100);
  return Math.round((paisa * (10_000 + hundredths)) / 10_000);
}
