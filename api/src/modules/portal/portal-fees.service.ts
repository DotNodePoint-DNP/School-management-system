import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { amountInWords } from '../../common/utils/amount-in-words.js';
import {
  adToBsString,
  dateParts,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AGEING_BUCKETS, ageingKey, type AgeingKey } from '../fees/ageing.js';
import { CreditService } from '../fees/credit.service.js';
import { DuesReportService } from '../fees/dues-report.service.js';
import {
  InvoiceBalanceService,
  invoiceStatus,
  type Balance,
} from '../fees/invoice-balance.service.js';
import { StatementsService } from '../fees/statements.service.js';
import type {
  PortalInvoicesQueryDto,
  PortalPaymentsQueryDto,
  PortalStatementQueryDto,
} from './dto/portal-fees.dto.js';
import { PortalAccessService } from './portal-access.service.js';

/** Invoice and receipt ids that are not this parent's look exactly like ids that do not exist. */
const notFound = (): NotFoundException => new NotFoundException('Not found');
const STUDENT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
} as const;

export interface ChildFees {
  student: {
    id: string;
    admissionNo: string;
    name: string;
    className: string | null;
    sectionName: string | null;
  };
  outstanding: number;
  overdue: number;
  notYetDue: number;
  credit: number;
  oldestDueDate: string | null;
  buckets: Record<AgeingKey, number>;
  invoices: {
    id: string;
    number: string;
    kind: string;
    period: string | null;
    dueDate: string;
    dueDateBs: string | null;
    daysOverdue: number;
    net: number;
    adjusted: number;
    paid: number;
    outstanding: number;
  }[];
}

const INVOICE_LIST_SELECT = {
  id: true,
  number: true,
  kind: true,
  description: true,
  issuedOn: true,
  dueDate: true,
  grossAmount: true,
  discountAmount: true,
  netAmount: true,
  period: { select: { name: true } },
} satisfies Prisma.InvoiceSelect;

const PAYMENT_SELECT = {
  id: true,
  receiptNo: true,
  paidOn: true,
  method: true,
  reference: true,
  amount: true,
  payerName: true,
  creditStudentId: true,
  receivedById: true,
  createdAt: true,
  fiscalYear: { select: { label: true } },
  creditStudent: { select: STUDENT },
  reversal: { select: { paymentId: true } },
  allocations: {
    orderBy: { invoice: { number: 'asc' as const } },
    select: {
      amount: true,
      createdAt: true,
      invoice: {
        select: {
          id: true,
          number: true,
          kind: true,
          studentId: true,
          period: { select: { name: true } },
          student: { select: STUDENT },
        },
      },
    },
  },
} satisfies Prisma.PaymentSelect;
type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

export interface ParentReceipt {
  id: string;
  receiptNo: string;
  fiscalYear: string;
  paidOn: string;
  paidOnBs: string | null;
  method: string;
  reference: string | null;
  payerName: string | null;
  receivedBy: string | null;
  status: 'ACTIVE' | 'REVERSED';
  /** Only this family's children. */
  lines: {
    invoice: { number: string; kind: string; period: string | null };
    student: { id: string; admissionNo: string; name: string };
    amount: number;
  }[];
  /** Paid for children outside this family, with no names. */
  other: { amount: number } | null;
  advanceCredit: {
    amount: number;
    student: { id: string; admissionNo: string; name: string };
  } | null;
  total: number;
  amountInWords: string;
}

