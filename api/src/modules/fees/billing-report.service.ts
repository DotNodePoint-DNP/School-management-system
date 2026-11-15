import { BadRequestException, Injectable } from '@nestjs/common';
import { chunked } from '../../common/utils/chunked.js';
import { adToBsString, isoToDate } from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { distribute } from './charge-calculator.js';
import type { BillingQueryDto } from './dto/dues-report.dto.js';
import { InvoiceBalanceService } from './invoice-balance.service.js';

const CHUNK = 5000;
const MAX_INVOICES = 60_000;

interface Acc {
  invoices: number;
  grossPaisa: number;
  discountPaisa: number;
  billedPaisa: number;
  creditPaisa: number;
  collectedPaisa: number;
}
const acc = (): Acc => ({
  invoices: 0,
  grossPaisa: 0,
  discountPaisa: 0,
  billedPaisa: 0,
  creditPaisa: 0,
  collectedPaisa: 0,
});
const out = (a: Acc) => ({
  invoices: a.invoices,
  gross: fromPaisa(a.grossPaisa),
  discount: fromPaisa(a.discountPaisa),
  billed: fromPaisa(a.billedPaisa),
  creditNotes: fromPaisa(a.creditPaisa),
  collected: fromPaisa(a.collectedPaisa),
  outstanding: fromPaisa(a.billedPaisa - a.creditPaisa - a.collectedPaisa),
});
const bump = <K>(map: Map<K, Acc>, key: K): Acc => {
  const a = map.get(key) ?? acc();
  map.set(key, a);
  return a;
};

