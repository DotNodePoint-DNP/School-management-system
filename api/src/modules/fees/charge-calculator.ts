export interface ChargeLineInput {
  feeHeadId: string;
  code: string;
  source: 'STRUCTURE' | 'ASSIGNMENT';
  amountPaisa: number;
}

export interface DiscountInput {
  id: string;
  type: 'PERCENT' | 'FIXED_OFF' | 'PRICE_OVERRIDE';
  /** PERCENT: hundredths of a percent (12.5% = 1250). FIXED_OFF and PRICE_OVERRIDE: paisa. */
  value: number;
  /** null: applies to the whole invoice. */
  feeHeadId: string | null;
  /** Ties between equally good discounts go to the earlier one. */
  createdAt: number;
}

export interface ChargedLine {
  feeHeadId: string;
  code: string;
  source: 'STRUCTURE' | 'ASSIGNMENT';
  grossPaisa: number;
  lineDiscountPaisa: number;
  lineDiscountId: string | null;
  /** This line's share of the invoice-level discount. */
  invoiceDiscountPaisa: number;
  netPaisa: number;
}

export interface ChargeResult {
  lines: ChargedLine[];
  invoiceDiscountId: string | null;
  grossPaisa: number;
  lineDiscountsPaisa: number;
  invoiceDiscountPaisa: number;
  netPaisa: number;
}

/** Round half up for positive integers. */
const halfUp = (numerator: number, denominator: number): number =>
  Math.floor((2 * numerator + denominator) / (2 * denominator));

/** How much one discount takes off an amount. Never more than the amount, never negative, never an increase. */
export function reductionFor(
  discount: DiscountInput,
  amountPaisa: number,
): number {
  const raw =
    discount.type === 'PERCENT'
      ? halfUp(amountPaisa * discount.value, 10_000)
      : discount.type === 'FIXED_OFF'
        ? discount.value
        : amountPaisa - discount.value;
  return Math.max(0, Math.min(amountPaisa, raw));
}

/** The single discount that reduces the amount most; ties go to the earlier one, then to the lower id. */
function best(
  discounts: DiscountInput[],
  amountPaisa: number,
): { discount: DiscountInput; reduction: number } | null {
  let winner: { discount: DiscountInput; reduction: number } | null = null;
  for (const discount of discounts) {
    const reduction = reductionFor(discount, amountPaisa);
    if (reduction <= 0) continue;
    const better =
      !winner ||
      reduction > winner.reduction ||
      (reduction === winner.reduction &&
        (discount.createdAt < winner.discount.createdAt ||
          (discount.createdAt === winner.discount.createdAt &&
            discount.id < winner.discount.id)));
    if (better) winner = { discount, reduction };
  }
  return winner;
}

/** Splits `total` across lines in proportion to `weights`, exactly: the parts always add up to `total`. */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const T = BigInt(total);
  const S = BigInt(sum);
  const base = weights.map((w) => (T * BigInt(w)) / S);
  const remainder = weights.map((w) => (T * BigInt(w)) % S);
  const leftover = Number(T - base.reduce((a, b) => a + b, 0n));
  // Leftover paisa go to the lines with the largest remainders (ties: earlier line).
  const order = weights
    .map((_, i) => i)
    .sort((a, b) =>
      remainder[b] === remainder[a]
        ? a - b
        : (remainder[b] as bigint) > (remainder[a] as bigint)
          ? 1
          : -1,
    );
  const parts = base.map(Number);
  for (let k = 0; k < leftover; k++)
    parts[order[k] as number] = (parts[order[k] as number] as number) + 1;
  return parts;
}

/**
 * One invoice's worth of charges. Pass only discounts that are approved and apply to this invoice.
 * Each line takes its single best discount; then the single best invoice-level discount applies to what remains.
 */
export function calculateCharges(
  lines: ChargeLineInput[],
  discounts: DiscountInput[],
): ChargeResult {
  const afterLine = lines.map((line) => {
    const pick = best(
      discounts.filter((d) => d.feeHeadId === line.feeHeadId),
      line.amountPaisa,
    );
    return {
      line,
      lineDiscountPaisa: pick?.reduction ?? 0,
      lineDiscountId: pick?.discount.id ?? null,
    };
  });
  const remaining = afterLine.map(
    (l) => l.line.amountPaisa - l.lineDiscountPaisa,
  );
  const subtotal = remaining.reduce((a, b) => a + b, 0);
  const invoicePick = best(
    discounts.filter(
      (d) => d.feeHeadId === null && d.type !== 'PRICE_OVERRIDE',
    ),
    subtotal,
  );
  const shares = distribute(invoicePick?.reduction ?? 0, remaining);

  const result: ChargedLine[] = afterLine.map((l, i) => ({
    feeHeadId: l.line.feeHeadId,
    code: l.line.code,
    source: l.line.source,
    grossPaisa: l.line.amountPaisa,
    lineDiscountPaisa: l.lineDiscountPaisa,
    lineDiscountId: l.lineDiscountId,
    invoiceDiscountPaisa: shares[i] as number,
    netPaisa: (remaining[i] as number) - (shares[i] as number),
  }));
  const sum = (pick: (l: ChargedLine) => number): number =>
    result.reduce((n, l) => n + pick(l), 0);
  return {
    lines: result,
    invoiceDiscountId:
      invoicePick && invoicePick.reduction > 0 ? invoicePick.discount.id : null,
    grossPaisa: sum((l) => l.grossPaisa),
    lineDiscountsPaisa: sum((l) => l.lineDiscountPaisa),
    invoiceDiscountPaisa: sum((l) => l.invoiceDiscountPaisa),
    netPaisa: sum((l) => l.netPaisa),
  };
}
