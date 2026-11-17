import { BadRequestException, Injectable } from '@nestjs/common';
import {
  addDaysIso,
  adToBsString,
  dateParts,
  daysBetweenIso,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceSummaryService } from '../attendance/attendance-summary.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { PortalAttendanceQueryDto } from './dto/portal.dto.js';
import { PortalAccessService } from './portal-access.service.js';
import { PortalResultsService } from './portal-results.service.js';

const STUDENT_SELECT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullNameNp: true,
  gender: true,
  status: true,
  enrollments: {
    orderBy: { academicYear: { startDate: 'desc' as const } },
    take: 1,
    select: {
      id: true,
      status: true,
      rollNo: true,
      academicYear: { select: { id: true, name: true } },
      section: {
        select: { name: true, schoolClass: { select: { name: true } } },
      },
    },
  },
} as const;

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly attendance: AttendanceSummaryService,
    private readonly results: PortalResultsService,
  ) {}

  /** The parent and the children they may see. */
  async me(actor: AuthUser) {
    const guardian = await this.access.guardianOf(actor);
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: guardian.id, portalAccess: true },
      select: {
        relationship: true,
        isPrimary: true,
        student: { select: STUDENT_SELECT },
      },
    });
    const children = links
      .map((l) => {
        const e = l.student.enrollments[0];
        return {
          id: l.student.id,
          admissionNo: l.student.admissionNo,
          name: displayName(l.student),
          nameNp: l.student.fullNameNp,
          gender: l.student.gender,
          status: l.student.status,
          relationship: l.relationship,
          isPrimary: l.isPrimary,
          current: e
            ? {
                enrollmentId: e.id,
                enrollmentStatus: e.status,
                academicYear: e.academicYear,
                className: e.section.schoolClass.name,
                sectionName: e.section.name,
                rollNo: e.rollNo,
              }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      guardian: { id: guardian.id, name: displayName(guardian) },
      children,
    };
  }

  /** One screen for the whole family: attendance over the last 30 days and the latest released result of each child. */
  async home(actor: AuthUser) {
    const { guardian, children } = await this.me(actor);
    const today = todayIso();
    const from = addDaysIso(today, -29);
    const enrollmentIds = children.flatMap((c) =>
      c.current ? [c.current.enrollmentId] : [],
    );
    const [summaries, latest] = await Promise.all([
      this.attendance.forEnrollments(enrollmentIds, from, today),
      this.results.listForStudents(children.map((c) => c.id)),
    ]);
    return {
      guardian,
      asOf: today,
      asOfBs: adToBsString(today),
      children: children.map((c) => {
        const a = c.current ? summaries.get(c.current.enrollmentId) : undefined;
        const r = (latest.get(c.id) ?? [])[0];
        return {
          ...c,
          attendance: a
            ? {
                from,
                to: today,
                totalDays: a.totalDays,
                present: a.present,
                absent: a.absent,
                late: a.late,
                leave: a.leave,
                percentage: a.percentage,
              }
            : null,
          latestResult: r
            ? {
                scope: r.scope,
                exam: r.exam,
                academicYear: r.academicYear,
                status: r.status,
                percentage: r.percentage,
                version: r.version,
                revised: r.revised,
              }
            : null,
        };
      }),
    };
  }

  async profile(actor: AuthUser, studentId: string) {
    await this.access.requireChild(actor, studentId);
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        middleName: true,
        lastName: true,
        fullNameNp: true,
        gender: true,
        dateOfBirth: true,
        admissionDate: true,
        status: true,
        statusChangedOn: true,
        enrollments: {
          orderBy: { academicYear: { startDate: 'desc' } },
          select: {
            id: true,
            status: true,
            rollNo: true,
            academicYear: { select: { id: true, name: true } },
            section: {
              select: { name: true, schoolClass: { select: { name: true } } },
            },
          },
        },
        // Names and relationships only. Another guardian's phone number or email is never shown here.
        guardians: {
          orderBy: [{ isPrimary: 'desc' }, { guardianId: 'asc' }],
          select: {
            relationship: true,
            isPrimary: true,
            guardian: {
              select: { firstName: true, middleName: true, lastName: true },
            },
          },
        },
      },
    });
    const dob = dateParts(s.dateOfBirth);
    const admitted = dateParts(s.admissionDate);
    const left = s.statusChangedOn ? dateParts(s.statusChangedOn) : null;
    return {
      id: s.id,
      admissionNo: s.admissionNo,
      name: displayName(s),
      nameNp: s.fullNameNp,
      gender: s.gender,
      dateOfBirth: dob.ad,
      dateOfBirthBs: dob.bs,
      admissionDate: admitted.ad,
      admissionDateBs: admitted.bs,
      status: s.status,
      statusChangedOn: left?.ad ?? null,
      statusChangedOnBs: left?.bs ?? null,
      enrollments: s.enrollments.map((e) => ({
        enrollmentId: e.id,
        status: e.status,
        rollNo: e.rollNo,
        academicYear: e.academicYear,
        className: e.section.schoolClass.name,
        sectionName: e.section.name,
      })),
      guardians: s.guardians.map((g) => ({
        name: displayName(g.guardian),
        relationship: g.relationship,
        isPrimary: g.isPrimary,
      })),
    };
  }

  /** Daily statuses, the summary and the school's holidays. No teacher notes and no correction history. */
  async attendanceFor(
    actor: AuthUser,
    studentId: string,
    q: PortalAttendanceQueryDto,
  ) {
    await this.access.requireChild(actor, studentId);
    const enrollment = await this.access.requireEnrollment(
      studentId,
      q.enrollmentId,
    );
    const year = await this.prisma.academicYear.findUniqueOrThrow({
      where: { id: enrollment.academicYearId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        weeklyOffDays: true,
      },
    });
    const today = todayIso();
    const yearStart = toIsoDate(year.startDate);
    const yearEnd = toIsoDate(year.endDate);
    const to =
      resolveDate('to', q.to, undefined) ?? (yearEnd < today ? yearEnd : today);
    if (to > today)
      throw new BadRequestException('The end date cannot be in the future');
    const earliest = addDaysIso(to, -29);
    const from =
      resolveDate('from', q.from, undefined) ??
      (earliest > yearStart ? earliest : yearStart);
    if (from > to)
      throw new BadRequestException('The start date is after the end date');
    if (daysBetweenIso(from, to) > 366)
      throw new BadRequestException('Choose a range of at most one year');

    const range = {
      gte: new Date(`${from}T00:00:00Z`),
      lte: new Date(`${to}T00:00:00Z`),
    };
    const [records, holidays, summary] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { enrollmentId: enrollment.id, date: range },
        orderBy: { date: 'asc' },
        select: { date: true, status: true },
      }),
      this.prisma.calendarEntry.findMany({
        where: { academicYearId: year.id, kind: 'HOLIDAY', date: range },
        orderBy: { date: 'asc' },
        select: { date: true, name: true },
      }),
      this.attendance.forEnrollments([enrollment.id], from, to),
    ]);
    const s = summary.get(enrollment.id);
    return {
      enrollmentId: enrollment.id,
      academicYear: { id: year.id, name: year.name },
      range: { from, to },
      summary: s
        ? {
            totalDays: s.totalDays,
            present: s.present,
            absent: s.absent,
            late: s.late,
            leave: s.leave,
            percentage: s.percentage,
          }
        : null,
      days: records.map((r) => ({
        date: toIsoDate(r.date),
        dateBs: adToBsString(toIsoDate(r.date)),
        status: r.status,
      })),
      holidays: holidays.map((h) => ({
        date: toIsoDate(h.date),
        dateBs: adToBsString(toIsoDate(h.date)),
        name: h.name,
      })),
      weeklyOffDays: year.weeklyOffDays,
    };
  }
}
