import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isoToDate,
  requireDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

export interface StatusChangeResult {
  id: string;
  status: string;
  statusChangedOn: string | null;
  enrollmentsClosed: number;
}

@Injectable()
export class StudentLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
  ) {}

  async changeStatus(
    id: string,
    dto: ChangeStudentStatusDto,
    actor: AuthUser,
  ): Promise<StatusChangeResult> {
    const effectiveOn = requireDate(
      'effectiveOn',
      dto.effectiveOn,
      dto.effectiveOnBs,
    );
    if (effectiveOn > todayIso())
      throw new BadRequestException(
        'The effective date cannot be in the future',
      );

    const closed = await this.prisma.$transaction(async (tx) => {
      // Lock order matches enrollment writes (academic years first, then the student), so they cannot deadlock.
      const years = await tx.enrollment.findMany({
        where: {
          studentId: id,
          status: 'ENROLLED',
          academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
        },
        select: { academicYearId: true },
        distinct: ['academicYearId'],
      });
      for (const yearId of years.map((y) => y.academicYearId).sort())
        await this.years.lockWritableYear(tx, yearId);

      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM students WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Student not found');
      const student = await tx.student.findUniqueOrThrow({
        where: { id },
        select: { status: true, admissionDate: true },
      });
      if (student.status !== 'ACTIVE')
        throw new ConflictException(
          `This student is already ${student.status.toLowerCase()}`,
        );
      if (effectiveOn < toIsoDate(student.admissionDate)) {
        throw new BadRequestException(
          'The effective date cannot be before the admission date',
        );
      }

      const open = await tx.enrollment.findMany({
        where: {
          studentId: id,
          status: 'ENROLLED',
          academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
        },
        select: { id: true },
      });
      // The reason lives on the student record (access-controlled), not in the audit log.
      await tx.student.update({
        where: { id },
        data: {
          status: dto.status,
          statusChangedOn: isoToDate(effectiveOn),
          statusNote: dto.reason,
        },
      });
      await tx.enrollment.updateMany({
        where: { id: { in: open.map((o) => o.id) } },
        data: {
          status: dto.status === 'GRADUATED' ? 'COMPLETED' : 'WITHDRAWN',
          statusChangedOn: isoToDate(effectiveOn),
        },
      });
      return open.length;
    }, TX);

    await this.audit.record({
      actor,
      action: 'student.status_changed',
      entityType: 'student',
      entityId: id,
      details: { to: dto.status, effectiveOn, enrollmentsClosed: closed },
    });
    return {
      id,
      status: dto.status,
      statusChangedOn: effectiveOn,
      enrollmentsClosed: closed,
    };
  }

  /** Makes a student active again. They are not placed in a class: enroll them again afterwards. */
  async reactivate(id: string, actor: AuthUser): Promise<StatusChangeResult> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM students WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Student not found');
      const student = await tx.student.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (student.status === 'ACTIVE')
        throw new ConflictException('This student is already active');
      await tx.student.update({
        where: { id },
        data: { status: 'ACTIVE', statusChangedOn: null, statusNote: null },
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'student.reactivated',
      entityType: 'student',
      entityId: id,
    });
    return {
      id,
      status: 'ACTIVE',
      statusChangedOn: null,
      enrollmentsClosed: 0,
    };
  }
}