@Injectable()
export class PortalFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly dues: DuesReportService,
    private readonly credit: CreditService,
    private readonly balances: InvoiceBalanceService,
    private readonly statements: StatementsService,
  ) {}

  // ---------------------------------------------------------------- what is owed

  async overview(actor: AuthUser) {
    const children = (
      await this.childSummaries(await this.access.childIds(actor))
    ).map(({ invoices, ...rest }) => ({
      ...rest,
      openInvoices: invoices.length,
    }));
    const sum = (pick: (c: (typeof children)[number]) => number): number =>
      fromPaisa(children.reduce((n, c) => n + toPaisa(pick(c)), 0));
    return {
      asOf: todayIso(),
      asOfBs: adToBsString(todayIso()),
      children,
      totals: {
        outstanding: sum((c) => c.outstanding),
        overdue: sum((c) => c.overdue),
        notYetDue: sum((c) => c.notYetDue),
        credit: sum((c) => c.credit),
      },
    };
  }

  async childFees(actor: AuthUser, studentId: string): Promise<ChildFees> {
    await this.access.requireChild(actor, studentId);
    return (await this.childSummaries([studentId]))[0] as ChildFees;
  }

  /** Dues for these children, from the same calculation the office uses. */
  async childSummaries(studentIds: string[]): Promise<ChildFees[]> {
    if (studentIds.length === 0) return [];
    const today = todayIso();
    const [students, open, held] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          ...STUDENT,
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
      }),
      this.dues.openInvoices({ studentIds }, this.prisma, today),
      this.credit.held(studentIds),
    ]);
    const periodIds = [
      ...new Set(open.flatMap((i) => (i.periodId ? [i.periodId] : []))),
    ];
    const periods =
      periodIds.length === 0
        ? []
        : await this.prisma.billingPeriod.findMany({
            where: { id: { in: periodIds } },
            select: { id: true, name: true },
          });
    const periodName = new Map(periods.map((p) => [p.id, p.name] as const));

    return students
      .map((s) => {
        const mine = open
          .filter((i) => i.studentId === s.id)
          .sort(
            (a, b) =>
              a.dueDate.localeCompare(b.dueDate) ||
              a.number.localeCompare(b.number),
          );
        const buckets = Object.fromEntries(
          AGEING_BUCKETS.map((b) => [b.key, 0]),
        ) as Record<AgeingKey, number>;
        for (const i of mine)
          buckets[ageingKey(i.daysOverdue)] += i.outstandingPaisa;
        const outstanding = mine.reduce((n, i) => n + i.outstandingPaisa, 0);
        const overdue = mine
          .filter((i) => i.daysOverdue > 0)
          .reduce((n, i) => n + i.outstandingPaisa, 0);
        const e = s.enrollments[0];
        return {
          student: {
            id: s.id,
            admissionNo: s.admissionNo,
            name: displayName(s),
            className: e?.section.schoolClass.name ?? null,
            sectionName: e?.section.name ?? null,
          },
          outstanding: fromPaisa(outstanding),
          overdue: fromPaisa(overdue),
          notYetDue: fromPaisa(outstanding - overdue),
          credit: fromPaisa(held.get(s.id)?.totalPaisa ?? 0),
          oldestDueDate: mine[0]?.dueDate ?? null,
          buckets: Object.fromEntries(
            AGEING_BUCKETS.map((b) => [b.key, fromPaisa(buckets[b.key])]),
          ) as Record<AgeingKey, number>,
          invoices: mine.map((i) => ({
            id: i.id,
            number: i.number,
            kind: i.kind,
            period: i.periodId ? (periodName.get(i.periodId) ?? null) : null,
            dueDate: i.dueDate,
            dueDateBs: adToBsString(i.dueDate),
            daysOverdue: Math.max(0, i.daysOverdue),
            net: fromPaisa(i.netPaisa),
            adjusted: fromPaisa(i.adjustedPaisa),
            paid: fromPaisa(i.paidPaisa),
            outstanding: fromPaisa(i.outstandingPaisa),
          })),
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
  }

  // ---------------------------------------------------------------- invoices

  async invoices(
    actor: AuthUser,
    studentId: string,
    q: PortalInvoicesQueryDto,
  ): Promise<Paginated<unknown>> {
    await this.access.requireChild(actor, studentId);
    const rows = await this.prisma.invoice.findMany({
      where: { studentId, void: { is: null } },
      orderBy: [{ issuedOn: 'desc' }, { number: 'desc' }],
      select: INVOICE_LIST_SELECT,
    });
    const balances = await this.balances.load(rows.map((r) => r.id));
    const today = todayIso();
    const items = rows
      .map((r) => {
        const b = balances.get(r.id) as Balance;
        const issued = dateParts(r.issuedOn);
        const due = dateParts(r.dueDate);
        const { status, overdue } = invoiceStatus(b, due.ad, today);
        return {
          id: r.id,
          number: r.number,
          kind: r.kind,
          period: r.period?.name ?? null,
          description: r.description,
          issuedOn: issued.ad,
          issuedOnBs: issued.bs,
          dueDate: due.ad,
          dueDateBs: due.bs,
          gross: r.grossAmount.toNumber(),
          discount: r.discountAmount.toNumber(),
          net: r.netAmount.toNumber(),
          adjusted: fromPaisa(b.adjustedPaisa),
          paid: fromPaisa(b.paidPaisa),
          outstanding: fromPaisa(b.outstandingPaisa),
          status,
          overdue,
        };
      })
      .filter((i) =>
        q.status === 'OPEN'
          ? i.outstanding > 0
          : q.status === 'CLOSED'
            ? i.outstanding === 0
            : true,
      );
    return toPaginated(
      items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      items.length,
      q,
    );
  }

  async invoiceDetail(actor: AuthUser, invoiceId: string) {
    const r = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        ...INVOICE_LIST_SELECT,
        studentId: true,
        revision: true,
        fiscalYear: { select: { label: true } },
        void: { select: { invoiceId: true } },
        student: { select: STUDENT },
        enrollment: {
          select: {
            rollNo: true,
            section: {
              select: { name: true, schoolClass: { select: { name: true } } },
            },
          },
        },
        lines: {
          orderBy: { id: 'asc' },
          select: {
            descriptionEn: true,
            descriptionNp: true,
            grossAmount: true,
            lineDiscount: true,
            invoiceDiscountShare: true,
            netAmount: true,
          },
        },
        allocations: {
          where: { payment: { reversal: { is: null } } },
          orderBy: { createdAt: 'asc' },
          select: {
            amount: true,
            createdAt: true,
            payment: {
              select: {
                id: true,
                receiptNo: true,
                paidOn: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (
      !r ||
      r.void ||
      !(await this.access.childIds(actor)).includes(r.studentId)
    )
      throw notFound();

    const b = (await this.balances.load([invoiceId])).get(invoiceId) as Balance;
    const issued = dateParts(r.issuedOn);
    const due = dateParts(r.dueDate);
    const { status, overdue } = invoiceStatus(b, due.ad, todayIso());
    return {
      id: r.id,
      number: r.number,
      kind: r.kind,
      revision: r.revision,
      fiscalYear: r.fiscalYear.label,
      status,
      overdue,
      issuedOn: { ad: issued.ad, bs: issued.bs },
      dueDate: { ad: due.ad, bs: due.bs },
      period: r.period?.name ?? null,
      description: r.description,
      student: {
        id: r.student.id,
        admissionNo: r.student.admissionNo,
        name: displayName(r.student),
      },
      className: r.enrollment.section.schoolClass.name,
      sectionName: r.enrollment.section.name,
      rollNo: r.enrollment.rollNo,
      // Discounts appear as amounts only: no category and no reason.
      lines: r.lines.map((l) => ({
        descriptionEn: l.descriptionEn,
        descriptionNp: l.descriptionNp,
        gross: l.grossAmount.toNumber(),
        discount: fromPaisa(
          toPaisa(l.lineDiscount.toNumber()) +
            toPaisa(l.invoiceDiscountShare.toNumber()),
        ),
        net: l.netAmount.toNumber(),
      })),
      gross: r.grossAmount.toNumber(),
      discount: r.discountAmount.toNumber(),
      net: r.netAmount.toNumber(),
      adjusted: fromPaisa(b.adjustedPaisa),
      paid: fromPaisa(b.paidPaisa),
      outstanding: fromPaisa(b.outstandingPaisa),
      payments: r.allocations.map((a) => ({
        paymentId: a.payment.id,
        receiptNo: a.payment.receiptNo,
        paidOn: toIsoDate(a.payment.paidOn),
        amount: a.amount.toNumber(),
        viaCredit: a.createdAt.getTime() !== a.payment.createdAt.getTime(),
      })),
    };
  }

  // ---------------------------------------------------------------- receipts

  async payments(
    actor: AuthUser,
    studentId: string,
    q: PortalPaymentsQueryDto,
  ): Promise<Paginated<unknown>> {
    await this.access.requireChild(actor, studentId);
    const where: Prisma.PaymentWhereInput = {
      OR: [
        { creditStudentId: studentId },
        { allocations: { some: { invoice: { studentId } } } },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: PAYMENT_SELECT,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return toPaginated(
      rows.map((p) => {
        const direct = p.allocations.filter(
          (a) => a.createdAt.getTime() === p.createdAt.getTime(),
        );
        const kept =
          toPaisa(p.amount.toNumber()) -
          direct.reduce((n, a) => n + toPaisa(a.amount.toNumber()), 0);
        // Only the part of the receipt that belongs to this child.
        const forChild =
          direct
            .filter((a) => a.invoice.studentId === studentId)
            .reduce((n, a) => n + toPaisa(a.amount.toNumber()), 0) +
          (p.creditStudentId === studentId ? kept : 0);
        const paid = dateParts(p.paidOn);
        return {
          id: p.id,
          receiptNo: p.receiptNo,
          paidOn: paid.ad,
          paidOnBs: paid.bs,
          method: p.method,
          status: p.reversal ? 'REVERSED' : 'ACTIVE',
          forChild: fromPaisa(forChild),
        };
      }),
      total,
      q,
    );
  }

  async paymentDetail(
    actor: AuthUser,
    paymentId: string,
  ): Promise<ParentReceipt> {
    return this.receiptFor(actor, paymentId);
  }

  /** One receipt as this parent may see it: their own children's lines, everything else folded into one amount. */
  async receiptFor(actor: AuthUser, paymentId: string): Promise<ParentReceipt> {
    const own = new Set(await this.access.childIds(actor));
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    const touchesOwn =
      p &&
      (p.allocations.some((a) => own.has(a.invoice.studentId)) ||
        (p.creditStudentId !== null && own.has(p.creditStudentId)));
    if (!p || !touchesOwn) throw notFound();

    const direct = p.allocations.filter(
      (a) => a.createdAt.getTime() === p.createdAt.getTime(),
    );
    const kept =
      toPaisa(p.amount.toNumber()) -
      direct.reduce((n, a) => n + toPaisa(a.amount.toNumber()), 0);
    const mine = direct.filter((a) => own.has(a.invoice.studentId));
    const others = direct
      .filter((a) => !own.has(a.invoice.studentId))
      .reduce((n, a) => n + toPaisa(a.amount.toNumber()), 0);
    const keptMine = p.creditStudent && own.has(p.creditStudent.id) ? kept : 0;
    const otherPaisa = others + (kept - keptMine);
    const cashier = await this.prisma.user.findUnique({
      where: { id: p.receivedById },
      select: { fullName: true },
    });
    const paid = dateParts(p.paidOn);
    const total = toPaisa(p.amount.toNumber());
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      fiscalYear: p.fiscalYear.label,
      paidOn: paid.ad,
      paidOnBs: paid.bs,
      method: p.method,
      reference: p.reference,
      payerName: p.payerName,
      receivedBy: cashier?.fullName ?? null,
      status: p.reversal ? 'REVERSED' : 'ACTIVE',
      lines: mine.map((a) => ({
        invoice: {
          number: a.invoice.number,
          kind: a.invoice.kind,
          period: a.invoice.period?.name ?? null,
        },
        student: {
          id: a.invoice.student.id,
          admissionNo: a.invoice.student.admissionNo,
          name: displayName(a.invoice.student),
        },
        amount: a.amount.toNumber(),
      })),
      other: otherPaisa > 0 ? { amount: fromPaisa(otherPaisa) } : null,
      advanceCredit:
        keptMine > 0 && p.creditStudent
          ? {
              amount: fromPaisa(keptMine),
              student: {
                id: p.creditStudent.id,
                admissionNo: p.creditStudent.admissionNo,
                name: displayName(p.creditStudent),
              },
            }
          : null,
      total: fromPaisa(total),
      amountInWords: amountInWords(total),
      // Not included, on purpose: the cashier's note and the reason for a reversal.
    };
  }

  // ---------------------------------------------------------------- statement

  /** The child's ledger without voided invoices, with credit notes shown only as "Credit note". */
  async statement(
    actor: AuthUser,
    studentId: string,
    q: PortalStatementQueryDto,
  ) {
    await this.access.requireChild(actor, studentId);
    const from = resolveDate('from', q.from, undefined);
    const to = resolveDate('to', q.to, undefined);
    if (from && to && to < from)
      throw new BadRequestException('The end date is before the start date');

    const full = await this.statements.forStudent(studentId, {});
    const voided = new Set(
      (
        await this.prisma.invoice.findMany({
          where: { studentId, void: { isNot: null } },
          select: { number: true },
        })
      ).map((v) => v.number),
    );
    let running = 0;
    const ledger = full.entries
      .filter((e) => !(e.against && voided.has(e.against))) // both the invoice and its void entry disappear
      .map((e) => {
        running += toPaisa(e.debit) - toPaisa(e.credit);
        return {
          date: e.date,
          dateBs: e.dateBs,
          type: e.type,
          reference: e.reference,
          description: e.type === 'CREDIT_NOTE' ? 'Credit note' : e.description,
          debit: e.debit,
          credit: e.credit,
          balance: fromPaisa(running),
        };
      });
    const before = ledger.filter((e) => from && e.date < from);
    const shown = ledger.filter(
      (e) => (!from || e.date >= from) && (!to || e.date <= to),
    );
    const opening = before.at(-1)?.balance ?? 0;
    return {
      student: {
        id: full.student.id,
        admissionNo: full.student.admissionNo,
        name: full.student.name,
        className: full.student.className,
        sectionName: full.student.sectionName,
      },
      period: { from: from ?? null, to: to ?? null },
      openingBalance: opening,
      entries: shown,
      closingBalance: shown.at(-1)?.balance ?? opening,
      credit: full.credit.total,
    };
  }
}
