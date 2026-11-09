import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  adToBsString,
  isoToDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DayFiguresService, type DayFigures } from './day-figures.service.js';
import { DayLockService } from './day-lock.service.js';
import type {
  CloseDayDto,
  ListDayClosesQueryDto,
  PendingDaysQueryDto,
  ReopenDayDto,
} from './dto/day-close.dto.js';
import { FiscalYearsService } from './fiscal-years.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SELECT = {
  id: true,
  date: true,
  version: true,
  expectedCash: true,
  countedCash: true,
  cashPaidOut: true,
  variance: true,
  receiptCount: true,
  methodTotals: true,
  note: true,
  closedById: true,
  closedAt: true,
  lines: {
    select: {
      cashierId: true,
      expectedCash: true,
      countedCash: true,
      variance: true,
      note: true,
    },
  },
  reopen: { select: { reason: true, reopenedById: true, reopenedAt: true } },
} satisfies Prisma.DayCloseSelect;
type Row = Prisma.DayCloseGetPayload<{ select: typeof SELECT }>;

export interface DayCloseView {
  id: string;
  date: string;
  dateBs: string | null;
  version: number;
  status: 'ACTIVE' | 'REOPENED';
  expectedCash: number;
  countedCash: number;
  cashPaidOut: number;
  variance: number;
  receiptCount: number;
  methodTotals: { method: string; count: number; amount: number }[];
  note: string | null;
  closedBy: string | null;
  closedAt: string;
  lines: {
    cashier: { id: string; name: string | null };
    expectedCash: number;
    countedCash: number;
    variance: number;
    note: string | null;
  }[];
  reopen: {
    reason: string;
    reopenedBy: string | null;
    reopenedAt: string;
  } | null;
}

