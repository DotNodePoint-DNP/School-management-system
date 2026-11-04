import { Injectable, NotFoundException } from '@nestjs/common';
import { toPaisa } from '../../common/utils/money.js';
import { toIsoDate } from '../../common/utils/bs-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  calculateCharges,
  type ChargeLineInput,
  type ChargeResult,
  type DiscountInput,
} from './charge-calculator.js';

type Db = Pick<
  Prisma.TransactionClient,
  | 'enrollment'
  | 'billingPeriod'
  | 'feeStructureLine'
  | 'studentFeeAssignment'
  | 'studentDiscount'
>;

export interface PlannedPeriod {
  periodId: string;
  sequence: number;
  name: string;
  dueDate: string;
  charge: ChargeResult;
}

export interface ChargePlan {
  enrollment: {
    id: string;
    studentId: string;
    academicYearId: string;
    academicYearName: string;
    classId: string;
    className: string;
    sectionName: string;
    status: string;
    admissionNo: string;
    studentName: {
      firstName: string;
      middleName: string | null;
      lastName: string;
    };
  };
  /** First enrollment ever in this school: pays the "new student" lines. */
  isNewStudent: boolean;
  periods: PlannedPeriod[];
  /** What a new student pays once, on admission. */
  admission: ChargeResult | null;
  pendingDiscounts: number;
  warnings: string[];
}

@Injectable()
export class ChargePlannerService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(enrollmentId: string, db: Db = this.prisma): Promise<ChargePlan> {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
        classId: true,
        status: true,
        academicYear: { select: { name: true, startDate: true } },
        student: {
          select: {
            admissionNo: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        section: {
          select: { name: true, schoolClass: { select: { name: true } } },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const [earlier, periods, lines, assignments, discounts] = await Promise.all(
      [
        db.enrollment.count({
          where: {
            studentId: enrollment.studentId,
            academicYear: {
              startDate: { lt: enrollment.academicYear.startDate },
            },
          },
        }),
        db.billingPeriod.findMany({
          where: { academicYearId: enrollment.academicYearId },
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, name: true, dueDate: true },
        }),
        db.feeStructureLine.findMany({
          where: {
            academicYearId: enrollment.academicYearId,
            classId: enrollment.classId,
          },
          select: {
            amount: true,
            audience: true,
            onAdmission: true,
            feeHead: { select: { id: true, code: true, sortOrder: true } },
            periods: { select: { periodId: true } },
          },
        }),
        db.studentFeeAssignment.findMany({
          where: { enrollmentId },
          select: {
            amount: true,
            feeHead: { select: { id: true, code: true, sortOrder: true } },
            periods: { select: { periodId: true } },
          },
        }),
        db.studentDiscount.findMany({
          where: { enrollmentId, status: { in: ['PENDING', 'APPROVED'] } },
          select: {
            id: true,
            status: true,
            type: true,
            value: true,
            feeHeadId: true,
            createdAt: true,
            fromPeriod: { select: { sequence: true } },
            toPeriod: { select: { sequence: true } },
          },
        }),
      ],
    );

    const isNew = earlier === 0;
    const mine = lines.filter(
      (l) =>
        l.audience === 'ALL' || l.audience === (isNew ? 'NEW' : 'CONTINUING'),
    );
    const approved = discounts.filter((d) => d.status === 'APPROVED');
    const toInput = (d: (typeof approved)[number]): DiscountInput => ({
      id: d.id,
      type: d.type,
      feeHeadId: d.feeHeadId,
      createdAt: d.createdAt.getTime(),
      value:
        d.type === 'PERCENT'
          ? Math.round(d.value.toNumber() * 100)
          : toPaisa(d.value.toNumber()),
    });
    const byHead = (
      a: { sortOrder: number; code: string },
      b: { sortOrder: number; code: string },
    ): number => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);

    const planned: PlannedPeriod[] = periods.map((p) => {
      const charged: (ChargeLineInput & { sortOrder: number })[] = [
        ...mine
          .filter(
            (l) =>
              !l.onAdmission && l.periods.some((lp) => lp.periodId === p.id),
          )
          .map((l) => ({
            feeHeadId: l.feeHead.id,
            code: l.feeHead.code,
            sortOrder: l.feeHead.sortOrder,
            source: 'STRUCTURE' as const,
            amountPaisa: toPaisa(l.amount.toNumber()),
          })),
        ...assignments
          .filter((a) => a.periods.some((ap) => ap.periodId === p.id))
          .map((a) => ({
            feeHeadId: a.feeHead.id,
            code: a.feeHead.code,
            sortOrder: a.feeHead.sortOrder,
            source: 'ASSIGNMENT' as const,
            amountPaisa: toPaisa(a.amount.toNumber()),
          })),
      ].sort(byHead);
      const applicable = approved.filter(
        (d) =>
          (d.fromPeriod === null || d.fromPeriod.sequence <= p.sequence) &&
          (d.toPeriod === null || d.toPeriod.sequence >= p.sequence),
      );
      return {
        periodId: p.id,
        sequence: p.sequence,
        name: p.name,
        dueDate: toIsoDate(p.dueDate),
        charge: calculateCharges(charged, applicable.map(toInput)),
      };
    });

    // Admission lines are not tied to a period, so only discounts without a period range apply to them.
    const admissionLines = isNew
      ? mine
          .filter((l) => l.onAdmission)
          .map((l) => ({
            feeHeadId: l.feeHead.id,
            code: l.feeHead.code,
            sortOrder: l.feeHead.sortOrder,
            source: 'STRUCTURE' as const,
            amountPaisa: toPaisa(l.amount.toNumber()),
          }))
          .sort(byHead)
      : [];
    const admission =
      admissionLines.length > 0
        ? calculateCharges(
            admissionLines,
            approved
              .filter((d) => d.fromPeriod === null && d.toPeriod === null)
              .map(toInput),
          )
        : null;

    const warnings: string[] = [];
    if (lines.length === 0 && assignments.length === 0)
      warnings.push(
        'This class has no fee structure for this academic year, and the student has no assigned fees.',
      );
    if (periods.length === 0)
      warnings.push('This academic year has no billing periods yet.');
    const pending = discounts.filter((d) => d.status === 'PENDING').length;
    if (pending > 0)
      warnings.push(
        `${pending} discount(s) are waiting for approval and are not included.`,
      );

    return {
      enrollment: {
        id: enrollment.id,
        studentId: enrollment.studentId,
        academicYearId: enrollment.academicYearId,
        academicYearName: enrollment.academicYear.name,
        classId: enrollment.classId,
        className: enrollment.section.schoolClass.name,
        sectionName: enrollment.section.name,
        status: enrollment.status,
        admissionNo: enrollment.student.admissionNo,
        studentName: {
          firstName: enrollment.student.firstName,
          middleName: enrollment.student.middleName,
          lastName: enrollment.student.lastName,
        },
      },
      isNewStudent: isNew,
      periods: planned,
      admission,
      pendingDiscounts: pending,
      warnings,
    };
  }
}
