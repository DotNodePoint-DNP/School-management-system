import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDaysIso,
  adToBsString,
  bsToIso,
  dateParts,
  isoToDate,
  requireDate,
  resolveDate,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AcademicYearsService,
  type YearCore,
} from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreatePeriodDto,
  GeneratePeriodsDto,
  UpdatePeriodDto,
} from './dto/billing-period.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const SELECT = {
  id: true,
  sequence: true,
  name: true,
  nameNp: true,
  startDate: true,
  endDate: true,
  dueDate: true,
} satisfies Prisma.BillingPeriodSelect;
type Row = Prisma.BillingPeriodGetPayload<{ select: typeof SELECT }>;

const MONTHS_EN = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
];
const MONTHS_NP = [
  'वैशाख',
  'जेठ',
  'असार',
  'श्रावण',
  'भदौ',
  'आश्विन',
  'कार्तिक',
  'मंसिर',
  'पौष',
  'माघ',
  'फागुन',
  'चैत',
];
const NP_DIGITS = '०१२३४५६७८९';
const npDigits = (n: number): string =>
  String(n).replace(/\d/g, (d) => NP_DIGITS[Number(d)] as string);
const pad = (n: number): string => String(n).padStart(2, '0');

export interface BillingPeriodResponse {
  id: string;
  sequence: number;
  name: string;
  nameNp: string | null;
  startDate: string;
  startDateBs: string | null;
  endDate: string;
  endDateBs: string | null;
  dueDate: string;
  dueDateBs: string | null;
}

function toResponse(r: Row): BillingPeriodResponse {
  const s = dateParts(r.startDate);
  const e = dateParts(r.endDate);
  const d = dateParts(r.dueDate);
  return {
    id: r.id,
    sequence: r.sequence,
    name: r.name,
    nameNp: r.nameNp,
    startDate: s.ad,
    startDateBs: s.bs,
    endDate: e.ad,
    endDateBs: e.bs,
    dueDate: d.ad,
    dueDateBs: d.bs,
  };
}

