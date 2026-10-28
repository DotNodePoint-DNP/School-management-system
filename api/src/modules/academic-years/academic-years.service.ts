import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  dateParts,
  isoToDate,
  requireDate,
  resolveDate,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { AdjustDatesDto } from './dto/adjust-dates.dto.js';
import type { CreateAcademicYearDto } from './dto/create-academic-year.dto.js';
import type { CreateTermDto } from './dto/create-term.dto.js';
import type { UpdateAcademicYearDto } from './dto/update-academic-year.dto.js';
import type { UpdateTermDto } from './dto/update-term.dto.js';

type Tx = Prisma.TransactionClient;

// The remote database makes round trips slow; give interactive transactions room.
const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const CLOSED_MESSAGE =
  'This academic year is closed and can no longer be changed';

const TERM_SELECT = {
  id: true,
  name: true,
  sequence: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.TermSelect;

const YEAR_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  terms: { orderBy: { sequence: 'asc' }, select: TERM_SELECT },
} satisfies Prisma.AcademicYearSelect;

const YEAR_CORE_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
} satisfies Prisma.AcademicYearSelect;

type TermRow = Prisma.TermGetPayload<{ select: typeof TERM_SELECT }>;
type YearRow = Prisma.AcademicYearGetPayload<{ select: typeof YEAR_SELECT }>;
export type YearCore = Prisma.AcademicYearGetPayload<{
  select: typeof YEAR_CORE_SELECT;
}>;

export interface TermResponse {
  id: string;
  name: string;
  sequence: number;
  startDate: string;
  startDateBs: string | null;
  endDate: string;
  endDateBs: string | null;
}

export interface AcademicYearResponse {
  id: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'CLOSED';
  startDate: string;
  startDateBs: string | null;
  endDate: string;
  endDateBs: string | null;
  terms: TermResponse[];
}

function toTermResponse(term: TermRow): TermResponse {
  const start = dateParts(term.startDate);
  const end = dateParts(term.endDate);
  return {
    id: term.id,
    name: term.name,
    sequence: term.sequence,
    startDate: start.ad,
    startDateBs: start.bs,
    endDate: end.ad,
    endDateBs: end.bs,
  };
}

