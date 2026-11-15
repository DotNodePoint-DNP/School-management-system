import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  adToBsString,
  resolveDate,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreditService } from './credit.service.js';
import type { StatementQueryDto } from './dto/payment-corrections.dto.js';

const nepalDate = (d: Date): string =>
  new Date(d.getTime() + 345 * 60_000).toISOString().slice(0, 10);
const RANK = {
  INVOICE: 0,
  VOID: 1,
  CREDIT_NOTE: 2,
  PAYMENT: 3,
  REVERSAL: 4,
} as const;
type EntryType = keyof typeof RANK;
const KIND_LABEL = {
  WAIVER: 'Waiver',
  WRITE_OFF: 'Write-off',
  CORRECTION: 'Correction',
} as const;

interface Entry {
  date: string;
  type: EntryType;
  at: number;
  id: string;
  reference: string;
  against: string | null;
  description: string;
  debit: number;
  credit: number;
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CreditService,
  ) {}

  /** The student's receivable ledger. Its closing balance always equals what /dues reports as outstanding. */
  async forStudent(studentId: string, q: StatementQueryDto) {
    const from = resolveDate('from', q.from, undefined);
    const to = resolveDate('to', q.to, undefined);
    if (from && to && to < from)
      throw new BadRequestException('The end date is before the start date');

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        middleName: true,
        lastName: true,
        enrollments: {
          orderBy: { academicYear: { startDate: 'desc' } },
          take: 1,
          select: {
            section: {
              select: { name: true, schoolClass: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const where = {
      studentId,
      ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
    };
    const [invoices, adjustments, allocations, held] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        select: {
          id: true,
          number: true,
          issuedOn: true,
          createdAt: true,
          netAmount: true,
          description: true,
          void: { select: { voidedAt: true } },
        },
      }),
      this.prisma.invoiceAdjustment.findMany({
        where: { invoice: where, decision: { is: { approved: true } } },
        select: {
          id: true,
          kind: true,
          amount: true,
          invoice: { select: { number: true } },
          decision: { select: { decidedAt: true } },
        },
      }),
      this.prisma.paymentAllocation.findMany({
        where: { invoice: where },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          invoice: { select: { number: true } },
          payment: {
            select: {
              receiptNo: true,
              paidOn: true,
              createdAt: true,
              reversal: { select: { reversedAt: true } },
            },
          },
        },
      }),
      this.credit.held([studentId]),
    ]);

    const entries: Entry[] = [];
    for (const i of invoices) {
      entries.push({
        date: toIsoDate(i.issuedOn),
        type: 'INVOICE',
        at: i.createdAt.getTime(),
        id: i.id,
        reference: i.number,
        against: i.number,
        description: i.description ?? 'Invoice',
        debit: toPaisa(i.netAmount.toNumber()),
        credit: 0,
      });
      if (i.void) {
        entries.push({
          date: nepalDate(i.void.voidedAt),
          type: 'VOID',
          at: i.void.voidedAt.getTime(),
          id: `${i.id}:void`,
          reference: i.number,
          against: i.number,
          description: `Invoice ${i.number} voided`,
          debit: 0,
          credit: toPaisa(i.netAmount.toNumber()),
        });
      }
    }
    for (const a of adjustments) {
      const decided = (a.decision as { decidedAt: Date }).decidedAt;
      entries.push({
        date: nepalDate(decided),
        type: 'CREDIT_NOTE',
        at: decided.getTime(),
        id: a.id,
        reference: a.invoice.number,
        against: a.invoice.number,
        description: `${KIND_LABEL[a.kind]} credit note`,
        debit: 0,
        credit: toPaisa(a.amount.toNumber()),
      });
    }
    for (const a of allocations) {
      // Allocations made together with the receipt share its timestamp. Credit applied later has its own.
      const direct = a.createdAt.getTime() === a.payment.createdAt.getTime();
      const amount = toPaisa(a.amount.toNumber());
      entries.push({
        date: direct ? toIsoDate(a.payment.paidOn) : nepalDate(a.createdAt),
        type: 'PAYMENT',
        at: a.createdAt.getTime(),
        id: a.id,
        reference: a.payment.receiptNo,
        against: a.invoice.number,
        description: `Receipt ${a.payment.receiptNo}${direct ? '' : ' (advance credit applied)'}`,
        debit: 0,
        credit: amount,
      });
      if (a.payment.reversal) {
        entries.push({
          date: nepalDate(a.payment.reversal.reversedAt),
          type: 'REVERSAL',
          at: a.payment.reversal.reversedAt.getTime(),
          id: `${a.id}:reversal`,
          reference: a.payment.receiptNo,
          against: a.invoice.number,
          description: `Receipt ${a.payment.receiptNo} reversed`,
          debit: amount,
          credit: 0,
        });
      }
    }
    entries.sort(
      (x, y) =>
        x.date.localeCompare(y.date) ||
        RANK[x.type] - RANK[y.type] ||
        x.at - y.at ||
        x.id.localeCompare(y.id),
    );

    const opening = entries
      .filter((e) => from && e.date < from)
      .reduce((n, e) => n + e.debit - e.credit, 0);
    const inRange = entries.filter(
      (e) => (!from || e.date >= from) && (!to || e.date <= to),
    );
    let running = opening;
    const shown = inRange.map((e) => {
      running += e.debit - e.credit;
      return {
        date: e.date,
        dateBs: adToBsString(e.date),
        type: e.type,
        reference: e.reference,
        against: e.against,
        description: e.description,
        debit: fromPaisa(e.debit),
        credit: fromPaisa(e.credit),
        balance: fromPaisa(running),
      };
    });
    const sum = (type: EntryType, side: 'debit' | 'credit'): number =>
      fromPaisa(
        inRange.filter((e) => e.type === type).reduce((n, e) => n + e[side], 0),
      );
    const enrollment = student.enrollments[0];
    const credit = held.get(studentId);

    return {
      student: {
        id: student.id,
        admissionNo: student.admissionNo,
        name: displayName(student),
        className: enrollment?.section.schoolClass.name ?? null,
        sectionName: enrollment?.section.name ?? null,
      },
      period: {
        from: from ?? null,
        to: to ?? null,
        academicYearId: q.academicYearId ?? null,
      },
      openingBalance: fromPaisa(opening),
      entries: shown,
      closingBalance: fromPaisa(running),
      totals: {
        invoiced: sum('INVOICE', 'debit'),
        voided: sum('VOID', 'credit'),
        creditNotes: sum('CREDIT_NOTE', 'credit'),
        payments: sum('PAYMENT', 'credit'),
        reversed: sum('REVERSAL', 'debit'),
        outstanding: fromPaisa(running),
      },
      credit: {
        total: fromPaisa(credit?.totalPaisa ?? 0),
        payments: (credit?.payments ?? []).map((p) => ({
          id: p.id,
          receiptNo: p.receiptNo,
          paidOn: p.paidOn,
          unapplied: fromPaisa(p.unappliedPaisa),
        })),
      },
    };
  }
}