@Injectable()
export class BillingPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
  ) {}

  async list(yearId: string): Promise<BillingPeriodResponse[]> {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: yearId },
      select: { id: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    const rows = await this.prisma.billingPeriod.findMany({
      where: { academicYearId: yearId },
      orderBy: { sequence: 'asc' },
      select: SELECT,
    });
    return rows.map(toResponse);
  }

  /**
   * Creates one period per BS month, starting with the month the academic year begins in. The first period starts on the
   * year's first day and the last ends no later than its last day. Only works while the year has no periods yet.
   */
  async generate(
    yearId: string,
    dto: GeneratePeriodsDto,
    actor: AuthUser,
  ): Promise<BillingPeriodResponse[]> {
    const dueDay = dto.dueDay ?? 10;
    const skip = new Set(dto.skipBsMonths ?? []);
    const rows = await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockWritableYear(tx, yearId);
      if (
        (await tx.billingPeriod.count({ where: { academicYearId: yearId } })) >
        0
      ) {
        throw new ConflictException(
          'This academic year already has billing periods. Edit or delete them, or add one by hand.',
        );
      }
      const planned = this.plan(year, dto.months, dueDay, skip);
      await tx.billingPeriod.createMany({
        data: planned.map((p, i) => ({
          academicYearId: yearId,
          sequence: i + 1,
          ...p,
        })),
      });
      return tx.billingPeriod.findMany({
        where: { academicYearId: yearId },
        orderBy: { sequence: 'asc' },
        select: SELECT,
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'billing_periods.generated',
      entityType: 'academic_year',
      entityId: yearId,
      details: { months: dto.months, dueDay, skipped: dto.skipBsMonths ?? [] },
    });
    return rows.map(toResponse);
  }

  async create(
    yearId: string,
    dto: CreatePeriodDto,
    actor: AuthUser,
  ): Promise<BillingPeriodResponse> {
    const start = requireDate('startDate', dto.startDate, dto.startDateBs);
    const end = requireDate('endDate', dto.endDate, dto.endDateBs);
    const due = requireDate('dueDate', dto.dueDate, dto.dueDateBs);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const year = await this.years.lockWritableYear(tx, yearId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing_periods:${yearId}`}))`;
        this.assertDates(year, start, end, due);
        await this.assertNoOverlap(tx, yearId, start, end);
        const created = await tx.billingPeriod.create({
          data: {
            academicYearId: yearId,
            sequence: 9999,
            name: dto.name,
            nameNp: dto.nameNp,
            startDate: isoToDate(start),
            endDate: isoToDate(end),
            dueDate: isoToDate(due),
          },
          select: { id: true },
        });
        await this.resequence(tx, yearId);
        return created.id;
      }, TX);
      await this.audit.record({
        actor,
        action: 'billing_period.created',
        entityType: 'billing_period',
        entityId: id,
        details: { academicYearId: yearId, startDate: start, endDate: end },
      });
      return await this.one(id);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async update(
    yearId: string,
    id: string,
    dto: UpdatePeriodDto,
    actor: AuthUser,
  ): Promise<BillingPeriodResponse> {
    const start = resolveDate('startDate', dto.startDate, dto.startDateBs);
    const end = resolveDate('endDate', dto.endDate, dto.endDateBs);
    const due = resolveDate('dueDate', dto.dueDate, dto.dueDateBs);
    try {
      const changed = await this.prisma.$transaction(async (tx) => {
        const year = await this.years.lockWritableYear(tx, yearId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing_periods:${yearId}`}))`;
        const current = await tx.billingPeriod.findFirst({
          where: { id, academicYearId: yearId },
          select: SELECT,
        });
        if (!current) throw new NotFoundException('Billing period not found');

        const newStart = start ?? toIsoDate(current.startDate);
        const newEnd = end ?? toIsoDate(current.endDate);
        const newDue = due ?? toIsoDate(current.dueDate);
        const data: Prisma.BillingPeriodUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.nameNp !== undefined)
          data.nameNp = dto.nameNp === '' ? null : dto.nameNp;
        if (start !== undefined || end !== undefined || due !== undefined) {
          this.assertDates(year, newStart, newEnd, newDue);
          await this.assertNoOverlap(tx, yearId, newStart, newEnd, id);
          data.startDate = isoToDate(newStart);
          data.endDate = isoToDate(newEnd);
          data.dueDate = isoToDate(newDue);
        }
        if (Object.keys(data).length === 0)
          throw new BadRequestException('Nothing to change');
        await tx.billingPeriod.update({ where: { id }, data });
        await this.resequence(tx, yearId);
        return Object.keys(data);
      }, TX);
      await this.audit.record({
        actor,
        action: 'billing_period.updated',
        entityType: 'billing_period',
        entityId: id,
        details: { changedFields: changed },
      });
      return await this.one(id);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  /** Only a period no fee structure uses (and, from 7B on, no invoice). */
  async remove(yearId: string, id: string, actor: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing_periods:${yearId}`}))`;
      const period = await tx.billingPeriod.findFirst({
        where: { id, academicYearId: yearId },
        select: { id: true },
      });
      if (!period) throw new NotFoundException('Billing period not found');
      const used = await tx.feeStructureLinePeriod.count({
        where: { periodId: id },
      });
      if (used > 0)
        throw new ConflictException(
          `${used} fee structure line(s) use this period. Remove it from them first.`,
        );
      await tx.billingPeriod.delete({ where: { id } });
      await this.resequence(tx, yearId);
    }, TX);
    await this.audit.record({
      actor,
      action: 'billing_period.deleted',
      entityType: 'billing_period',
      entityId: id,
      details: { academicYearId: yearId },
    });
  }

  /** Pure planning of the month periods. Throws 400 when the year is too short or a date is outside the supported BS range. */
  private plan(
    year: YearCore,
    months: number,
    dueDay: number,
    skip: Set<number>,
  ) {
    const yearStart = toIsoDate(year.startDate);
    const yearEnd = toIsoDate(year.endDate);
    const startBs = adToBsString(yearStart);
    if (!startBs)
      throw new BadRequestException(
        'This academic year is outside the supported Bikram Sambat range. Add the billing periods by hand.',
      );
    let y = Number(startBs.slice(0, 4));
    let m = Number(startBs.slice(5, 7));
    const out: {
      name: string;
      nameNp: string;
      startDate: Date;
      endDate: Date;
      dueDate: Date;
    }[] = [];
    const tooShort = new BadRequestException(
      `This academic year is too short for ${months} billing months`,
    );

    try {
      for (let guard = 0; out.length < months && guard < 36; guard++) {
        const [cy, cm] = [y, m];
        [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
        if (skip.has(cm)) continue;

        const first = bsToIso(`${cy}-${pad(cm)}-01`, 'billing month');
        const nextFirst = bsToIso(`${y}-${pad(m)}-01`, 'billing month');
        const start = first > yearStart ? first : yearStart;
        const monthEnd = addDaysIso(nextFirst, -1);
        const end = monthEnd < yearEnd ? monthEnd : yearEnd;
        if (start > yearEnd) throw tooShort;
        const dueRaw = bsToIso(`${cy}-${pad(cm)}-${pad(dueDay)}`, 'due date');
        out.push({
          name: `${MONTHS_EN[cm - 1]} ${cy}`,
          nameNp: `${MONTHS_NP[cm - 1]} ${npDigits(cy)}`,
          startDate: isoToDate(start),
          endDate: isoToDate(end),
          dueDate: isoToDate(dueRaw < start ? start : dueRaw),
        });
      }
    } catch (error) {
      if (error === tooShort) throw error;
      if (error instanceof BadRequestException) {
        throw new BadRequestException(
          `Cannot generate periods for this calendar range (${error.message}). Add them by hand.`,
        );
      }
      throw error;
    }
    if (out.length < months) throw tooShort;
    return out;
  }

  private assertDates(
    year: YearCore,
    start: string,
    end: string,
    due: string,
  ): void {
    if (end < start)
      throw new BadRequestException('The end date is before the start date');
    if (due < start)
      throw new BadRequestException(
        'The due date cannot be before the period starts',
      );
    if (start < toIsoDate(year.startDate) || end > toIsoDate(year.endDate)) {
      throw new BadRequestException(
        `A billing period must fall within its academic year (${toIsoDate(year.startDate)} to ${toIsoDate(year.endDate)})`,
      );
    }
  }

  private async assertNoOverlap(
    tx: Tx,
    yearId: string,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await tx.billingPeriod.findFirst({
      where: {
        academicYearId: yearId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: isoToDate(end) },
        endDate: { gte: isoToDate(start) },
      },
      select: { name: true },
    });
    if (clash)
      throw new ConflictException(
        `These dates overlap the billing period "${clash.name}"`,
      );
  }

  /** Keeps sequence numbers 1..n in date order. Two passes, so the unique (year, sequence) is never violated. */
  private async resequence(tx: Tx, yearId: string): Promise<void> {
    const rows = await tx.billingPeriod.findMany({
      where: { academicYearId: yearId },
      orderBy: { startDate: 'asc' },
      select: { id: true },
    });
    await tx.billingPeriod.updateMany({
      where: { academicYearId: yearId },
      data: { sequence: { increment: 10_000 } },
    });
    for (const [index, row] of rows.entries())
      await tx.billingPeriod.update({
        where: { id: row.id },
        data: { sequence: index + 1 },
      });
  }

  private async one(id: string): Promise<BillingPeriodResponse> {
    return toResponse(
      await this.prisma.billingPeriod.findUniqueOrThrow({
        where: { id },
        select: SELECT,
      }),
    );
  }

  private mapConflict(error: unknown): never {
    if (
      error instanceof Error &&
      error.message.includes('billing_periods_no_overlap')
    )
      throw new ConflictException('These dates overlap another billing period');
    throw error;
  }
}
