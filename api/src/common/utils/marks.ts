/** `percent`% of `full`, rounded UP to 2 decimals so a pass mark is never below its threshold. */
export function percentOf(full: number, percent: number): number {
  return Math.ceil((Math.round(full * 100) * percent) / 100 - 1e-9) / 100;
}
