import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDaysIso,
  dateParts,
  daysBetweenIso,
  isoToDate,
  requireDate,
  resolveDate,
  toIsoDate,
  weekdayOf,
} from '../../common/utils/bs-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreateCalendarEntryDto,
  UpdateCalendarSettingsDto,
} from './dto/calendar.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const ENTRY_SELECT = {
  id: true,
  date: true,
  kind: true,
  name: true,
} satisfies Prisma.CalendarEntrySelect;

export interface CalendarEntryResponse {
  id: string;
  date: string;
  dateBs: string | null;
  kind: 'HOLIDAY' | 'WORKING_DAY';
  name: string;
}
export interface CalendarResponse {
  academicYearId: string;
  weeklyOffDays: number[];
  attendanceEditWindowDays: number;
  entries: CalendarEntryResponse[];
}

const toEntry = (
  e: Prisma.CalendarEntryGetPayload<{ select: typeof ENTRY_SELECT }>,
): CalendarEntryResponse => {
  const d = dateParts(e.date);
  return { id: e.id, date: d.ad, dateBs: d.bs, kind: e.kind, name: e.name };
};

/** Is this date a school day? Holidays and weekly off days say no; a declared make-up working day says yes. */
export async function schoolDayInfo(
  db: Pick<Tx, 'academicYear' | 'calendarEntry'>,
  yearId: string,
  date: string,
): Promise<{ isSchoolDay: boolean; reason: string | null }> {
  const [year, entry] = await Promise.all([
    db.academicYear.findUniqueOrThrow({
      where: { id: yearId },
      select: { weeklyOffDays: true },
    }),
    db.calendarEntry.findUnique({
      where: {
        academicYearId_date: { academicYearId: yearId, date: isoToDate(date) },
      },
      select: { kind: true, name: true },
    }),
  ]);
  if (entry?.kind === 'HOLIDAY')
    return { isSchoolDay: false, reason: entry.name };
  if (entry?.kind === 'WORKING_DAY') return { isSchoolDay: true, reason: null };
  return year.weeklyOffDays.includes(weekdayOf(date))
    ? { isSchoolDay: false, reason: 'Weekly off day' }
    : { isSchoolDay: true, reason: null };
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
  ) {}

  async get(yearId: string): Promise<CalendarResponse> {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: yearId },
      select: { id: true, weeklyOffDays: true, attendanceEditWindowDays: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    const entries = await this.prisma.calendarEntry.findMany({
      where: { academicYearId: yearId },
      orderBy: { date: 'asc' },
      select: ENTRY_SELECT,
    });
    return {
      academicYearId: yearId,
      weeklyOffDays: year.weeklyOffDays,
      attendanceEditWindowDays: year.attendanceEditWindowDays,
      entries: entries.map(toEntry),
    };
  }

  async updateSettings(
    yearId: string,
    dto: UpdateCalendarSettingsDto,
    actor: AuthUser,
  ): Promise<CalendarResponse> {
    const changed = await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId); // exclusive: waits for attendance in progress; rejects closed years
      const data: Prisma.AcademicYearUpdateInput = {};
      if (dto.weeklyOffDays !== undefined)
        data.weeklyOffDays = [...dto.weeklyOffDays].sort();
      if (dto.attendanceEditWindowDays !== undefined)
        data.attendanceEditWindowDays = dto.attendanceEditWindowDays;
      await tx.academicYear.update({ where: { id: yearId }, data });
      return Object.keys(data);
    }, TX);
    await this.audit.record({
      actor,
      action: 'calendar.settings_updated',
      entityType: 'academic_year',
      entityId: yearId,
      details: { changedFields: changed },
    });
    return this.get(yearId);
  }

  async addEntries(
    yearId: string,
    dto: CreateCalendarEntryDto,
    actor: AuthUser,
  ): Promise<CalendarEntryResponse[]> {
    const start = requireDate('startDate', dto.startDate, dto.startDateBs);
    const end = resolveDate('endDate', dto.endDate, dto.endDateBs) ?? start;
    if (end < start)
      throw new BadRequestException('The end date is before the start date');
    if (daysBetweenIso(start, end) > 30)
      throw new BadRequestException('A range can cover at most 31 days');
    const dates = Array.from(
      { length: daysBetweenIso(start, end) + 1 },
      (_, i) => addDaysIso(start, i),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockWritableYear(tx, yearId);
      if (start < toIsoDate(year.startDate) || end > toIsoDate(year.endDate)) {
        throw new BadRequestException(
          `Calendar entries must fall within the academic year (${toIsoDate(year.startDate)} to ${toIsoDate(year.endDate)})`,
        );
      }
      const range = { gte: isoToDate(start), lte: isoToDate(end) };
      const existing = await tx.calendarEntry.findFirst({
        where: { academicYearId: yearId, date: range },
        select: { date: true },
      });
      if (existing)
        throw new ConflictException(
          `There is already a calendar entry on ${toIsoDate(existing.date)}`,
        );

      if (dto.kind === 'WORKING_DAY') {
        const { weeklyOffDays } = await tx.academicYear.findUniqueOrThrow({
          where: { id: yearId },
          select: { weeklyOffDays: true },
        });
        const notOff = dates.find((d) => !weeklyOffDays.includes(weekdayOf(d)));
        if (notOff)
          throw new BadRequestException(
            `${notOff} is already a working day; a working-day entry only makes sense on a weekly off day`,
          );
      } else {
        const session = await tx.attendanceSession.findFirst({
          where: { academicYearId: yearId, date: range },
          select: { date: true },
        });
        if (session)
          throw new ConflictException(
            `Attendance was already taken on ${toIsoDate(session.date)}, so it cannot become a holiday`,
          );
      }
      await tx.calendarEntry.createMany({
        data: dates.map((d) => ({
          academicYearId: yearId,
          date: isoToDate(d),
          kind: dto.kind,
          name: dto.name,
        })),
      });
      return tx.calendarEntry.findMany({
        where: { academicYearId: yearId, date: range },
        orderBy: { date: 'asc' },
        select: ENTRY_SELECT,
      });
    }, TX);

    await this.audit.record({
      actor,
      action: 'calendar.entries_added',
      entityType: 'academic_year',
      entityId: yearId,
      details: {
        kind: dto.kind,
        name: dto.name,
        startDate: start,
        endDate: end,
        days: dates.length,
      },
    });
    return created.map(toEntry);
  }

  async removeEntry(
    yearId: string,
    entryId: string,
    actor: AuthUser,
  ): Promise<void> {
    const entry = await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId);
      const found = await tx.calendarEntry.findFirst({
        where: { id: entryId, academicYearId: yearId },
        select: ENTRY_SELECT,
      });
      if (!found) throw new NotFoundException('Calendar entry not found');
      if (found.kind === 'WORKING_DAY') {
        const session = await tx.attendanceSession.findFirst({
          where: { academicYearId: yearId, date: found.date },
          select: { id: true },
        });
        if (session)
          throw new ConflictException(
            'Attendance was taken on this make-up day, so the entry cannot be removed',
          );
      }
      await tx.calendarEntry.delete({ where: { id: entryId } });
      return found;
    }, TX);
    await this.audit.record({
      actor,
      action: 'calendar.entry_removed',
      entityType: 'academic_year',
      entityId: yearId,
      details: { date: toIsoDate(entry.date), kind: entry.kind },
    });
  }
}
