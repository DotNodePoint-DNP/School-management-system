import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  dateParts,
  daysBetweenIso,
  isoToDate,
  requireDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreateFiscalYearDto,
  UpdateFiscalYearDto,
} from './dto/fiscal-year.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const SELECT = {
  id: true,
  label: true,
  startDate: true,
  endDate: true,
  status: true,
  closedAt: true,
} satisfies Prisma.FiscalYearSelect;
type Row = Prisma.FiscalYearGetPayload<{ select: typeof SELECT }>;

// A typo guard: a fiscal year is about a year long (365 or 366 days).
const MIN_DAYS = 350;
const MAX_DAYS = 380;

export interface FiscalYearResponse {
  id: string;
  label: string;
  startDate: string;
  startDateBs: string | null;
  endDate: string;
  endDateBs: string | null;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  isCurrent: boolean;
}

function toResponse(row: Row, today: string): FiscalYearResponse {
  const start = dateParts(row.startDate);
  const end = dateParts(row.endDate);
  return {
    id: row.id,
    label: row.label,
    startDate: start.ad,
    startDateBs: start.bs,
    endDate: end.ad,
    endDateBs: end.bs,
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
    isCurrent: start.ad <= today && today <= end.ad,
  };
}

@Injectable()
export class FiscalYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<FiscalYearResponse[]> {
    const today = todayIso();
    const rows = await this.prisma.fiscalYear.findMany({
      orderBy: { startDate: 'desc' },
      select: SELECT,
    });
    return rows.map((r) => toResponse(r, today));
  }

  async get(id: string): Promise<FiscalYearResponse> {
    const row = await this.prisma.fiscalYear.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Fiscal year not found');
    return toResponse(row, todayIso());
  }

  /** The fiscal year that covers today. Receipts and invoices cannot be created without one. */
  async current(): Promise<FiscalYearResponse> {
    const today = todayIso();
    const row = await this.prisma.fiscalYear.findFirst({
      where: {
        startDate: { lte: isoToDate(today) },
        endDate: { gte: isoToDate(today) },
      },
      select: SELECT,
    });
    if (!row)
      throw new NotFoundException(
        'No fiscal year covers today. Create the next fiscal year before billing or collecting.',
      );
    return toResponse(row, today);
  }

  async create(
    dto: CreateFiscalYearDto,
    actor: AuthUser,
  ): Promise<FiscalYearResponse> {
    const start = requireDate('startDate', dto.startDate, dto.startDateBs);
    const end = requireDate('endDate', dto.endDate, dto.endDateBs);
    this.assertRange(start, end);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fiscal_years'))`;
        await this.assertNoOverlap(tx, start, end);
        return tx.fiscalYear.create({
          data: {
            label: dto.label,
            startDate: isoToDate(start),
            endDate: isoToDate(end),
          },
          select: SELECT,
        });
      }, TX);
      await this.audit.record({
        actor,
        action: 'fiscal_year.created',
        entityType: 'fiscal_year',
        entityId: row.id,
        details: { label: row.label, startDate: start, endDate: end },
      });
      return toResponse(row, todayIso());
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  /** Dates and label can change only while the year is open. Once receipts or invoices exist (from 7B on) the dates freeze. */
  async update(
    id: string,
    dto: UpdateFiscalYearDto,
    actor: AuthUser,
  ): Promise<FiscalYearResponse> {
    const start = resolveDate('startDate', dto.startDate, dto.startDateBs);
    const end = resolveDate('endDate', dto.endDate, dto.endDateBs);
    try {
      const { row, changed } = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fiscal_years'))`;
        const current = await tx.fiscalYear.findUnique({
          where: { id },
          select: SELECT,
        });
        if (!current) throw new NotFoundException('Fiscal year not found');
        if (current.status === 'CLOSED')
          throw new ConflictException('A closed fiscal year cannot be changed');

        const data: Prisma.FiscalYearUpdateInput = {};
        if (dto.label !== undefined && dto.label !== current.label)
          data.label = dto.label;
        const newStart = start ?? toIsoDate(current.startDate);
        const newEnd = end ?? toIsoDate(current.endDate);
        if (
          newStart !== toIsoDate(current.startDate) ||
          newEnd !== toIsoDate(current.endDate)
        ) {
          this.assertRange(newStart, newEnd);
          await this.assertNoOverlap(tx, newStart, newEnd, id);

          if ((await tx.invoice.count({ where: { fiscalYearId: id } })) > 0) {
            throw new ConflictException(
              'Invoices already exist in this fiscal year, so its dates can no longer change',
            );
          }
          data.startDate = isoToDate(newStart);
          data.endDate = isoToDate(newEnd);
        }
        if (Object.keys(data).length === 0)
          throw new BadRequestException('Nothing to change');
        const updated = await tx.fiscalYear.update({
          where: { id },
          data,
          select: SELECT,
        });
        return { row: updated, changed: Object.keys(data) };
      }, TX);
      await this.audit.record({
        actor,
        action: 'fiscal_year.updated',
        entityType: 'fiscal_year',
        entityId: id,
        details: { changedFields: changed },
      });
      return toResponse(row, todayIso());
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  /** Only after the year has ended. Closing blocks new entries dated inside it. */
  async close(id: string, actor: AuthUser): Promise<FiscalYearResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM fiscal_years WHERE id = ${id}::uuid FOR UPDATE`;
      if (rows.length === 0)
        throw new NotFoundException('Fiscal year not found');
      const year = await tx.fiscalYear.findUniqueOrThrow({
        where: { id },
        select: SELECT,
      });
      if (year.status === 'CLOSED')
        throw new ConflictException('This fiscal year is already closed');
      if (toIsoDate(year.endDate) >= todayIso())
        throw new ConflictException(
          `This fiscal year runs until ${toIsoDate(year.endDate)}. It can be closed after it ends.`,
        );
      const closed = await tx.fiscalYear.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: actor.id },
        select: SELECT,
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'fiscal_year.closed',
        entityType: 'fiscal_year',
        entityId: id,
        details: { label: year.label },
      });
      return closed;
    }, TX);
    return toResponse(row, todayIso());
  }

  private assertRange(start: string, end: string): void {
    if (end <= start)
      throw new BadRequestException(
        'The end date must be after the start date',
      );
    const days = daysBetweenIso(start, end) + 1;
    if (days < MIN_DAYS || days > MAX_DAYS) {
      throw new BadRequestException(
        `A fiscal year is about a year long; this one is ${days} days. Check the dates.`,
      );
    }
  }

  private async assertNoOverlap(
    tx: Tx,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await tx.fiscalYear.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: isoToDate(end) },
        endDate: { gte: isoToDate(start) },
      },
      select: { label: true, startDate: true, endDate: true },
    });
    if (clash)
      throw new ConflictException(
        `These dates overlap fiscal year "${clash.label}" (${toIsoDate(clash.startDate)} to ${toIsoDate(clash.endDate)}). Fiscal years cannot share a day.`,
      );
  }

  private mapConflict(error: unknown): never {
    if (
      error instanceof Error &&
      error.message.includes('fiscal_years_no_overlap')
    )
      throw new ConflictException('These dates overlap another fiscal year');
    throw error;
  }

  /** The open fiscal year covering a date. Used when issuing a document. */
  async openFor(isoDate: string): Promise<{ id: string; label: string }> {
    const row = await this.prisma.fiscalYear.findFirst({
      where: {
        startDate: { lte: isoToDate(isoDate) },
        endDate: { gte: isoToDate(isoDate) },
      },
      select: { id: true, label: true, status: true },
    });
    if (!row)
      throw new ConflictException(
        'No fiscal year covers today. Create the fiscal year before billing.',
      );
    if (row.status !== 'OPEN')
      throw new ConflictException(`Fiscal year ${row.label} is closed`);
    return { id: row.id, label: row.label };
  }

  /** A shared lock on an open fiscal year: closing it waits for us, and we are refused once it is closed. */
  async lockOpen(tx: Tx, id: string): Promise<{ label: string }> {
    const rows = await tx.$queryRaw<
      { label: string; status: string }[]
    >`SELECT label, status::text AS status FROM fiscal_years WHERE id = ${id}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Fiscal year not found');
    if (row.status !== 'OPEN')
      throw new ConflictException(
        `Fiscal year ${row.label} is closed, so its invoices can no longer be changed`,
      );
    return { label: row.label };
  }
}