@Injectable()
export class BillingReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: InvoiceBalanceService,
  ) {}

  /**
   * What was billed in scope, and how much of it has been credited and collected so far. Voided invoices are left out of the
   * amounts and counted separately. For cash received by date, use the collections report.
   */
  async summary(q: BillingQueryDto) {
    if (q.from && q.to && q.from > q.to)
      throw new BadRequestException('The start date is after the end date');
    const where: Prisma.InvoiceWhereInput = {};
    if (q.fiscalYearId) where.fiscalYearId = q.fiscalYearId;
    if (q.academicYearId) where.academicYearId = q.academicYearId;
    if (q.periodId) where.periodId = q.periodId;
    if (q.kind) where.kind = q.kind;
    if (q.classId) where.enrollment = { classId: q.classId };
    if (q.from || q.to)
      where.issuedOn = {
        ...(q.from ? { gte: isoToDate(q.from) } : {}),
        ...(q.to ? { lte: isoToDate(q.to) } : {}),
      };
    if ((await this.prisma.invoice.count({ where })) > MAX_INVOICES)
      throw new BadRequestException(
        'That is too many invoices for one report. Narrow it by date, class or period.',
      );

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        kind: true,
        periodId: true,
        netAmount: true,
        enrollment: { select: { classId: true } },
        void: { select: { invoiceId: true } },
      },
    });
    const live = invoices.filter((i) => i.void === null);
    const voided = invoices.filter((i) => i.void !== null);

    const total = acc();
    const byHead = new Map<string, Acc>();
    const byClass = new Map<string, Acc>();
    const byPeriod = new Map<string, Acc>();
    const byKind = new Map<string, Acc>();
    const invoiceBy = new Map(live.map((i) => [i.id, i] as const));

    for (const part of chunked(
      live.map((i) => i.id),
      CHUNK,
    )) {
      const [balances, lines] = await Promise.all([
        this.balances.load(part),
        this.prisma.invoiceLine.findMany({
          where: { invoiceId: { in: part } },
          orderBy: { id: 'asc' },
          select: {
            invoiceId: true,
            feeHeadId: true,
            grossAmount: true,
            lineDiscount: true,
            invoiceDiscountShare: true,
            netAmount: true,
          },
        }),
      ]);
      const grouped = new Map<string, typeof lines>();
      for (const l of lines)
        grouped.set(l.invoiceId, [...(grouped.get(l.invoiceId) ?? []), l]);

      for (const id of part) {
        const inv = invoiceBy.get(id);
        const b = balances.get(id);
        const ls = grouped.get(id);
        if (!inv || !b || !ls) continue;
        const nets = ls.map((l) => toPaisa(l.netAmount.toNumber()));
        const credit = distribute(b.adjustedPaisa, nets);
        const paid = distribute(b.paidPaisa, nets);

        ls.forEach((l, i) => {
          const h = bump(byHead, l.feeHeadId);
          h.grossPaisa += toPaisa(l.grossAmount.toNumber());
          h.discountPaisa +=
            toPaisa(l.lineDiscount.toNumber()) +
            toPaisa(l.invoiceDiscountShare.toNumber());
          h.billedPaisa += nets[i] as number;
          h.creditPaisa += credit[i] as number;
          h.collectedPaisa += paid[i] as number;
        });
        const gross = ls.reduce(
          (n, l) => n + toPaisa(l.grossAmount.toNumber()),
          0,
        );
        const discount = ls.reduce(
          (n, l) =>
            n +
            toPaisa(l.lineDiscount.toNumber()) +
            toPaisa(l.invoiceDiscountShare.toNumber()),
          0,
        );
        for (const a of [
          total,
          bump(byClass, inv.enrollment.classId),
          bump(byPeriod, inv.periodId ?? 'NONE'),
          bump(byKind, inv.kind),
        ]) {
          a.invoices += 1;
          a.grossPaisa += gross;
          a.discountPaisa += discount;
          a.billedPaisa += b.netPaisa;
          a.creditPaisa += b.adjustedPaisa;
          a.collectedPaisa += b.paidPaisa;
        }
      }
    }

    const [heads, classes, periods] = await Promise.all([
      this.prisma.feeHead.findMany({
        where: { id: { in: [...byHead.keys()] } },
        select: { id: true, code: true, name: true, sortOrder: true },
      }),
      this.prisma.schoolClass.findMany({
        where: { id: { in: [...byClass.keys()] } },
        select: { id: true, name: true, sortOrder: true },
      }),
      this.prisma.billingPeriod.findMany({
        where: { id: { in: [...byPeriod.keys()].filter((k) => k !== 'NONE') } },
        select: { id: true, name: true, sequence: true },
      }),
    ]);
    const capital = total.billedPaisa - total.creditPaisa;
    return {
      scope: { ...q, invoices: live.length },
      totals: {
        ...out(total),
        invoiced: fromPaisa(total.grossPaisa),
        discounts: fromPaisa(total.discountPaisa),
        collectionRate:
          capital > 0
            ? Math.round((total.collectedPaisa / capital) * 1000) / 10
            : null,
        voided: {
          invoices: voided.length,
          amount: fromPaisa(
            voided.reduce((n, v) => n + toPaisa(v.netAmount.toNumber()), 0),
          ),
        },
      },
      byFeeHead: heads
        .map((h) => ({
          feeHeadId: h.id,
          code: h.code,
          name: h.name,
          order: h.sortOrder,
          ...out(byHead.get(h.id) as Acc),
        }))
        .sort((x, y) => x.order - y.order || x.code.localeCompare(y.code))
        .map(({ order: _o, ...rest }) => rest),
      byClass: classes
        .map((c) => ({
          classId: c.id,
          name: c.name,
          order: c.sortOrder,
          ...out(byClass.get(c.id) as Acc),
        }))
        .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name))
        .map(({ order: _o, ...rest }) => rest),
      byPeriod: [
        ...periods.map((p) => ({
          periodId: p.id as string | null,
          name: p.name,
          order: p.sequence,
          ...out(byPeriod.get(p.id) as Acc),
        })),
        ...(byPeriod.has('NONE')
          ? [
              {
                periodId: null,
                name: 'Admission and ad-hoc',
                order: Number.MAX_SAFE_INTEGER,
                ...out(byPeriod.get('NONE') as Acc),
              },
            ]
          : []),
      ]
        .sort((x, y) => x.order - y.order)
        .map(({ order: _o, ...rest }) => rest),
      byKind: [...byKind]
        .map(([kind, a]) => ({ kind, ...out(a) }))
        .sort((x, y) => x.kind.localeCompare(y.kind)),
      generatedOn: adToBsString(new Date().toISOString().slice(0, 10)),
    };
  }
}