@Injectable()
export class DayCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalYears: FiscalYearsService,
    private readonly figures: DayFiguresService,
    private readonly days: DayLockService,
  ) {}

  /** What closing this date would record. Writes nothing. */
  async preview(date: string) {
    const today = todayIso();
    const [figures, active, fiscalYear] = await Promise.all([
      this.figures.compute(this.prisma, date),
      this.forDate(date).then(
        (v) => v.find((c) => c.status === 'ACTIVE') ?? null,
      ),
      this.prisma.fiscalYear.findFirst({
        where: {
          startDate: { lte: isoToDate(date) },
          endDate: { gte: isoToDate(date) },
        },
        select: { id: true, label: true, status: true },
      }),
    ]);
    const names = await this.names(figures.cashiers.map((c) => c.cashierId));

    const problems: string[] = [];
    if (date > today) problems.push('This date has not happened yet.');
    if (!fiscalYear) problems.push(`No fiscal year covers ${date}.`);
    else if (fiscalYear.status !== 'OPEN')
      problems.push(`Fiscal year ${fiscalYear.label} is closed.`);
    if (active)
      problems.push(`This day is already closed (version ${active.version}).`);

    return {
      date,
      dateBs: adToBsString(date),
      fiscalYear: fiscalYear
        ? { id: fiscalYear.id, label: fiscalYear.label }
        : null,
      closed: active !== null,
      activeClose: active,
      canClose: problems.length === 0,
      problems,
      figures: this.describe(figures, names),
    };
  }

  async close(dto: CloseDayDto, actor: AuthUser): Promise<DayCloseView> {
    const today = todayIso();
    const date = resolveDate('date', dto.date, dto.dateBs) ?? today;
    if (date > today)
      throw new BadRequestException(
        'A day that has not happened yet cannot be closed',
      );
    const fiscalYear = await this.fiscalYears.openFor(date);

    const id = await this.prisma.$transaction(async (tx) => {
      // Lock order: fiscal year (shared), then the day (exclusive: receipts for this date wait for the close).
      await this.fiscalYears.lockOpen(tx, fiscalYear.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`day:${date}`}))`;
      if (await this.days.isClosed(tx, date))
        throw new ConflictException('This day is already closed');

      const f = await this.figures.compute(tx, date);
      if (
        toPaisa(dto.expect.expectedCash) !== f.expectedCashPaisa ||
        dto.expect.receiptCount !== f.receiptCount
      ) {
        throw new ConflictException(
          `The figures changed since you looked (now NPR ${fromPaisa(f.expectedCashPaisa)} expected from ${f.receiptCount} receipt(s)). Preview again before closing.`,
        );
      }

      const owed = f.cashiers.filter((c) => c.cashCount > 0);
      const owedIds = owed.map((c) => c.cashierId);
      const givenIds = dto.lines.map((l) => l.cashierId);
      if (new Set(givenIds).size !== givenIds.length)
        throw new BadRequestException('Each cashier can appear only once');
      if (givenIds.some((g) => !owedIds.includes(g)))
        throw new BadRequestException(
          'One of those people took no cash on this day, so they have no count line',
        );
      const missing = owedIds.filter((o) => !givenIds.includes(o));
      if (missing.length > 0)
        throw new BadRequestException(
          `Enter the counted cash for every cashier who took cash that day (${missing.length} missing)`,
        );

      const countedBy = new Map(
        dto.lines.map((l) => [l.cashierId, l] as const),
      );
      const lines = owed.map((c) => {
        const given = countedBy.get(c.cashierId) as (typeof dto.lines)[number];
        const counted = toPaisa(given.countedCash);
        return {
          cashierId: c.cashierId,
          expected: c.cashPaisa,
          counted,
          variance: counted - c.cashPaisa,
          note: given.note ?? null,
        };
      });
      const countedTotal = lines.reduce((n, l) => n + l.counted, 0);
      const variance = countedTotal - f.expectedCashPaisa;
      if (variance !== 0 && !dto.note)
        throw new BadRequestException(
          `The counted cash is NPR ${fromPaisa(Math.abs(variance))} ${variance < 0 ? 'short' : 'over'}. Add a note explaining the difference.`,
        );
      // With no cash paid out, a cashier's difference is exactly that cashier's, so it must be explained too.
      if (
        f.paidOut.totalPaisa === 0 &&
        lines.some((l) => l.variance !== 0 && !l.note)
      ) {
        throw new BadRequestException(
          'Add a note for every cashier whose count differs from the expected cash',
        );
      }

      const last = await tx.dayClose.aggregate({
        where: { date: isoToDate(date) },
        _max: { version: true },
      });
      const created = await tx.dayClose.create({
        data: {
          date: isoToDate(date),
          version: (last._max.version ?? 0) + 1,
          expectedCash: fromPaisa(f.expectedCashPaisa),
          countedCash: fromPaisa(countedTotal),
          cashPaidOut: fromPaisa(f.paidOut.totalPaisa),
          variance: fromPaisa(variance),
          receiptCount: f.receiptCount,
          note: dto.note,
          methodTotals: f.byMethod.map((m) => ({
            method: m.method,
            count: m.count,
            amount: fromPaisa(m.amountPaisa),
          })),
          closedById: actor.id,
          lines: {
            create: lines.map((l) => ({
              cashierId: l.cashierId,
              expectedCash: fromPaisa(l.expected),
              countedCash: fromPaisa(l.counted),
              variance: fromPaisa(l.variance),
              note: l.note,
            })),
          },
        },
        select: { id: true, version: true },
      });
      // Numbers only: no notes or names in the audit log.
      await this.audit.recordIn(tx, {
        actor,
        action: 'day.closed',
        entityType: 'day_close',
        entityId: created.id,
        details: {
          date,
          version: created.version,
          expectedCash: fromPaisa(f.expectedCashPaisa),
          countedCash: fromPaisa(countedTotal),
          variance: fromPaisa(variance),
          receipts: f.receiptCount,
        },
      });
      return created.id;
    }, TX);
    return this.get(id);
  }

  /** Needs the reopen permission. Both the close and the reopen stay on record. */
  async reopen(
    id: string,
    dto: ReopenDayDto,
    actor: AuthUser,
  ): Promise<DayCloseView> {
    const found = await this.prisma.dayClose.findUnique({
      where: { id },
      select: { date: true },
    });
    if (!found) throw new NotFoundException('Day close not found');
    const date = toIsoDate(found.date);
    const fiscalYear = await this.fiscalYears.openFor(date);

    await this.prisma.$transaction(async (tx) => {
      await this.fiscalYears.lockOpen(tx, fiscalYear.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`day:${date}`}))`;
      const current = await tx.dayClose.findUniqueOrThrow({
        where: { id },
        select: { version: true, reopen: { select: { dayCloseId: true } } },
      });
      if (current.reopen)
        throw new ConflictException('This close has already been reopened');
      await tx.dayCloseReopen.create({
        data: { dayCloseId: id, reason: dto.reason, reopenedById: actor.id },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'day.reopened',
        entityType: 'day_close',
        entityId: id,
        details: { date, version: current.version },
      });
    }, TX);
    return this.get(id);
  }

  async get(id: string): Promise<DayCloseView> {
    const row = await this.prisma.dayClose.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Day close not found');
    return (await this.present([row]))[0] as DayCloseView;
  }

  async list(q: ListDayClosesQueryDto): Promise<Paginated<DayCloseView>> {
    const where: Prisma.DayCloseWhereInput = {};
    if (q.from || q.to)
      where.date = {
        ...(q.from ? { gte: isoToDate(q.from) } : {}),
        ...(q.to ? { lte: isoToDate(q.to) } : {}),
      };
    if (q.status === 'ACTIVE') where.reopen = { is: null };
    if (q.status === 'REOPENED') where.reopen = { isNot: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dayClose.findMany({
        where,
        orderBy: [{ date: 'desc' }, { version: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT,
      }),
      this.prisma.dayClose.count({ where }),
    ]);
    return toPaginated(await this.present(rows), total, q);
  }

  /** Every close (all versions) of one date, oldest first. */
  async forDate(date: string): Promise<DayCloseView[]> {
    const rows = await this.prisma.dayClose.findMany({
      where: { date: isoToDate(date) },
      orderBy: { version: 'asc' },
      select: SELECT,
    });
    return this.present(rows);
  }

  /** Days that have receipts but no active close: the accountant's to-do list. */
  async pending(q: PendingDaysQueryDto) {
    const today = todayIso();
    const to = q.to ?? today;
    const from =
      q.from ??
      toIsoDate(new Date(Date.parse(`${to}T00:00:00Z`) - 60 * 86_400_000));
    if (from > to)
      throw new BadRequestException('The start date is after the end date');
    if (
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >
      400 * 86_400_000
    )
      throw new BadRequestException('Choose a range of at most 400 days');
    const rows = await this.prisma.$queryRaw<
      { date: Date; payments: bigint; total: Prisma.Decimal }[]
    >`
      SELECT p.paid_on AS date, COUNT(*) AS payments, SUM(p.amount) AS total
      FROM payments p
      WHERE p.paid_on BETWEEN ${from}::date AND ${to}::date
        AND NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = p.id)
        AND NOT public.day_is_closed(p.paid_on)
      GROUP BY p.paid_on ORDER BY p.paid_on`;
    return rows.map((r) => ({
      date: toIsoDate(r.date),
      dateBs: adToBsString(toIsoDate(r.date)),
      payments: Number(r.payments),
      total: r.total.toNumber(),
    }));
  }

  // ---------------------------------------------------------------- shared with the reports

  async names(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName] as const));
  }

  describe(f: DayFigures, names: Map<string, string>) {
    return {
      receiptCount: f.receiptCount,
      received: fromPaisa(f.receivedPaisa),
      byMethod: f.byMethod.map((m) => ({
        method: m.method,
        count: m.count,
        amount: fromPaisa(m.amountPaisa),
      })),
      cashiers: f.cashiers
        .map((c) => ({
          cashier: { id: c.cashierId, name: names.get(c.cashierId) ?? null },
          cashReceived: fromPaisa(c.cashPaisa),
          cashCount: c.cashCount,
          otherReceived: fromPaisa(c.otherPaisa),
          otherCount: c.otherCount,
        }))
        .sort((a, b) =>
          (a.cashier.name ?? '').localeCompare(b.cashier.name ?? ''),
        ),
      cashReceived: fromPaisa(f.cashReceiptsPaisa),
      cashPaidOut: {
        refunds: fromPaisa(f.paidOut.refundsPaisa),
        reversals: fromPaisa(f.paidOut.reversalsPaisa),
        total: fromPaisa(f.paidOut.totalPaisa),
      },
      expectedCash: fromPaisa(f.expectedCashPaisa),
    };
  }

  private async present(rows: Row[]): Promise<DayCloseView[]> {
    const names = await this.names(
      rows
        .flatMap((r) => [
          r.closedById,
          r.reopen?.reopenedById,
          ...r.lines.map((l) => l.cashierId),
        ])
        .filter((v): v is string => Boolean(v)),
    );
    return rows.map((r) => {
      const date = toIsoDate(r.date);
      return {
        id: r.id,
        date,
        dateBs: adToBsString(date),
        version: r.version,
        status: r.reopen ? 'REOPENED' : 'ACTIVE',
        expectedCash: r.expectedCash.toNumber(),
        countedCash: r.countedCash.toNumber(),
        cashPaidOut: r.cashPaidOut.toNumber(),
        variance: r.variance.toNumber(),
        receiptCount: r.receiptCount,
        methodTotals: r.methodTotals as DayCloseView['methodTotals'],
        note: r.note,
        closedBy: names.get(r.closedById) ?? null,
        closedAt: r.closedAt.toISOString(),
        lines: r.lines
          .map((l) => ({
            cashier: { id: l.cashierId, name: names.get(l.cashierId) ?? null },
            expectedCash: l.expectedCash.toNumber(),
            countedCash: l.countedCash.toNumber(),
            variance: l.variance.toNumber(),
            note: l.note,
          }))
          .sort((a, b) =>
            (a.cashier.name ?? '').localeCompare(b.cashier.name ?? ''),
          ),
        reopen: r.reopen
          ? {
              reason: r.reopen.reason,
              reopenedBy: names.get(r.reopen.reopenedById) ?? null,
              reopenedAt: r.reopen.reopenedAt.toISOString(),
            }
          : null,
      };
    });
  }
}
