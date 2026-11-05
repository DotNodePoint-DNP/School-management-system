import { Injectable } from '@nestjs/common';
import { toPaisa } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Db = Pick<Prisma.TransactionClient, 'invoice' | 'invoiceAdjustment'>;

export interface Balance {
  netPaisa: number;
  /** Approved credit notes. */
  adjustedPaisa: number;
  /** Payments applied to this invoice. Always 0 until payments are built. */
  paidPaisa: number;
  /** 0 for a voided invoice. */
  outstandingPaisa: number;
  voided: boolean;
}

export type InvoiceStatus = 'VOID' | 'SETTLED' | 'PAID' | 'PARTIAL' | 'OPEN';

/** SETTLED: nothing owed because of credit notes. PAID: nothing owed because of payments. */
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

  async load(
    ids: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, Balance>> {
    const out = new Map<string, Balance>();
    if (ids.length === 0) return out;
    const [invoices, adjustments] = await Promise.all([
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
    ]);
    const adjusted = new Map<string, number>();
    for (const a of adjustments)
      adjusted.set(
        a.invoiceId,
        (adjusted.get(a.invoiceId) ?? 0) + toPaisa(a.amount.toNumber()),
      );
    // 7C: sum the payments applied to each invoice here, and subtract them from `outstandingPaisa`.
    for (const inv of invoices) {
      const net = toPaisa(inv.netAmount.toNumber());
      const adj = adjusted.get(inv.id) ?? 0;
      const voided = inv.void !== null;
      out.set(inv.id, {
        netPaisa: net,
        adjustedPaisa: adj,
        paidPaisa: 0,
        outstandingPaisa: voided ? 0 : net - adj,
        voided,
      });
    }
    return out;
  }
}
