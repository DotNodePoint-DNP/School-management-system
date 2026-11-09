import { BadRequestException, Injectable } from '@nestjs/common';
import {
  adToBsString,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DayCloseService } from './day-close.service.js';
import { DayFiguresService } from './day-figures.service.js';
import type { CollectionsQueryDto } from './dto/reports.dto.js';

interface MoneyRow {
  paymentId: string;
  paidOn: Date;
  cashierId: string;
  method: string;
  classId: string | null;
  periodId: string | null;
  kind: 'PERIODIC' | 'ADMISSION' | 'AD_HOC' | 'ADVANCE';
  amount: Prisma.Decimal;
}

const BUCKET = {
  ADVANCE: 'Advance credit (not yet applied)',
  ADMISSION: 'Admission invoices',
  AD_HOC: 'Ad-hoc invoices',
} as const;
const MAX_DAYS = 366;

interface Tally {
  paisa: number;
  payments: Set<string>;
}
function tally(
  rows: MoneyRow[],
  key: (r: MoneyRow) => string,
): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const r of rows) {
    const t = out.get(key(r)) ?? { paisa: 0, payments: new Set<string>() };
    t.paisa += toPaisa(r.amount.toNumber());
    t.payments.add(r.paymentId);
    out.set(key(r), t);
  }
  return out;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly figures: DayFiguresService,
    private readonly dayCloses: DayCloseService,
  ) {}

  /** One day: the live figures, and the close (if any) that was counted. For a closed day the close is the official record. */
  async daily(date: string) {
    const live = await this.figures.compute(this.prisma, date);
    const [history, names] = await Promise.all([
      this.dayCloses.forDate(date),
      this.dayCloses.names(live.cashiers.map((c) => c.cashierId)),
    ]);
    const active = history.find((h) => h.status === 'ACTIVE') ?? null;
    const snapshotReceived = active
      ? active.methodTotals.reduce((n, m) => n + toPaisa(m.amount), 0)
      : null;
    return {
      date,
      dateBs: adToBsString(date),
      official: active ? ('CLOSE' as const) : ('LIVE' as const),
      live: this.dayCloses.describe(live, names),
      close: active,
      history,
      // A payment reversed after the day was closed shows up here, so nobody is surprised by a total that moved.
      changedSinceClose: active
        ? active.receiptCount !== live.receiptCount ||
          toPaisa(active.expectedCash) !== live.expectedCashPaisa ||
          snapshotReceived !== live.receivedPaisa
        : null,
    };
  }

  /**
   * Money collected between two dates, by day, cashier, payment method, class and billing period. Counts what was applied to invoices at
   * the time of the receipt, plus advance credit kept; credit applied later is not counted again. Reversed payments are left out.
   */
  async collections(q: CollectionsQueryDto) {
    const today = todayIso();
    const from = q.from ?? q.to ?? today;
    const to = q.to ?? q.from ?? today;
    if (from > to)
      throw new BadRequestException('The start date is after the end date');
    if (
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >
      MAX_DAYS * 86_400_000
    )
      throw new BadRequestException(
        `Choose a range of at most ${MAX_DAYS} days`,
      );

    const conditions = [
      Prisma.sql`p.paid_on BETWEEN ${from}::date AND ${to}::date`,
      Prisma.sql`NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = p.id)`,
      ...(q.cashierId
        ? [Prisma.sql`p.received_by_id = ${q.cashierId}::uuid`]
        : []),
      ...(q.method ? [Prisma.sql`p.method::text = ${q.method}`] : []),
      ...(q.fiscalYearId
        ? [Prisma.sql`p.fiscal_year_id = ${q.fiscalYearId}::uuid`]
        : []),
    ];
    const where = Prisma.join(conditions, ' AND ');

    const [invoiceRows, advanceRows, reversed] = await Promise.all([
      this.prisma.$queryRaw<MoneyRow[]>`
        SELECT p.id AS "paymentId", p.paid_on AS "paidOn", p.received_by_id AS "cashierId", p.method::text AS "method",
               e.class_id AS "classId", i.period_id AS "periodId", i.kind::text AS "kind", SUM(pa.amount) AS "amount"
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        JOIN invoices i ON i.id = pa.invoice_id
        JOIN enrollments e ON e.id = i.enrollment_id
        WHERE pa.created_at = p.created_at AND ${where}
        GROUP BY p.id, p.paid_on, p.received_by_id, p.method, e.class_id, i.period_id, i.kind`,
      this.prisma.$queryRaw<MoneyRow[]>`
        SELECT t.* FROM (
          SELECT p.id AS "paymentId", p.paid_on AS "paidOn", p.received_by_id AS "cashierId", p.method::text AS "method",
                 NULL::uuid AS "classId", NULL::uuid AS "periodId", 'ADVANCE' AS "kind",
                 p.amount - COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa WHERE pa.payment_id = p.id AND pa.created_at = p.created_at), 0) AS "amount"
          FROM payments p WHERE ${where}
        ) t WHERE t."amount" > 0`,
      this.prisma.payment.aggregate({
        where: {
          paidOn: {
            gte: new Date(`${from}T00:00:00Z`),
            lte: new Date(`${to}T00:00:00Z`),
          },
          reversal: { isNot: null },
          ...(q.cashierId ? { receivedById: q.cashierId } : {}),
          ...(q.method ? { method: q.method } : {}),
          ...(q.fiscalYearId ? { fiscalYearId: q.fiscalYearId } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);
    const rows = [...invoiceRows, ...advanceRows];

    const [users, classes, periods] = await Promise.all([
      this.dayCloses.names(rows.map((r) => r.cashierId)),
      this.prisma.schoolClass.findMany({
        where: {
          id: {
            in: [
              ...new Set(rows.flatMap((r) => (r.classId ? [r.classId] : []))),
            ],
          },
        },
        select: { id: true, name: true, sortOrder: true },
      }),
      this.prisma.billingPeriod.findMany({
        where: {
          id: {
            in: [
              ...new Set(rows.flatMap((r) => (r.periodId ? [r.periodId] : []))),
            ],
          },
        },
        select: { id: true, name: true, sequence: true },
      }),
    ]);
    const classBy = new Map(classes.map((c) => [c.id, c] as const));
    const periodBy = new Map(periods.map((p) => [p.id, p] as const));
    const out = (t: Tally) => ({
      amount: fromPaisa(t.paisa),
      payments: t.payments.size,
    });
    const total = rows.reduce((n, r) => n + toPaisa(r.amount.toNumber()), 0);
    const cash = rows
      .filter((r) => r.method === 'CASH')
      .reduce((n, r) => n + toPaisa(r.amount.toNumber()), 0);

    const byCashier = [...tally(rows, (r) => r.cashierId)]
      .map(([cashierId, t]) => {
        const own = rows.filter((r) => r.cashierId === cashierId);
        const ownCash = own
          .filter((r) => r.method === 'CASH')
          .reduce((n, r) => n + toPaisa(r.amount.toNumber()), 0);
        return {
          cashierId,
          name: users.get(cashierId) ?? null,
          ...out(t),
          cash: fromPaisa(ownCash),
          nonCash: fromPaisa(t.paisa - ownCash),
        };
      })
      .sort(
        (a, b) =>
          b.amount - a.amount || (a.name ?? '').localeCompare(b.name ?? ''),
      );

    return {
      range: { from, to, fromBs: adToBsString(from), toBs: adToBsString(to) },
      totals: {
        collected: fromPaisa(total),
        payments: new Set(rows.map((r) => r.paymentId)).size,
        cash: fromPaisa(cash),
        nonCash: fromPaisa(total - cash),
        advanceCredit: fromPaisa(
          rows
            .filter((r) => r.kind === 'ADVANCE')
            .reduce((n, r) => n + toPaisa(r.amount.toNumber()), 0),
        ),
      },
      byDay: [...tally(rows, (r) => toIsoDate(r.paidOn))]
        .map(([date, t]) => ({ date, dateBs: adToBsString(date), ...out(t) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byCashier,
      byMethod: [...tally(rows, (r) => r.method)]
        .map(([method, t]) => ({ method, ...out(t) }))
        .sort(
          (a, b) => b.amount - a.amount || a.method.localeCompare(b.method),
        ),
      byClass: [...tally(rows, (r) => r.classId ?? r.kind)]
        .map(([key, t]) => ({
          classId: classBy.has(key) ? key : null,
          name:
            classBy.get(key)?.name ?? BUCKET[key as keyof typeof BUCKET] ?? key,
          order: classBy.get(key)?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          ...out(t),
        }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map(({ order: _order, ...rest }) => rest),
      byPeriod: [...tally(rows, (r) => r.periodId ?? r.kind)]
        .map(([key, t]) => ({
          periodId: periodBy.has(key) ? key : null,
          name:
            periodBy.get(key)?.name ??
            BUCKET[key as keyof typeof BUCKET] ??
            key,
          order: periodBy.get(key)?.sequence ?? Number.MAX_SAFE_INTEGER,
          ...out(t),
        }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map(({ order: _order, ...rest }) => rest),
      reversed: {
        payments: reversed._count._all,
        amount: reversed._sum.amount?.toNumber() ?? 0,
      },
    };
  }
}