function toYearResponse(year: YearRow): AcademicYearResponse {
  const start = dateParts(year.startDate);
  const end = dateParts(year.endDate);
  return {
    id: year.id,
    name: year.name,
    status: year.status,
    startDate: start.ad,
    startDateBs: start.bs,
    endDate: end.ad,
    endDateBs: end.bs,
    terms: year.terms.map(toTermResponse),
  };
}

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AcademicYearResponse[]> {
    const rows = await this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: YEAR_SELECT,
    });
    return rows.map(toYearResponse);
  }

  async get(id: string): Promise<AcademicYearResponse> {
    const row = await this.prisma.academicYear.findUnique({
      where: { id },
      select: YEAR_SELECT,
    });
    if (!row) throw new NotFoundException('Academic year not found');
    return toYearResponse(row);
  }

  async create(
    dto: CreateAcademicYearDto,
    actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    const start = requireDate('startDate', dto.startDate, dto.startDateBs);
    const end = requireDate('endDate', dto.endDate, dto.endDateBs);
    if (end <= start)
      throw new BadRequestException('End date must be after the start date');

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockYears(tx);
        await this.assertNoYearOverlap(tx, start, end);
        return tx.academicYear.create({
          data: {
            name: dto.name,
            startDate: isoToDate(start),
            endDate: isoToDate(end),
          },
          select: YEAR_SELECT,
        });
      }, TX);
      await this.audit.record({
        actor,
        action: 'academic-year.created',
        entityType: 'academic_year',
        entityId: row.id,
        details: { name: row.name, startDate: start, endDate: end },
      });
      return toYearResponse(row);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async update(
    id: string,
    dto: UpdateAcademicYearDto,
    actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    const start = resolveDate('startDate', dto.startDate, dto.startDateBs);
    const end = resolveDate('endDate', dto.endDate, dto.endDateBs);
    const datesGiven = start !== undefined || end !== undefined;

    try {
      const { row, changed } = await this.prisma.$transaction(async (tx) => {
        await this.lockYears(tx);
        await this.lockYearRow(tx, id);
        const year = await this.requireYearIn(tx, id);
        if (year.status === 'CLOSED')
          throw new ConflictException(CLOSED_MESSAGE);
        if (datesGiven && year.status !== 'PLANNED') {
          throw new ConflictException(
            'The dates of an active academic year are frozen. Use the adjust-dates operation, which requires a reason.',
          );
        }

        const data: Prisma.AcademicYearUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (datesGiven) {
          const newStart = start ?? toIsoDate(year.startDate);
          const newEnd = end ?? toIsoDate(year.endDate);
          await this.assertRangeAllowed(tx, id, newStart, newEnd);
          data.startDate = isoToDate(newStart);
          data.endDate = isoToDate(newEnd);
        }
        const updated = await tx.academicYear.update({
          where: { id },
          data,
          select: YEAR_SELECT,
        });
        return { row: updated, changed: Object.keys(data) };
      }, TX);

      await this.audit.record({
        actor,
        action: 'academic-year.updated',
        entityType: 'academic_year',
        entityId: id,
        details: { changedFields: changed },
      });
      return toYearResponse(row);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async adjustDates(
    id: string,
    dto: AdjustDatesDto,
    actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    const start = resolveDate('startDate', dto.startDate, dto.startDateBs);
    const end = resolveDate('endDate', dto.endDate, dto.endDateBs);
    if (start === undefined && end === undefined) {
      throw new BadRequestException(
        'Provide a new start date, a new end date, or both',
      );
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockYears(tx);
        await this.lockYearRow(tx, id);
        const year = await this.requireYearIn(tx, id);
        if (year.status === 'CLOSED')
          throw new ConflictException(CLOSED_MESSAGE);
        if (year.status !== 'ACTIVE') {
          throw new ConflictException(
            'Only an active academic year uses this operation; edit a planned year directly',
          );
        }

        const before = {
          startDate: toIsoDate(year.startDate),
          endDate: toIsoDate(year.endDate),
        };
        const after = {
          startDate: start ?? before.startDate,
          endDate: end ?? before.endDate,
        };
        if (
          after.startDate === before.startDate &&
          after.endDate === before.endDate
        ) {
          throw new BadRequestException('The dates are unchanged');
        }
        await this.assertRangeAllowed(tx, id, after.startDate, after.endDate);

        const updated = await tx.academicYear.update({
          where: { id },
          data: {
            startDate: isoToDate(after.startDate),
            endDate: isoToDate(after.endDate),
          },
          select: YEAR_SELECT,
        });
        // Inside the transaction: the change and its audit record succeed or fail together.
        await this.audit.recordIn(tx, {
          actor,
          action: 'academic-year.dates_adjusted',
          entityType: 'academic_year',
          entityId: id,
          details: { name: year.name, reason: dto.reason, before, after },
        });
        return updated;
      }, TX);
      return toYearResponse(row);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async activate(id: string, actor: AuthUser): Promise<AcademicYearResponse> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockYears(tx);
        await this.lockYearRow(tx, id);
        const year = await this.requireYearIn(tx, id);
        if (year.status !== 'PLANNED') {
          throw new ConflictException(
            `Only a planned academic year can be activated (this one is ${year.status.toLowerCase()})`,
          );
        }
        const active = await tx.academicYear.findFirst({
          where: { status: 'ACTIVE' },
          select: { name: true },
        });
        if (active)
          throw new ConflictException(
            `Academic year "${active.name}" is still active. Close it first.`,
          );

        const updated = await tx.academicYear.update({
          where: { id },
          data: { status: 'ACTIVE' },
          select: YEAR_SELECT,
        });
        await this.audit.recordIn(tx, {
          actor,
          action: 'academic-year.activated',
          entityType: 'academic_year',
          entityId: id,
          details: { name: year.name },
        });
        return updated;
      }, TX);
      return toYearResponse(row);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async close(id: string, actor: AuthUser): Promise<AcademicYearResponse> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockYearRow(tx, id);
        const year = await this.requireYearIn(tx, id);
        if (year.status !== 'ACTIVE') {
          throw new ConflictException(
            `Only an active academic year can be closed (this one is ${year.status.toLowerCase()})`,
          );
        }
        const updated = await tx.academicYear.update({
          where: { id },
          data: { status: 'CLOSED' },
          select: YEAR_SELECT,
        });
        await this.audit.recordIn(tx, {
          actor,
          action: 'academic-year.closed',
          entityType: 'academic_year',
          entityId: id,
          details: { name: year.name },
        });
        return updated;
      }, TX);
      return toYearResponse(row);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const name = await this.prisma.$transaction(async (tx) => {
      await this.lockYearRow(tx, id);
      const year = await this.requireYearIn(tx, id);
      if (year.status !== 'PLANNED')
        throw new ConflictException(
          'Only a planned academic year can be deleted',
        );
      const [
        terms,
        curriculum,
        classTeachers,
        enrolments,
        calendar,
        sessions,
        exams,
        resultPolicies,
        promotionRun,
      ] = await Promise.all([
        tx.term.count({ where: { academicYearId: id } }),
        tx.classSubject.count({ where: { academicYearId: id } }),
        tx.classTeacherAssignment.count({ where: { academicYearId: id } }),
        tx.enrollment.count({ where: { academicYearId: id } }),
        tx.calendarEntry.count({ where: { academicYearId: id } }),
        tx.attendanceSession.count({ where: { academicYearId: id } }),
        tx.exam.count({ where: { academicYearId: id } }),
        tx.resultPolicy.count({ where: { academicYearId: id } }),
        tx.promotionRun.count({
          where: { OR: [{ fromYearId: id }, { toYearId: id }] },
        }),
      ]);
      if (
        terms +
          curriculum +
          classTeachers +
          enrolments +
          calendar +
          sessions +
          exams +
          resultPolicies +
          promotionRun >
        0
      ) {
        throw new ConflictException(
          "Remove this academic year's terms, curriculum, teacher assignments, enrollments, calendar, exams , result policies or promotion runs first",
        );
      }
      await tx.academicYear.delete({ where: { id } });
      return year.name;
    }, TX);
    await this.audit.record({
      actor,
      action: 'academic-year.deleted',
      entityType: 'academic_year',
      entityId: id,
      details: { name },
    });
  }

  async createTerm(
    yearId: string,
    dto: CreateTermDto,
    actor: AuthUser,
  ): Promise<TermResponse> {
    const start = requireDate('startDate', dto.startDate, dto.startDateBs);
    const end = requireDate('endDate', dto.endDate, dto.endDateBs);

    try {
      const term = await this.prisma.$transaction(async (tx) => {
        const year = await this.lockWritableYear(tx, yearId);
        await this.assertTermRange(tx, year, start, end);
        return tx.term.create({
          data: {
            academicYearId: yearId,
            name: dto.name,
            sequence: dto.sequence,
            startDate: isoToDate(start),
            endDate: isoToDate(end),
          },
          select: TERM_SELECT,
        });
      }, TX);
      await this.audit.record({
        actor,
        action: 'term.created',
        entityType: 'term',
        entityId: term.id,
        details: {
          academicYearId: yearId,
          name: term.name,
          startDate: start,
          endDate: end,
        },
      });
      return toTermResponse(term);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async updateTerm(
    yearId: string,
    termId: string,
    dto: UpdateTermDto,
    actor: AuthUser,
  ): Promise<TermResponse> {
    const start = resolveDate('startDate', dto.startDate, dto.startDateBs);
    const end = resolveDate('endDate', dto.endDate, dto.endDateBs);

    try {
      const { term, changed } = await this.prisma.$transaction(async (tx) => {
        const year = await this.lockWritableYear(tx, yearId);
        const current = await tx.term.findFirst({
          where: { id: termId, academicYearId: yearId },
          select: TERM_SELECT,
        });
        if (!current) throw new NotFoundException('Term not found');

        const data: Prisma.TermUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.sequence !== undefined) data.sequence = dto.sequence;
        if (start !== undefined || end !== undefined) {
          const newStart = start ?? toIsoDate(current.startDate);
          const newEnd = end ?? toIsoDate(current.endDate);
          await this.assertTermRange(tx, year, newStart, newEnd, termId);
          data.startDate = isoToDate(newStart);
          data.endDate = isoToDate(newEnd);
        }
        const updated = await tx.term.update({
          where: { id: termId },
          data,
          select: TERM_SELECT,
        });
        return { term: updated, changed: Object.keys(data) };
      }, TX);

      await this.audit.record({
        actor,
        action: 'term.updated',
        entityType: 'term',
        entityId: termId,
        details: { academicYearId: yearId, changedFields: changed },
      });
      return toTermResponse(term);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async removeTerm(
    yearId: string,
    termId: string,
    actor: AuthUser,
  ): Promise<void> {
    const name = await this.prisma.$transaction(async (tx) => {
      await this.lockWritableYear(tx, yearId);
      const usedByExams = await tx.exam.count({ where: { termId } });
      if (usedByExams > 0)
        throw new ConflictException(
          `${usedByExams} exam(s) use this term. Detach them first.`,
        );
      const term = await tx.term.findFirst({
        where: { id: termId, academicYearId: yearId },
        select: { name: true },
      });
      if (!term) throw new NotFoundException('Term not found');
      await tx.term.delete({ where: { id: termId } });
      return term.name;
    }, TX);
    await this.audit.record({
      actor,
      action: 'term.deleted',
      entityType: 'term',
      entityId: termId,
      details: { academicYearId: yearId, name },
    });
  }

  /**
   * Locks the academic year row and rejects the write if the year is closed.
   * EVERY write that belongs to a year (terms, curriculum, ...) must go through this inside its transaction.
   */
  async lockWritableYear(tx: Tx, yearId: string): Promise<YearCore> {
    await this.lockYearRow(tx, yearId);
    const year = await this.requireYearIn(tx, yearId);
    if (year.status === 'CLOSED') throw new ConflictException(CLOSED_MESSAGE);
    return year;
  }

  /**
   * A SHARED lock on the year: attendance for many sections can proceed in parallel,
   * while exclusive operations (closing the year, editing the calendar) wait for them.
   */
  async lockYearShared(tx: Tx, yearId: string): Promise<YearCore> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM academic_years WHERE id = ${yearId}::uuid FOR SHARE`;
    if (rows.length === 0)
      throw new NotFoundException('Academic year not found');
    return this.requireYearIn(tx, yearId);
  }
  /** Serialises changes that could make academic years overlap each other. */
  private async lockYears(tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('academic_years'))`;
  }

  /** Row lock: serialises writes within one year, and makes later reads see the latest committed state. */
  private async lockYearRow(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM academic_years WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0)
      throw new NotFoundException('Academic year not found');
  }

  private async requireYearIn(tx: Tx, id: string): Promise<YearCore> {
    const year = await tx.academicYear.findUnique({
      where: { id },
      select: YEAR_CORE_SELECT,
    });
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  private async assertNoYearOverlap(
    tx: Tx,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await tx.academicYear.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: isoToDate(end) },
        endDate: { gte: isoToDate(start) },
      },
      select: { name: true, startDate: true, endDate: true },
    });
    if (clash) {
      throw new ConflictException(
        `These dates overlap academic year "${clash.name}" (${toIsoDate(clash.startDate)} to ${toIsoDate(clash.endDate)}). Years cannot share a day.`,
      );
    }
  }

  private async assertRangeAllowed(
    tx: Tx,
    yearId: string,
    start: string,
    end: string,
  ): Promise<void> {
    if (end <= start)
      throw new BadRequestException('End date must be after the start date');
    await this.assertNoYearOverlap(tx, start, end, yearId);
    const outside = await tx.term.findFirst({
      where: {
        academicYearId: yearId,
        OR: [
          { startDate: { lt: isoToDate(start) } },
          { endDate: { gt: isoToDate(end) } },
        ],
      },
      select: { name: true },
    });
    if (outside) {
      throw new ConflictException(
        `Term "${outside.name}" would fall outside the new dates. Adjust the term first.`,
      );
    }
  }

  private async assertTermRange(
    tx: Tx,
    year: YearCore,
    start: string,
    end: string,
    excludeTermId?: string,
  ): Promise<void> {
    if (end <= start)
      throw new BadRequestException(
        'Term end date must be after its start date',
      );
    const yearStart = toIsoDate(year.startDate);
    const yearEnd = toIsoDate(year.endDate);
    if (start < yearStart || end > yearEnd) {
      throw new BadRequestException(
        `A term must fall within its academic year (${yearStart} to ${yearEnd})`,
      );
    }
    const clash = await tx.term.findFirst({
      where: {
        academicYearId: year.id,
        ...(excludeTermId ? { id: { not: excludeTermId } } : {}),
        startDate: { lte: isoToDate(end) },
        endDate: { gte: isoToDate(start) },
      },
      select: { name: true },
    });
    if (clash)
      throw new ConflictException(
        `These dates overlap the term "${clash.name}"`,
      );
  }

  /** The service checks above give clear messages; these database constraints are the backstop. */
  private mapConflict(error: unknown): never {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('academic_years_no_overlap')) {
      throw new ConflictException('These dates overlap another academic year');
    }
    if (message.includes('terms_no_overlap')) {
      throw new ConflictException(
        'These dates overlap another term in this academic year',
      );
    }
    if (message.includes('academic_years_one_active')) {
      throw new ConflictException('Another academic year is already active');
    }
    throw error;
  }
}
