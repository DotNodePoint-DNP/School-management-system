import { Injectable, NotFoundException } from '@nestjs/common';
import { dateParts } from '../../common/utils/bs-date.js';
import { amountInWords } from '../../common/utils/amount-in-words.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';

const TX = { maxWait: 15_000, timeout: 30_000 } as const;
const STUDENT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
} as const;
const SECTION = {
  select: { name: true, schoolClass: { select: { name: true } } },
} as const;

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The data for printing a receipt, and a record that it was printed. Call it when someone presses Print
   * (use GET /payments/:id to just look at a payment). The first print is the original; later ones are duplicates.
   */
  async print(id: string, actor: AuthUser) {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        receiptNo: true,
        paidOn: true,
        method: true,
        reference: true,
        amount: true,
        payerGuardianId: true,
        payerName: true,
        creditStudentId: true,
        receivedById: true,
        createdAt: true,
        fiscalYear: { select: { label: true } },
        reversal: { select: { reversedAt: true } },
        allocations: {
          orderBy: { invoice: { number: 'asc' } },
          select: {
            amount: true,
            createdAt: true,
            invoice: {
              select: {
                number: true,
                kind: true,
                period: { select: { name: true } },
                student: { select: STUDENT },
                enrollment: { select: { section: SECTION } },
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Payment not found');

    // Only what was received at the time. Credit applied later never changes a printed receipt.
    const direct = row.allocations.filter(
      (a) => a.createdAt.getTime() === row.createdAt.getTime(),
    );
    const kept =
      toPaisa(row.amount.toNumber()) -
      direct.reduce((n, a) => n + toPaisa(a.amount.toNumber()), 0);
    const [cashier, holder] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: row.receivedById },
        select: { fullName: true },
      }),
      row.creditStudentId
        ? this.prisma.student.findUnique({
            where: { id: row.creditStudentId },
            select: {
              ...STUDENT,
              enrollments: {
                orderBy: { academicYear: { startDate: 'desc' } },
                take: 1,
                select: { section: SECTION },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const copy = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipt_print:${id}`}))`;
      const before = await tx.auditLog.count({
        where: { action: 'payment.receipt_printed', entityId: id },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'payment.receipt_printed',
        entityType: 'payment',
        entityId: id,
        details: { copy: before + 1 },
      });
      return {
        kind: before === 0 ? ('ORIGINAL' as const) : ('DUPLICATE' as const),
        number: before + 1,
      };
    }, TX);

    const paid = dateParts(row.paidOn);
    return {
      receiptNo: row.receiptNo,
      fiscalYear: row.fiscalYear.label,
      status: row.reversal ? ('REVERSED' as const) : ('ACTIVE' as const),
      reversedAt: row.reversal?.reversedAt.toISOString() ?? null,
      paidOn: paid.ad,
      paidOnBs: paid.bs,
      method: row.method,
      reference: row.reference,
      payer: { guardianId: row.payerGuardianId, name: row.payerName },
      receivedBy: cashier?.fullName ?? null,
      lines: direct.map((a) => ({
        invoice: {
          number: a.invoice.number,
          kind: a.invoice.kind,
          period: a.invoice.period?.name ?? null,
        },
        student: {
          admissionNo: a.invoice.student.admissionNo,
          name: displayName(a.invoice.student),
          className: a.invoice.enrollment.section.schoolClass.name,
          sectionName: a.invoice.enrollment.section.name,
        },
        amount: a.amount.toNumber(),
      })),
      advanceCredit: {
        amount: fromPaisa(kept),
        student:
          kept > 0 && holder
            ? {
                admissionNo: holder.admissionNo,
                name: displayName(holder),
                className:
                  holder.enrollments[0]?.section.schoolClass.name ?? null,
                sectionName: holder.enrollments[0]?.section.name ?? null,
              }
            : null,
      },
      total: row.amount.toNumber(),
      amountInWords: amountInWords(toPaisa(row.amount.toNumber())),
      copy,
    };
  }
}
