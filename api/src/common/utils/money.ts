/** Amounts are validated to at most 2 decimals, so this is exact. All arithmetic is done in whole paisa. */
export const toPaisa = (rupees: number): number => Math.round(rupees * 100);
export const fromPaisa = (paisa: number): number => Math.round(paisa) / 100;

/** paisa x (1 + percent/100), rounded half-up to a whole paisa. `percent` may have 2 decimals and may be negative. */
export function increaseByPercent(paisa: number, percent: number): number {
  const hundredths = Math.round(percent * 100);
  return Math.round((paisa * (10_000 + hundredths)) / 10_000);
}

/** "NPR 1,23,456" with lakh grouping. Paisa appear only when there are some. */
export function formatNpr(paisa: number): string {
  const rupees = String(Math.floor(paisa / 100));
  const rest = paisa % 100;
  const last3 = rupees.slice(-3);
  const other = rupees.slice(0, -3);
  const grouped = other
    ? `${other.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`
    : last3;
  return `NPR ${grouped}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}
