import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ATTENDANCE_STATUSES,
  ATTENDED_STATUSES,
  type AttendanceStatusValue,
} from '../../common/constants/attendance.js';
import { CursorPaginated } from '../../common/dto/pagination.dto.js';
import {
  adToBsString,
  daysBetweenIso,
  isoToDate,
  parseIsoDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AttendanceAccessService } from './attendance-access.service.js';
import { schoolDayInfo } from './calendar.service.js';
import type {
  ChangesQueryDto,
  PendingQueryDto,
  ReportRangeQueryDto,
  StudentHistoryQueryDto,
} from './dto/report-query.dto.js';

export type StatusCounts = Record<AttendanceStatusValue, number>;

export interface Summary {
  counts: StatusCounts;
  /** Days on which attendance was recorded for this student. */
  daysRecorded: number;
  /** PRESENT + LATE. */
  attended: number;
  /** attended / daysRecorded, one decimal; null when nothing is recorded. */
  percentage: number | null;
}

const emptyCounts = (): StatusCounts => ({
  PRESENT: 0,
  ABSENT: 0,
  LATE: 0,
  LEAVE: 0,
});

function summarize(counts: StatusCounts): Summary {
  const daysRecorded = ATTENDANCE_STATUSES.reduce((n, s) => n + counts[s], 0);
  const attended = ATTENDED_STATUSES.reduce((n, s) => n + counts[s], 0);
  return {
    counts,
    daysRecorded,
    attended,
    percentage:
      daysRecorded === 0
        ? null
        : Math.round((attended / daysRecorded) * 1000) / 10,
  };
}

const MAX_RANGE_DAYS = 400;

