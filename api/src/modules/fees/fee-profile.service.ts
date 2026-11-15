import { Injectable } from '@nestjs/common';
import { fromPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { ChargeResult } from './charge-calculator.js';
import { ChargePlannerService } from './charge-planner.service.js';
import { DiscountsService } from './discounts.service.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';

const money = (c: ChargeResult) => ({
  lines: c.lines.map((l) => ({
    feeHeadId: l.feeHeadId,
    code: l.code,
    source: l.source,
    gross: fromPaisa(l.grossPaisa),
    lineDiscount: fromPaisa(l.lineDiscountPaisa),
    lineDiscountId: l.lineDiscountId,
    invoiceDiscountShare: fromPaisa(l.invoiceDiscountPaisa),
    net: fromPaisa(l.netPaisa),
  })),
  invoiceDiscountId: c.invoiceDiscountId,
  gross: fromPaisa(c.grossPaisa),
  discount: fromPaisa(c.lineDiscountsPaisa + c.invoiceDiscountPaisa),
  net: fromPaisa(c.netPaisa),
});

@Injectable()
export class FeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: ChargePlannerService,
    private readonly assignments: FeeAssignmentsService,
    private readonly discounts: DiscountsService,
  ) {}

  /** Everything that would go into this student's invoices this year, month by month. Nothing is created. */
  async get(enrollmentId: string, actor: AuthUser) {
    const plan = await this.planner.plan(enrollmentId);
    const [assignments, discounts, siblings] = await Promise.all([
      this.assignments.list(enrollmentId),
      this.discounts.forEnrollment(enrollmentId, actor),
      this.siblings(plan.enrollment.studentId, plan.enrollment.academicYearId),
    ]);

    const periods = plan.periods.map((p) => ({
      periodId: p.periodId,
      sequence: p.sequence,
      name: p.name,
      dueDate: p.dueDate,
      ...money(p.charge),
    }));
    const admission = plan.admission ? money(plan.admission) : null;
    const gross =
      periods.reduce((n, p) => n + Math.round(p.gross * 100), 0) +
      Math.round((admission?.gross ?? 0) * 100);
    const net =
      periods.reduce((n, p) => n + Math.round(p.net * 100), 0) +
      Math.round((admission?.net ?? 0) * 100);
    return {
      student: {
        id: plan.enrollment.studentId,
        admissionNo: plan.enrollment.admissionNo,
        name: displayName(plan.enrollment.studentName),
      },
      enrollment: {
        id: plan.enrollment.id,
        status: plan.enrollment.status,
        academicYear: {
          id: plan.enrollment.academicYearId,
          name: plan.enrollment.academicYearName,
        },
        class: { id: plan.enrollment.classId, name: plan.enrollment.className },
        section: plan.enrollment.sectionName,
      },
      isNewStudent: plan.isNewStudent,
      periods,
      admission,
      totals: {
        gross: fromPaisa(gross),
        discount: fromPaisa(gross - net),
        net: fromPaisa(net),
      },
      assignments,
      discounts,
      siblings,
      warnings: plan.warnings,
    };
  }

  /** Other students who share a guardian with this one: a hint when applying sibling discounts. */
  private async siblings(studentId: string, academicYearId: string) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { studentId },
      select: { guardianId: true },
    });
    if (links.length === 0) return [];
    const rows = await this.prisma.studentGuardian.findMany({
      where: {
        guardianId: { in: links.map((l) => l.guardianId) },
        studentId: { not: studentId },
        student: { status: 'ACTIVE' },
      },
      distinct: ['studentId'],
      select: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            middleName: true,
            lastName: true,
            enrollments: {
              where: { academicYearId, status: 'ENROLLED' },
              take: 1,
              select: {
                id: true,
                section: {
                  select: {
                    name: true,
                    schoolClass: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return rows.map((r) => ({
      studentId: r.student.id,
      admissionNo: r.student.admissionNo,
      name: displayName(r.student),
      enrollmentId: r.student.enrollments[0]?.id ?? null,
      className: r.student.enrollments[0]?.section.schoolClass.name ?? null,
      sectionName: r.student.enrollments[0]?.section.name ?? null,
    }));
  }
}
