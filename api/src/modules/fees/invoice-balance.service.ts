import { Injectable } from '@nestjs/common';
import { toPaisa } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Db = Pick<
  Prisma.TransactionClient,
  'invoice' | 'invoiceAdjustment' | 'paymentAllocation'
>;

export interface Balance {
  netPaisa: number;
  /** Approved credit notes. */
  adjustedPaisa: number;
  /** Payments applied to this invoice, not counting reversed payments. */
  paidPaisa: number;
  /** 0 for a voided invoice. */
  outstandingPaisa: number;
  voided: boolean;
}

export type InvoiceStatus = 'VOID' | 'SETTLED' | 'PAID' | 'PARTIAL' | 'OPEN';

/** SETTLED: nothing owed because of credit notes alone. PAID: nothing owed, and payments were made. */
export function invoiceStatus(
  b: Balance,
  dueDate: string,
  today: string,
): { status: InvoiceStatus; overdue: boolean } {
  if (b.voided) return { status: 'VOID', overdue: false };
  if (b.outstandingPaisa === 0)
    return { status: b.paidPaisa > 0 ? 'PAID' : 'SETTLED', overdue: false };
  return {
    status: b.paidPaisa > 0 ? 'PARTIAL' : 'OPEN',
    overdue: dueDate < today,
  };
}

@Injectable()
export class InvoiceBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The one place that defines how much is still owed on an invoice. */
  async load(
    ids: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, Balance>> {
    const out = new Map<string, Balance>();
    if (ids.length === 0) return out;
    const [invoices, adjustments, allocations] = await Promise.all([
      db.invoice.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          netAmount: true,
          void: { select: { invoiceId: true } },
        },
      }),
      db.invoiceAdjustment.findMany({
        where: { invoiceId: { in: ids }, decision: { approved: true } },
        select: { invoiceId: true, amount: true },
      }),
      db.paymentAllocation.findMany({
        where: { invoiceId: { in: ids }, payment: { reversal: { is: null } } },
        select: { invoiceId: true, amount: true },
      }),
    ]);
    const sum = (
      rows: { invoiceId: string; amount: { toNumber(): number } }[],
    ): Map<string, number> => {
      const map = new Map<string, number>();
      for (const r of rows)
        map.set(
          r.invoiceId,
          (map.get(r.invoiceId) ?? 0) + toPaisa(r.amount.toNumber()),
        );
      return map;
    };
    const adjusted = sum(adjustments);
    const paid = sum(allocations);
    for (const inv of invoices) {
      const net = toPaisa(inv.netAmount.toNumber());
      const adj = adjusted.get(inv.id) ?? 0;
      const pay = paid.get(inv.id) ?? 0;
      const voided = inv.void !== null;
      out.set(inv.id, {
        netPaisa: net,
        adjustedPaisa: adj,
        paidPaisa: pay,
        outstandingPaisa: voided ? 0 : net - adj - pay,
        voided,
      });
    }
    return out;
  }
}