@Injectable()
export class AttendanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AttendanceAccessService,
  ) {}

  async studentHistory(
    studentId: string,
    q: StudentHistoryQueryDto,
    actor: AuthUser,
  ) {
    const scope = await this.access.studentScope(studentId, actor);
    const { from, to } = this.range(q);
    const date: Prisma.DateTimeFilter = {
      ...(from ? { gte: isoToDate(from) } : {}),
      ...(to ? { lte: isoToDate(to) } : {}),
      ...(q.cursor ? { lt: parseIsoDate(q.cursor, 'cursor') } : {}),
    };
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        date,
        enrollment: {
          studentId,
          ...(scope.academicYearId
            ? { academicYearId: scope.academicYearId }
            : {}),
        },
      },
      orderBy: { date: 'desc' },
      take: q.limit + 1,
      select: {
        date: true,
        status: true,
        note: true,
        source: true,
        session: {
          select: {
            section: {
              select: { name: true, schoolClass: { select: { name: true } } },
            },
          },
        },
      },
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const items = page.map((r) => {
      const ad = toIsoDate(r.date);
      return {
        date: ad,
        dateBs: adToBsString(ad),
        status: r.status,
        note: r.note,
        source: r.source,
        className: r.session.section.schoolClass.name,
        sectionName: r.session.section.name,
      };
    });
    return new CursorPaginated(items, {
      limit: q.limit,
      nextCursor: hasMore ? (items.at(-1)?.date ?? null) : null,
    });
  }

  async studentSummary(
    studentId: string,
    q: ReportRangeQueryDto,
    actor: AuthUser,
  ): Promise<Summary> {
    const scope = await this.access.studentScope(studentId, actor);
    const { from, to } = this.range(q);
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        date: {
          ...(from ? { gte: isoToDate(from) } : {}),
          ...(to ? { lte: isoToDate(to) } : {}),
        },
        enrollment: {
          studentId,
          ...(scope.academicYearId
            ? { academicYearId: scope.academicYearId }
            : {}),
        },
      },
      _count: { _all: true },
    });
    const counts = emptyCounts();
    for (const g of grouped) counts[g.status] = g._count._all;
    return summarize(counts);
  }

  async sectionSummary(
    yearId: string,
    sectionId: string,
    q: ReportRangeQueryDto,
    actor: AuthUser,
  ) {
    await this.access.assertCanRead(yearId, sectionId, actor);
    const [year, section] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: { startDate: true, endDate: true },
      }),
      this.prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!section) throw new NotFoundException('Section not found');

    const given = this.range(q);
    const from = given.from ?? toIsoDate(year.startDate);
    const yearEnd = toIsoDate(year.endDate);
    const to = given.to ?? (todayIso() < yearEnd ? todayIso() : yearEnd);
    if (daysBetweenIso(from, to) > MAX_RANGE_DAYS)
      throw new BadRequestException(
        `The range can cover at most ${MAX_RANGE_DAYS} days`,
      );

    const where: Prisma.AttendanceRecordWhereInput = {
      date: { gte: isoToDate(from), lte: isoToDate(to) },
      session: { sectionId, academicYearId: yearId },
    };
    const [perStudent, perDay] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ['enrollmentId', 'status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['date', 'status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const countsByEnrollment = new Map<string, StatusCounts>();
    for (const g of perStudent) {
      const counts = countsByEnrollment.get(g.enrollmentId) ?? emptyCounts();
      counts[g.status] = g._count._all;
      countsByEnrollment.set(g.enrollmentId, counts);
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        OR: [
          { id: { in: [...countsByEnrollment.keys()] } },
          { academicYearId: yearId, sectionId, status: 'ENROLLED' },
        ],
      },
      select: {
        id: true,
        rollNo: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
      },
    });
    const students = enrollments
      .map((e) => ({
        enrollmentId: e.id,
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        name: displayName(e.student),
        rollNo: e.rollNo,
        ...summarize(countsByEnrollment.get(e.id) ?? emptyCounts()),
      }))
      .sort(
        (a, b) =>
          (a.rollNo ?? Number.MAX_SAFE_INTEGER) -
            (b.rollNo ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      );

    const dayMap = new Map<string, StatusCounts>();
    for (const g of perDay) {
      const key = toIsoDate(g.date);
      const counts = dayMap.get(key) ?? emptyCounts();
      counts[g.status] = g._count._all;
      dayMap.set(key, counts);
    }
    const days = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        dateBs: adToBsString(date),
        ...summarize(counts),
      }));

    return {
      academicYearId: yearId,
      sectionId,
      from,
      to,
      daysTaken: days.length,
      students,
      days,
    };
  }

  /** Sections that have not taken attendance yet today (or on a given school day). Office roles only. */
  async pending(q: PendingQueryDto, actor: AuthUser) {
    if (!this.access.isOffice(actor))
      throw new ForbiddenException('You do not have permission to view this');
    const date = resolveDate('date', q.date, q.dateBs) ?? todayIso();
    const year = await this.prisma.academicYear.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, startDate: true, endDate: true },
    });
    const none = (reason: string) => ({
      date,
      academicYearId: year?.id ?? null,
      isSchoolDay: false,
      nonSchoolReason: reason,
      sections: [],
    });
    if (!year) return none('There is no active academic year');
    if (date < toIsoDate(year.startDate) || date > toIsoDate(year.endDate))
      return none('Outside the academic year');
    const day = await schoolDayInfo(this.prisma, year.id, date);
    if (!day.isSchoolDay) return none(day.reason ?? 'Not a school day');

    const enrolled = { academicYearId: year.id, status: 'ENROLLED' as const };
    const sections = await this.prisma.section.findMany({
      where: {
        isActive: true,
        enrollments: { some: enrolled },
        attendanceSessions: {
          none: { academicYearId: year.id, date: isoToDate(date) },
        },
      },
      orderBy: [
        { schoolClass: { sortOrder: 'asc' } },
        { schoolClass: { name: 'asc' } },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        schoolClass: { select: { id: true, name: true } },
        _count: { select: { enrollments: { where: enrolled } } },
        classTeacherAssignments: {
          where: { academicYearId: year.id },
          select: {
            staff: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
    return {
      date,
      academicYearId: year.id,
      isSchoolDay: true,
      nonSchoolReason: null,
      sections: sections.map((s) => ({
        sectionId: s.id,
        sectionName: s.name,
        classId: s.schoolClass.id,
        className: s.schoolClass.name,
        enrolled: s._count.enrollments,
        classTeacher: s.classTeacherAssignments[0]
          ? {
              id: s.classTeacherAssignments[0].staff.id,
              name: displayName(s.classTeacherAssignments[0].staff),
            }
          : null,
      })),
    };
  }

  /** The correction history. Visible to people with read-all or correct permission. */
  async changes(q: ChangesQueryDto, actor: AuthUser) {
    if (
      !actor.permissions.includes('attendance:read-all') &&
      !actor.permissions.includes('attendance:correct')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance corrections',
      );
    }
    const date = resolveDate('date', q.date, q.dateBs);
    const where: Prisma.AttendanceChangeWhereInput = {};
    if (q.studentId) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { studentId: q.studentId },
        select: { id: true },
      });
      where.enrollmentId = { in: enrollments.map((e) => e.id) };
    }
    if (q.sectionId || date) {
      const sessions = await this.prisma.attendanceSession.findMany({
        where: {
          ...(q.sectionId ? { sectionId: q.sectionId } : {}),
          ...(date ? { date: isoToDate(date) } : {}),
        },
        select: { id: true },
      });
      where.sessionId = { in: sessions.map((s) => s.id) };
    }

    const rows = await this.prisma.attendanceChange.findMany({
      where,
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    const [users, enrollments] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(page.map((r) => r.changedById))] } },
        select: { id: true, fullName: true },
      }),
      this.prisma.enrollment.findMany({
        where: { id: { in: [...new Set(page.map((r) => r.enrollmentId))] } },
        select: {
          id: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              middleName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.fullName] as const));
    const student = new Map(enrollments.map((e) => [e.id, e.student] as const));

    const items = page.map((r) => {
      const ad = toIsoDate(r.date);
      const s = student.get(r.enrollmentId);
      return {
        id: r.id,
        date: ad,
        dateBs: adToBsString(ad),
        changedAt: r.changedAt.toISOString(),
        changedByName: userName.get(r.changedById) ?? null,
        studentId: s?.id ?? null,
        admissionNo: s?.admissionNo ?? null,
        studentName: s ? displayName(s) : null,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        reason: r.reason,
        withinWindow: r.withinWindow,
      };
    });
    return new CursorPaginated(items, {
      limit: q.limit,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    });
  }

  private range(q: ReportRangeQueryDto): { from?: string; to?: string } {
    const from = resolveDate('from', q.from, q.fromBs);
    const to = resolveDate('to', q.to, q.toBs);
    if (from && to && from > to)
      throw new BadRequestException('"from" is after "to"');
    return { from, to };
  }
}
