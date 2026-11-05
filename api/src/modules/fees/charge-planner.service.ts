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

type Head = { id: string; code: string; sortOrder: number };
const byHead = (
  a: { sortOrder: number; code: string },
  b: { sortOrder: number; code: string },
): number => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
const group = <T, K>(items: T[], key: (item: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>();
  for (const item of items)
    map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
};

@Injectable()
export class ChargePlannerService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(enrollmentId: string, db: Db = this.prisma): Promise<ChargePlan> {
    const plan = (await this.planMany([enrollmentId], db)).get(enrollmentId);
    if (!plan) throw new NotFoundException('Enrollment not found');
    return plan;
  }

  /** Plans for many enrollments using a fixed number of queries. Unknown ids are left out of the result. */
  async planMany(
    enrollmentIds: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, ChargePlan>> {
    const out = new Map<string, ChargePlan>();
    if (enrollmentIds.length === 0) return out;

    const enrollments = await db.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
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
    const ids = enrollments.map((e) => e.id);
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    const yearIds = [...new Set(enrollments.map((e) => e.academicYearId))];
    const classIds = [...new Set(enrollments.map((e) => e.classId))];

    const [history, periods, lines, assignments, discounts] = await Promise.all(
      [
        db.enrollment.findMany({
          where: { studentId: { in: studentIds } },
          select: {
            studentId: true,
            academicYear: { select: { startDate: true } },
          },
        }),
        db.billingPeriod.findMany({
          where: { academicYearId: { in: yearIds } },
          orderBy: [{ academicYearId: 'asc' }, { sequence: 'asc' }],
          select: {
            id: true,
            academicYearId: true,
            sequence: true,
            name: true,
            dueDate: true,
          },
        }),
        db.feeStructureLine.findMany({
          where: { academicYearId: { in: yearIds }, classId: { in: classIds } },
          select: {
            academicYearId: true,
            classId: true,
            amount: true,
            audience: true,
            onAdmission: true,
            feeHead: { select: { id: true, code: true, sortOrder: true } },
            periods: { select: { periodId: true } },
          },
        }),
        db.studentFeeAssignment.findMany({
          where: { enrollmentId: { in: ids } },
          select: {
            enrollmentId: true,
            amount: true,
            feeHead: { select: { id: true, code: true, sortOrder: true } },
            periods: { select: { periodId: true } },
          },
        }),
        db.studentDiscount.findMany({
          where: {
            enrollmentId: { in: ids },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          select: {
            id: true,
            enrollmentId: true,
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

    const historyBy = group(history, (h) => h.studentId);
    const periodsBy = group(periods, (p) => p.academicYearId);
    const linesBy = group(lines, (l) => `${l.academicYearId}:${l.classId}`);
    const assignmentsBy = group(assignments, (a) => a.enrollmentId);
    const discountsBy = group(discounts, (d) => d.enrollmentId);

    for (const e of enrollments) {
      const isNew = !(historyBy.get(e.studentId) ?? []).some(
        (h) =>
          h.academicYear.startDate.getTime() <
          e.academicYear.startDate.getTime(),
      );
      const yearPeriods = periodsBy.get(e.academicYearId) ?? [];
      const classLines = linesBy.get(`${e.academicYearId}:${e.classId}`) ?? [];
      const mine = classLines.filter(
        (l) =>
          l.audience === 'ALL' || l.audience === (isNew ? 'NEW' : 'CONTINUING'),
      );
      const mineAssignments = assignmentsBy.get(e.id) ?? [];
      const myDiscounts = discountsBy.get(e.id) ?? [];
      const approved = myDiscounts.filter((d) => d.status === 'APPROVED');
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
      const line = (
        head: Head,
        source: 'STRUCTURE' | 'ASSIGNMENT',
        amount: number,
      ): ChargeLineInput & { sortOrder: number } => ({
        feeHeadId: head.id,
        code: head.code,
        sortOrder: head.sortOrder,
        source,
        amountPaisa: toPaisa(amount),
      });

      const planned: PlannedPeriod[] = yearPeriods.map((p) => {
        const charged = [
          ...mine
            .filter(
              (l) =>
                !l.onAdmission && l.periods.some((lp) => lp.periodId === p.id),
            )
            .map((l) => line(l.feeHead, 'STRUCTURE', l.amount.toNumber())),
          ...mineAssignments
            .filter((a) => a.periods.some((ap) => ap.periodId === p.id))
            .map((a) => line(a.feeHead, 'ASSIGNMENT', a.amount.toNumber())),
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
            .map((l) => line(l.feeHead, 'STRUCTURE', l.amount.toNumber()))
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
      if (classLines.length === 0 && mineAssignments.length === 0)
        warnings.push(
          'This class has no fee structure for this academic year, and the student has no assigned fees.',
        );
      if (yearPeriods.length === 0)
        warnings.push('This academic year has no billing periods yet.');
      const pending = myDiscounts.filter((d) => d.status === 'PENDING').length;
      if (pending > 0)
        warnings.push(
          `${pending} discount(s) are waiting for approval and are not included.`,
        );

      out.set(e.id, {
        enrollment: {
          id: e.id,
          studentId: e.studentId,
          academicYearId: e.academicYearId,
          academicYearName: e.academicYear.name,
          classId: e.classId,
          className: e.section.schoolClass.name,
          sectionName: e.section.name,
          status: e.status,
          admissionNo: e.student.admissionNo,
          studentName: {
            firstName: e.student.firstName,
            middleName: e.student.middleName,
            lastName: e.student.lastName,
          },
        },
        isNewStudent: isNew,
        periods: planned,
        admission,
        pendingDiscounts: pending,
        warnings,
      });
    }
    return out;
  }
}
