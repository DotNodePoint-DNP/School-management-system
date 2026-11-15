import { Injectable } from '@nestjs/common';
import { isoToDate } from '../../common/utils/bs-date.js';
import { toPaisa } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';

type Db = Pick<
  Prisma.TransactionClient,
  'payment' | 'creditRefund' | 'paymentReversal'
>;

export interface CashierFigures {
  cashierId: string;
  cashPaisa: number;
  cashCount: number;
  otherPaisa: number;
  otherCount: number;
}
export interface DayFigures {
  date: string;
  receiptCount: number;
  receivedPaisa: number;
  byMethod: { method: string; count: number; amountPaisa: number }[];
  cashiers: CashierFigures[];
  paidOut: { refundsPaisa: number; reversalsPaisa: number; totalPaisa: number };
  cashReceiptsPaisa: number;
  /** Cash received, less cash paid out. */
  expectedCashPaisa: number;
}

/** The UTC range covering one Nepal calendar day (Nepal is UTC+5:45). */
export function nepalDayRange(iso: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${iso}T00:00:00Z`) - 345 * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

@Injectable()
export class DayFiguresService {
  /**
   * What happened to money on a date. Receipts are those dated that day and not reversed. Cash paid out is cash refunds made that day,
   * plus cash handed back by reversing an earlier day's payment that day (a same-day reversal is already left out of the receipts).
   */
  async compute(db: Db, date: string): Promise<DayFigures> {
    const { start, end } = nepalDayRange(date);
    const [payments, refunds, reversals] = await Promise.all([
      db.payment.findMany({
        where: { paidOn: isoToDate(date), reversal: { is: null } },
        select: { method: true, amount: true, receivedById: true },
      }),
      db.creditRefund.findMany({
        where: { method: 'CASH', createdAt: { gte: start, lt: end } },
        select: { amount: true },
      }),
      db.paymentReversal.findMany({
        where: {
          reversedAt: { gte: start, lt: end },
          payment: { method: 'CASH', paidOn: { lt: isoToDate(date) } },
        },
        select: { payment: { select: { amount: true } } },
      }),
    ]);

    const methods = new Map<string, { count: number; amountPaisa: number }>();
    const cashiers = new Map<string, CashierFigures>();
    for (const p of payments) {
      const paisa = toPaisa(p.amount.toNumber());
      const m = methods.get(p.method) ?? { count: 0, amountPaisa: 0 };
      m.count += 1;
      m.amountPaisa += paisa;
      methods.set(p.method, m);
      const c = cashiers.get(p.receivedById) ?? {
        cashierId: p.receivedById,
        cashPaisa: 0,
        cashCount: 0,
        otherPaisa: 0,
        otherCount: 0,
      };
      if (p.method === 'CASH') {
        c.cashPaisa += paisa;
        c.cashCount += 1;
      } else {
        c.otherPaisa += paisa;
        c.otherCount += 1;
      }
      cashiers.set(p.receivedById, c);
    }
    const refundsPaisa = refunds.reduce(
      (n, r) => n + toPaisa(r.amount.toNumber()),
      0,
    );
    const reversalsPaisa = reversals.reduce(
      (n, r) => n + toPaisa(r.payment.amount.toNumber()),
      0,
    );
    const cashReceiptsPaisa = [...cashiers.values()].reduce(
      (n, c) => n + c.cashPaisa,
      0,
    );
    const paidOutTotal = refundsPaisa + reversalsPaisa;

    return {
      date,
      receiptCount: payments.length,
      receivedPaisa: [...methods.values()].reduce(
        (n, m) => n + m.amountPaisa,
        0,
      ),
      byMethod: [...methods.entries()]
        .map(([method, v]) => ({ method, ...v }))
        .sort(
          (a, b) =>
            b.amountPaisa - a.amountPaisa || a.method.localeCompare(b.method),
        ),
      cashiers: [...cashiers.values()],
      paidOut: { refundsPaisa, reversalsPaisa, totalPaisa: paidOutTotal },
      cashReceiptsPaisa,
      expectedCashPaisa: cashReceiptsPaisa - paidOutTotal,
    };
  }
}
