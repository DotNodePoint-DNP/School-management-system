import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatusValue,
} from '../../common/constants/attendance.js';
import {
  dateParts,
  daysBetweenIso,
  isoToDate,
  parseIsoDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  AttendanceAccessService,
  type MarkRights,
} from './attendance-access.service.js';
import { schoolDayInfo } from './calendar.service.js';
import type { ChangeAttendanceDto } from './dto/change-attendance.dto.js';
import type { SubmitAttendanceDto } from './dto/submit-attendance.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const STUDENT_SELECT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullNameNp: true,
} satisfies Prisma.StudentSelect;

export interface RosterEntry {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
  status: AttendanceStatusValue | null;
  note: string | null;
}

export interface RosterResponse {
  academicYearId: string;
  sectionId: string;
  date: string;
  dateBs: string | null;
  isSchoolDay: boolean;
  nonSchoolReason: string | null;
  session: { id: string; takenAt: string; takenByName: string | null } | null;
  /** Can the signed-in user change attendance for this date right now? */
  editableByMe: boolean;
  editWindowDays: number;
  students: RosterEntry[];
}

const sortRoster = (entries: RosterEntry[]): RosterEntry[] =>
  entries.sort(
    (a, b) =>
      (a.rollNo ?? Number.MAX_SAFE_INTEGER) -
        (b.rollNo ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
  );

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly access: AttendanceAccessService,
  ) {}

  async getRoster(
    yearId: string,
    sectionId: string,
    dateRaw: string,
    actor: AuthUser,
  ): Promise<RosterResponse> {
    parseIsoDate(dateRaw, 'date');
    await this.access.assertCanRead(yearId, sectionId, actor);
    const [year, section] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: {
          status: true,
          startDate: true,
          endDate: true,
          attendanceEditWindowDays: true,
        },
      }),
      this.prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!section) throw new NotFoundException('Section not found');

    const date = dateRaw;
    const today = todayIso();
    const insideYear =
      date >= toIsoDate(year.startDate) && date <= toIsoDate(year.endDate);
    const day = insideYear
      ? await schoolDayInfo(this.prisma, yearId, date)
      : { isSchoolDay: false, reason: 'Outside the academic year' };

    const session = await this.prisma.attendanceSession.findUnique({
      where: { sectionId_date: { sectionId, date: isoToDate(date) } },
      select: { id: true, takenAt: true, takenById: true },
    });

    let students: RosterEntry[];
    if (session) {
      const rows = await this.prisma.attendanceRecord.findMany({
        where: { sessionId: session.id },
        select: {
          status: true,
          note: true,
          enrollment: {
            select: {
              id: true,
              rollNo: true,
              student: { select: STUDENT_SELECT },
            },
          },
        },
      });
      students = rows.map((r) => ({
        enrollmentId: r.enrollment.id,
        studentId: r.enrollment.student.id,
        admissionNo: r.enrollment.student.admissionNo,
        name: displayName(r.enrollment.student),
        fullNameNp: r.enrollment.student.fullNameNp,
        rollNo: r.enrollment.rollNo,
        status: r.status,
        note: r.note,
      }));
    } else {
      const rows = await this.eligibleEnrollments(
        this.prisma,
        yearId,
        sectionId,
        date,
      );
      students = rows.map((e) => ({
        enrollmentId: e.id,
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        name: displayName(e.student),
        fullNameNp: e.student.fullNameNp,
        rollNo: e.rollNo,
        status: null,
        note: null,
      }));
    }

    const takenBy = session
      ? await this.prisma.user.findUnique({
          where: { id: session.takenById },
          select: { fullName: true },
        })
      : null;
    const rights = await this.access.tryMarkRights(yearId, sectionId, actor);
    const inWindow =
      date <= today &&
      daysBetweenIso(date, today) <= year.attendanceEditWindowDays;
    const editableByMe =
      year.status === 'ACTIVE' &&
      insideYear &&
      date <= today &&
      day.isSchoolDay &&
      rights !== null &&
      ((rights.canMark && inWindow) || rights.canCorrect);

    return {
      academicYearId: yearId,
      sectionId,
      date,
      dateBs: dateParts(isoToDate(date)).bs,
      isSchoolDay: day.isSchoolDay,
      nonSchoolReason: day.reason,
      session: session
        ? {
            id: session.id,
            takenAt: session.takenAt.toISOString(),
            takenByName: takenBy?.fullName ?? null,
          }
        : null,
      editableByMe,
      editWindowDays: year.attendanceEditWindowDays,
      students: sortRoster(students),
    };
  }

  async submit(
    yearId: string,
    sectionId: string,
    date: string,
    dto: SubmitAttendanceDto,
    actor: AuthUser,
  ): Promise<RosterResponse> {
    parseIsoDate(date, 'date');
    const today = todayIso();
    if (date > today)
      throw new BadRequestException(
        'Attendance cannot be taken for a future date',
      );
    const rights = await this.access.markRights(yearId, sectionId, actor);

    const { sessionId, counts } = await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockYearShared(tx, yearId);
      if (year.status !== 'ACTIVE') {
        throw new ConflictException(
          `Attendance can only be taken in the active academic year (this one is ${year.status.toLowerCase()})`,
        );
      }
      if (date < toIsoDate(year.startDate) || date > toIsoDate(year.endDate)) {
        throw new BadRequestException('This date is outside the academic year');
      }
      const day = await schoolDayInfo(tx, yearId, date);
      if (!day.isSchoolDay) {
        throw new ConflictException(
          `${date} is not a school day (${day.reason}). Add a make-up working day to the calendar if school was open.`,
        );
      }
      const { attendanceEditWindowDays } =
        await tx.academicYear.findUniqueOrThrow({
          where: { id: yearId },
          select: { attendanceEditWindowDays: true },
        });
      this.assertEditAllowed(
        date,
        today,
        attendanceEditWindowDays,
        rights,
        dto.reason,
      );

      // Row lock: two people submitting the same section cannot both succeed, and enrollment changes wait.
      await this.lockSection(tx, sectionId);
      const existing = await tx.attendanceSession.findUnique({
        where: { sectionId_date: { sectionId, date: isoToDate(date) } },
        select: { id: true },
      });
      if (existing)
        throw new ConflictException(
          'Attendance for this section and date was already taken. Edit individual records instead.',
        );

      const eligible = await this.eligibleEnrollments(
        tx,
        yearId,
        sectionId,
        date,
      );
      if (eligible.length === 0)
        throw new BadRequestException(
          'There are no enrolled students to mark in this section on this date',
        );
      const wanted = new Set(eligible.map((e) => e.id));
      const given = new Set(dto.records.map((r) => r.enrollmentId));
      const unknown = [...given].filter((id) => !wanted.has(id)).length;
      const missing = [...wanted].filter((id) => !given.has(id)).length;
      if (given.size !== dto.records.length || unknown > 0 || missing > 0) {
        throw new BadRequestException(
          `The list must contain each of the ${wanted.size} students on this section's roster exactly once (unknown: ${unknown}, missing: ${missing})`,
        );
      }

      const session = await tx.attendanceSession.create({
        data: {
          academicYearId: yearId,
          sectionId,
          date: isoToDate(date),
          takenById: actor.id,
        },
        select: { id: true },
      });
      await tx.attendanceRecord.createMany({
        data: dto.records.map((r) => ({
          sessionId: session.id,
          date: isoToDate(date),
          academicYearId: yearId,
          enrollmentId: r.enrollmentId,
          status: r.status,
          note: r.note || undefined,
          source: 'MANUAL' as const,
        })),
      });
      const tally = Object.fromEntries(
        ATTENDANCE_STATUSES.map((s) => [s, 0]),
      ) as Record<AttendanceStatusValue, number>;
      for (const r of dto.records) tally[r.status] += 1;
      return { sessionId: session.id, counts: tally };
    }, TX);

    // Names, notes and reasons stay out of the audit log on purpose.
    await this.audit.record({
      actor,
      action: 'attendance.taken',
      entityType: 'attendance_session',
      entityId: sessionId,
      details: {
        sectionId,
        date,
        counts,
        outsideWindow:
          daysBetweenIso(date, today) > 0 && dto.reason !== undefined,
      },
    });
    return this.getRoster(yearId, sectionId, date, actor);
  }

  async changeRecord(
    yearId: string,
    sectionId: string,
    date: string,
    enrollmentId: string,
    dto: ChangeAttendanceDto,
    actor: AuthUser,
  ): Promise<{
    enrollmentId: string;
    status: AttendanceStatusValue;
    note: string | null;
    source: string;
    withinWindow: boolean;
  }> {
    parseIsoDate(date, 'date');
    if (dto.status === undefined && dto.note === undefined)
      throw new BadRequestException('Provide a new status, a note, or both');
    const rights = await this.access.markRights(yearId, sectionId, actor);
    const today = todayIso();

    return this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockYearShared(tx, yearId);
      if (year.status !== 'ACTIVE')
        throw new ConflictException(
          'Attendance of a closed academic year cannot be changed',
        );
      const { attendanceEditWindowDays } =
        await tx.academicYear.findUniqueOrThrow({
          where: { id: yearId },
          select: { attendanceEditWindowDays: true },
        });
      const withinWindow = this.assertEditAllowed(
        date,
        today,
        attendanceEditWindowDays,
        rights,
        dto.reason,
      );

      const sessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM attendance_sessions
        WHERE section_id = ${sectionId}::uuid AND date = ${date}::date AND academic_year_id = ${yearId}::uuid
        FOR UPDATE`;
      const session = sessions[0];
      if (!session)
        throw new NotFoundException(
          'Attendance was not taken for this section on this date',
        );

      const record = await tx.attendanceRecord.findUnique({
        where: {
          sessionId_enrollmentId: { sessionId: session.id, enrollmentId },
        },
        select: { status: true, note: true, source: true },
      });
      if (!record)
        throw new NotFoundException(
          'This student has no attendance record for this date',
        );

      const status = dto.status ?? record.status;
      const note =
        dto.note === undefined
          ? record.note
          : dto.note === ''
            ? null
            : dto.note;
      if (status === record.status && note === record.note)
        throw new BadRequestException('Nothing to change');

      const source = withinWindow ? record.source : 'CORRECTION';
      await tx.attendanceRecord.update({
        where: {
          sessionId_enrollmentId: { sessionId: session.id, enrollmentId },
        },
        data: { status, note, source },
      });
      await tx.attendanceChange.create({
        data: {
          sessionId: session.id,
          enrollmentId,
          date: isoToDate(date),
          fromStatus: record.status,
          toStatus: status,
          reason: dto.reason,
          withinWindow,
          changedById: actor.id,
        },
      });
      // Inside the transaction: a correction and its audit event succeed or fail together.
      await this.audit.recordIn(tx, {
        actor,
        action: 'attendance.record_changed',
        entityType: 'attendance_session',
        entityId: session.id,
        details: {
          sectionId,
          date,
          enrollmentId,
          from: record.status,
          to: status,
          withinWindow,
        },
      });
      return { enrollmentId, status, note, source, withinWindow };
    }, TX);
  }

  /**
   * Inside the window the marker may act freely; outside it only a corrector may, and a reason is mandatory.
   * Returns whether the date is inside the window.
   */
  private assertEditAllowed(
    date: string,
    today: string,
    windowDays: number,
    rights: MarkRights,
    reason?: string,
  ): boolean {
    const inWindow = daysBetweenIso(date, today) <= windowDays;
    if (!((rights.canMark && inWindow) || rights.canCorrect)) {
      throw new ForbiddenException(
        'The edit window for this date has passed. Ask someone with attendance correction permission.',
      );
    }
    if (!inWindow && (!reason || reason.length < 10)) {
      throw new BadRequestException(
        'A reason of at least 10 characters is required outside the edit window',
      );
    }
    return inWindow;
  }

  private async lockSection(tx: Tx, sectionId: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM sections WHERE id = ${sectionId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Section not found');
  }

  /** Students currently enrolled in the section, admitted on or before the date, and not already marked elsewhere that day. */
  private eligibleEnrollments(
    db: Pick<Tx, 'enrollment'>,
    yearId: string,
    sectionId: string,
    date: string,
  ) {
    return db.enrollment.findMany({
      where: {
        academicYearId: yearId,
        sectionId,
        status: 'ENROLLED',
        student: { admissionDate: { lte: isoToDate(date) } },
        attendanceRecords: { none: { date: isoToDate(date) } },
      },
      select: { id: true, rollNo: true, student: { select: STUDENT_SELECT } },
    });
  }
}
