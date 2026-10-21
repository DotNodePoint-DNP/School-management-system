import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toIsoDate } from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClassesService } from '../classes/classes.service.js';
import type {
  AssignRollNumbersDto,
  MoveEnrollmentDto,
  PlacementDto,
} from './dto/enrollment.dto.js';
import { StudentAccessService } from './student-access.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const ENROLLMENT_SELECT = {
  id: true,
  studentId: true,
  academicYearId: true,
  classId: true,
  sectionId: true,
  rollNo: true,
  status: true,
  statusChangedOn: true,
  student: {
    select: {
      admissionNo: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
  section: { select: { name: true, schoolClass: { select: { name: true } } } },
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentRow = Prisma.EnrollmentGetPayload<{
  select: typeof ENROLLMENT_SELECT;
}>;

export interface EnrollmentResponse {
  id: string;
  studentId: string;
  admissionNo: string;
  studentName: string;
  academicYearId: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  rollNo: number | null;
  status: string;
  statusChangedOn: string | null;
}

export interface RollListItem {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
}

export interface OccupancyItem {
  sectionId: string;
  sectionName: string;
  classId: string;
  className: string;
  isActive: boolean;
  capacity: number | null;
  enrolled: number;
}

interface LockedSection {
  id: string;
  classId: string;
  isActive: boolean;
  capacity: number | null;
}

export const toEnrollmentResponse = (r: EnrollmentRow): EnrollmentResponse => ({
  id: r.id,
  studentId: r.studentId,
  admissionNo: r.student.admissionNo,
  studentName: displayName(r.student),
  academicYearId: r.academicYearId,
  classId: r.classId,
  className: r.section.schoolClass.name,
  sectionId: r.sectionId,
  sectionName: r.section.name,
  rollNo: r.rollNo,
  status: r.status,
  statusChangedOn: r.statusChangedOn ? toIsoDate(r.statusChangedOn) : null,
});

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly classes: ClassesService,
    private readonly access: StudentAccessService,
  ) {}

  /** The given year, or the active one. */
  async resolveYearId(requested?: string): Promise<string> {
    if (requested) return requested;
    const active = await this.prisma.academicYear.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (!active)
      throw new BadRequestException(
        'There is no active academic year. Specify academicYearId.',
      );
    return active.id;
  }

  async enroll(
    studentId: string,
    dto: PlacementDto,
    actor: AuthUser,
  ): Promise<EnrollmentResponse> {
    const academicYearId = await this.resolveYearId(dto.academicYearId);
    const row = await this.prisma.$transaction(
      (tx) =>
        this.enrollInTx(tx, {
          studentId,
          academicYearId,
          sectionId: dto.sectionId,
          rollNo: dto.rollNo,
        }),
      TX,
    );
    await this.recordCreated(row, actor);
    return toEnrollmentResponse(row);
  }

  /**
   * Places a student in a section. Runs inside the caller's transaction, so an admission and its seat
   * succeed or fail together. Lock order: academic year, section, class, student.
   */
  async enrollInTx(
    tx: Tx,
    p: {
      studentId: string;
      academicYearId: string;
      sectionId: string;
      rollNo?: number;
    },
  ): Promise<EnrollmentRow> {
    await this.years.lockWritableYear(tx, p.academicYearId); // rejects closed years
    const section = await this.lockSection(tx, p.sectionId);
    if (!section.isActive)
      throw new ConflictException('This section is inactive');
    await this.classes.lockActiveClassForUse(tx, section.classId);

    const students = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM students WHERE id = ${p.studentId}::uuid FOR UPDATE`;
    const student = students[0];
    if (!student) throw new NotFoundException('Student not found');
    if (student.status !== 'ACTIVE') {
      throw new ConflictException(
        `Only active students can be enrolled (this student is ${student.status.toLowerCase()})`,
      );
    }

    const existing = await tx.enrollment.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: p.studentId,
          academicYearId: p.academicYearId,
        },
      },
      select: { id: true, status: true },
    });
    if (existing?.status === 'ENROLLED')
      throw new ConflictException(
        'This student is already enrolled in this academic year',
      );

    await this.assertSeatFree(tx, section, p.academicYearId);
    const rollNo = await this.pickRollNo(
      tx,
      p.academicYearId,
      section.id,
      p.rollNo,
    );

    const data = {
      classId: section.classId,
      sectionId: section.id,
      rollNo,
      status: 'ENROLLED' as const,
      statusChangedOn: null,
    };
    // A student who left and came back reuses their row for that year instead of creating a duplicate.
    return existing
      ? tx.enrollment.update({
          where: { id: existing.id },
          data,
          select: ENROLLMENT_SELECT,
        })
      : tx.enrollment.create({
          data: {
            studentId: p.studentId,
            academicYearId: p.academicYearId,
            ...data,
          },
          select: ENROLLMENT_SELECT,
        });
  }

  async recordCreated(row: EnrollmentRow, actor: AuthUser): Promise<void> {
    await this.audit.record({
      actor,
      action: 'enrollment.created',
      entityType: 'enrollment',
      entityId: row.id,
      details: {
        studentId: row.studentId,
        academicYearId: row.academicYearId,
        sectionId: row.sectionId,
        rollNo: row.rollNo,
      },
    });
  }

  async move(
    enrollmentId: string,
    dto: MoveEnrollmentDto,
    actor: AuthUser,
  ): Promise<EnrollmentResponse> {
    const { row, from } = await this.prisma.$transaction(async (tx) => {
      const found = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { academicYearId: true },
      });
      if (!found) throw new NotFoundException('Enrollment not found');
      await this.years.lockWritableYear(tx, found.academicYearId);

      // Read again after the lock: a status change may have run first.
      const current = await tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        select: {
          academicYearId: true,
          classId: true,
          sectionId: true,
          status: true,
        },
      });
      if (current.status !== 'ENROLLED')
        throw new ConflictException('Only a current enrollment can be moved');
      if (dto.sectionId === current.sectionId) {
        throw new BadRequestException(
          'The student is already in this section. To change only the roll number, use the roll-number endpoint.',
        );
      }

      // Both sections are locked in id order so two simultaneous moves cannot deadlock.
      const locked = new Map<string, LockedSection>();
      for (const id of [current.sectionId, dto.sectionId].sort())
        locked.set(id, await this.lockSection(tx, id));
      const destination = locked.get(dto.sectionId) as LockedSection;

      if (destination.classId !== current.classId) {
        throw new BadRequestException(
          'A student can only be moved between sections of the same class',
        );
      }
      if (!destination.isActive)
        throw new ConflictException('The destination section is inactive');
      await this.classes.lockActiveClassForUse(tx, destination.classId);
      await this.assertSeatFree(tx, destination, current.academicYearId);
      const rollNo = await this.pickRollNo(
        tx,
        current.academicYearId,
        destination.id,
        dto.rollNo,
      );

      const updated = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { sectionId: destination.id, rollNo },
        select: ENROLLMENT_SELECT,
      });
      return { row: updated, from: current.sectionId };
    }, TX);

    await this.audit.record({
      actor,
      action: 'enrollment.moved',
      entityType: 'enrollment',
      entityId: enrollmentId,
      details: {
        fromSectionId: from,
        toSectionId: row.sectionId,
        rollNo: row.rollNo,
      },
    });
    return toEnrollmentResponse(row);
  }

  async setRollNumber(
    enrollmentId: string,
    rollNo: number,
    actor: AuthUser,
  ): Promise<EnrollmentResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      const found = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { academicYearId: true, sectionId: true },
      });
      if (!found) throw new NotFoundException('Enrollment not found');
      await this.years.lockWritableYear(tx, found.academicYearId);
      await this.lockSection(tx, found.sectionId);

      const current = await tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        select: { status: true },
      });
      if (current.status !== 'ENROLLED')
        throw new ConflictException(
          'Only a current enrollment can be given a roll number',
        );
      await this.assertRollFree(
        tx,
        found.academicYearId,
        found.sectionId,
        rollNo,
        enrollmentId,
      );
      return tx.enrollment.update({
        where: { id: enrollmentId },
        data: { rollNo },
        select: ENROLLMENT_SELECT,
      });
    }, TX);

    await this.audit.record({
      actor,
      action: 'enrollment.roll_assigned',
      entityType: 'enrollment',
      entityId: enrollmentId,
      details: { mode: 'single', rollNo },
    });
    return toEnrollmentResponse(row);
  }

  async assignRollNumbers(
    yearId: string,
    sectionId: string,
    dto: AssignRollNumbersDto,
    actor: AuthUser,
  ): Promise<RollListItem[]> {
    await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId);
      await this.lockSection(tx, sectionId);
      await this.applyRollOrder(tx, yearId, sectionId, dto.order);
    }, TX);
    await this.audit.record({
      actor,
      action: 'enrollment.roll_assigned',
      entityType: 'section',
      entityId: sectionId,
      details: {
        mode: 'ordered_list',
        academicYearId: yearId,
        count: dto.order.length,
      },
    });
    return this.rollList(yearId, sectionId);
  }

  /**
   * THE roll-number engine: gives the section's current enrollments 1..n in the order supplied.
   * Manual reordering calls it with the clerk's list; promotion will call it with the final-term ranking.
   * The caller must already hold the year lock (lockWritableYear) and the section lock.
   */
  async applyRollOrder(
    tx: Tx,
    yearId: string,
    sectionId: string,
    orderedEnrollmentIds: string[],
  ): Promise<void> {
    const enrolled = await tx.enrollment.findMany({
      where: { academicYearId: yearId, sectionId, status: 'ENROLLED' },
      select: { id: true },
    });
    const known = new Set(enrolled.map((e) => e.id));
    const given = new Set(orderedEnrollmentIds);
    const unknown = orderedEnrollmentIds.filter((id) => !known.has(id)).length;
    const missing = [...known].filter((id) => !given.has(id)).length;
    if (
      given.size !== orderedEnrollmentIds.length ||
      unknown > 0 ||
      missing > 0
    ) {
      throw new BadRequestException(
        `The list must contain each of the ${known.size} current enrollments of this section exactly once (unknown: ${unknown}, missing: ${missing})`,
      );
    }
    // Clear first: no two rows may hold a number at once, so swaps and shifts cannot collide.
    await tx.enrollment.updateMany({
      where: { id: { in: [...known] } },
      data: { rollNo: null },
    });
    for (const [index, id] of orderedEnrollmentIds.entries()) {
      await tx.enrollment.update({
        where: { id },
        data: { rollNo: index + 1 },
      });
    }
  }

  /** Correction for a mistaken placement. Later modules (attendance, marks) will block this once they hold data. */
  async remove(enrollmentId: string, actor: AuthUser): Promise<void> {
    const details = await this.prisma.$transaction(async (tx) => {
      const found = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { academicYearId: true, sectionId: true },
      });
      if (!found) throw new NotFoundException('Enrollment not found');
      await this.years.lockWritableYear(tx, found.academicYearId);
      await this.lockSection(tx, found.sectionId);
      const current = await tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        select: { status: true, studentId: true },
      });
      if (current.status !== 'ENROLLED')
        throw new ConflictException(
          'Only a current enrollment can be deleted; leaving students keep their history',
        );
      await tx.enrollment.delete({ where: { id: enrollmentId } });
      return {
        studentId: current.studentId,
        academicYearId: found.academicYearId,
        sectionId: found.sectionId,
      };
    }, TX);
    await this.audit.record({
      actor,
      action: 'enrollment.deleted',
      entityType: 'enrollment',
      entityId: enrollmentId,
      details,
    });
  }

  /** Admin roles see every section; teachers see only the sections they are assigned to. */
  async listSection(
    yearId: string,
    sectionId: string,
    actor: AuthUser,
  ): Promise<RollListItem[]> {
    const [year, section] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: { id: true },
      }),
      this.prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!section) throw new NotFoundException('Section not found');

    const privileged =
      actor.permissions.includes('enrollments:read') ||
      actor.permissions.includes('students:read-all');
    if (!privileged) {
      const scope = await this.access.scopeFor(actor);
      if (
        scope.kind !== 'sections' ||
        scope.academicYearId !== yearId ||
        !scope.sectionIds.includes(sectionId)
      ) {
        throw new ForbiddenException('You do not have access to this section');
      }
    }
    return this.rollList(yearId, sectionId);
  }

  async occupancy(yearId: string): Promise<OccupancyItem[]> {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: yearId },
      select: { id: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    const [sections, counts] = await Promise.all([
      this.prisma.section.findMany({
        orderBy: [
          { schoolClass: { sortOrder: 'asc' } },
          { schoolClass: { name: 'asc' } },
          { name: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          capacity: true,
          isActive: true,
          schoolClass: { select: { id: true, name: true } },
        },
      }),
      this.prisma.enrollment.groupBy({
        by: ['sectionId'],
        where: { academicYearId: yearId, status: 'ENROLLED' },
        _count: { _all: true },
      }),
    ]);
    const byId = new Map(
      counts.map((c) => [c.sectionId, c._count._all] as const),
    );
    return sections.map((s) => ({
      sectionId: s.id,
      sectionName: s.name,
      classId: s.schoolClass.id,
      className: s.schoolClass.name,
      isActive: s.isActive,
      capacity: s.capacity,
      enrolled: byId.get(s.id) ?? 0,
    }));
  }

  private async rollList(
    yearId: string,
    sectionId: string,
  ): Promise<RollListItem[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { academicYearId: yearId, sectionId, status: 'ENROLLED' },
      orderBy: [
        { rollNo: { sort: 'asc', nulls: 'last' } },
        { student: { lastName: 'asc' } },
        { id: 'asc' },
      ],
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
            fullNameNp: true,
          },
        },
      },
    });
    return rows.map((r) => ({
      enrollmentId: r.id,
      studentId: r.student.id,
      admissionNo: r.student.admissionNo,
      name: displayName(r.student),
      fullNameNp: r.student.fullNameNp,
      rollNo: r.rollNo,
    }));
  }

  /** Exclusive row lock: serialises seat checks and roll-number picks for this section. */
  private async lockSection(tx: Tx, sectionId: string): Promise<LockedSection> {
    const rows = await tx.$queryRaw<LockedSection[]>`
      SELECT id, class_id AS "classId", is_active AS "isActive", capacity
      FROM sections WHERE id = ${sectionId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Section not found');
    return row;
  }

  private async assertSeatFree(
    tx: Tx,
    section: LockedSection,
    yearId: string,
  ): Promise<void> {
    if (section.capacity === null) return;
    const taken = await tx.enrollment.count({
      where: {
        academicYearId: yearId,
        sectionId: section.id,
        status: 'ENROLLED',
      },
    });
    if (taken >= section.capacity) {
      throw new ConflictException(
        `This section is full (${taken} of ${section.capacity} seats taken)`,
      );
    }
  }

  private async pickRollNo(
    tx: Tx,
    yearId: string,
    sectionId: string,
    requested?: number,
  ): Promise<number> {
    if (requested !== undefined) {
      await this.assertRollFree(tx, yearId, sectionId, requested);
      return requested;
    }
    // Highest number ever used in this section this year, including students who left: numbers are not reused.
    const max = await tx.enrollment.aggregate({
      where: { academicYearId: yearId, sectionId },
      _max: { rollNo: true },
    });
    return (max._max.rollNo ?? 0) + 1;
  }

  private async assertRollFree(
    tx: Tx,
    yearId: string,
    sectionId: string,
    rollNo: number,
    excludeId?: string,
  ): Promise<void> {
    const clash = await tx.enrollment.findFirst({
      where: {
        academicYearId: yearId,
        sectionId,
        status: 'ENROLLED',
        rollNo,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException(
        `Roll number ${rollNo} is already taken in this section`,
      );
  }
}
