import { Injectable, NotFoundException } from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { dateParts, todayIso } from '../../common/utils/bs-date.js';
import { fromPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListInvoicesQueryDto } from './dto/invoice-query.dto.js';
import {
  invoiceStatus,
  InvoiceBalanceService,
  type Balance,
  type InvoiceStatus,
} from './invoice-balance.service.js';

const LIST_SELECT = {
  id: true,
  number: true,
  kind: true,
  revision: true,
  enrollmentId: true,
  description: true,
  issuedOn: true,
  dueDate: true,
  grossAmount: true,
  discountAmount: true,
  netAmount: true,
  fiscalYear: { select: { id: true, label: true } },
  student: {
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
  enrollment: {
    select: {
      section: {
        select: { name: true, schoolClass: { select: { name: true } } },
      },
    },
  },
  period: { select: { id: true, name: true, sequence: true } },
} satisfies Prisma.InvoiceSelect;
type Row = Prisma.InvoiceGetPayload<{ select: typeof LIST_SELECT }>;

export interface InvoiceListItem {
  id: string;
  number: string;
  kind: 'PERIODIC' | 'ADMISSION' | 'AD_HOC';
  revision: number;
  fiscalYear: { id: string; label: string };
  student: { id: string; admissionNo: string; name: string };
  enrollmentId: string;
  className: string;
  sectionName: string;
  period: { id: string; name: string; sequence: number } | null;
  description: string | null;
  issuedOn: string;
  issuedOnBs: string | null;
  dueDate: string;
  dueDateBs: string | null;
  gross: number;
  discount: number;
  net: number;
  adjusted: number;
  paid: number;
  outstanding: number;
  status: InvoiceStatus;
  overdue: boolean;
}

function toItem(row: Row, balance: Balance, today: string): InvoiceListItem {
  const issued = dateParts(row.issuedOn);
  const due = dateParts(row.dueDate);
  const { status, overdue } = invoiceStatus(balance, due.ad, today);
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    revision: row.revision,
    fiscalYear: row.fiscalYear,
    student: {
      id: row.student.id,
      admissionNo: row.student.admissionNo,
      name: displayName(row.student),
    },
    enrollmentId: row.enrollmentId,
    className: row.enrollment.section.schoolClass.name,
    sectionName: row.enrollment.section.name,
    period: row.period,
    description: row.description,
    issuedOn: issued.ad,
    issuedOnBs: issued.bs,
    dueDate: due.ad,
    dueDateBs: due.bs,
    gross: row.grossAmount.toNumber(),
    discount: row.discountAmount.toNumber(),
    net: row.netAmount.toNumber(),
    adjusted: fromPaisa(balance.adjustedPaisa),
    paid: fromPaisa(balance.paidPaisa),
    outstanding: fromPaisa(balance.outstandingPaisa),
    status,
    overdue,
  };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: InvoiceBalanceService,
  ) {}

  async list(q: ListInvoicesQueryDto): Promise<Paginated<InvoiceListItem>> {
    const where: Prisma.InvoiceWhereInput = {};
    if (q.kind) where.kind = q.kind;
    if (q.fiscalYearId) where.fiscalYearId = q.fiscalYearId;
    if (q.academicYearId) where.academicYearId = q.academicYearId;
    if (q.periodId) where.periodId = q.periodId;
    if (q.studentId) where.studentId = q.studentId;
    if (q.classId || q.sectionId)
      where.enrollment = {
        ...(q.classId ? { classId: q.classId } : {}),
        ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      };
    if (q.search)
      where.OR = [
        { number: { contains: q.search, mode: 'insensitive' } },
        {
          student: { admissionNo: { contains: q.search, mode: 'insensitive' } },
        },
      ];
    if (q.voided === true) where.void = { isNot: null };
    if (q.voided === false) where.void = { is: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    const balances = await this.balances.load(rows.map((r) => r.id));
    const today = todayIso();
    return toPaginated(
      rows.map((r) => toItem(r, balances.get(r.id) as Balance, today)),
      total,
      q,
    );
  }

  async forEnrollment(enrollmentId: string): Promise<InvoiceListItem[]> {
    if (
      !(await this.prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Enrollment not found');
    const rows = await this.prisma.invoice.findMany({
      where: { enrollmentId },
      orderBy: [{ issuedOn: 'asc' }, { number: 'asc' }],
      select: LIST_SELECT,
    });
    const balances = await this.balances.load(rows.map((r) => r.id));
    const today = todayIso();
    return rows.map((r) => toItem(r, balances.get(r.id) as Balance, today));
  }

  async get(id: string) {
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        replacesInvoiceId: true,
        replacedBy: { select: { id: true, number: true } },
        lines: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            descriptionEn: true,
            descriptionNp: true,
            source: true,
            grossAmount: true,
            lineDiscount: true,
            invoiceDiscountShare: true,
            netAmount: true,
            feeHead: { select: { id: true, code: true } },
          },
        },
        void: { select: { reason: true, voidedAt: true, voidedById: true } },
        adjustments: {
          orderBy: { requestedAt: 'asc' },
          select: {
            id: true,
            kind: true,
            amount: true,
            reason: true,
            requestedAt: true,
            requestedById: true,
            decision: {
              select: {
                approved: true,
                decidedById: true,
                note: true,
                decidedAt: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Invoice not found');

    const userIds = [
      ...new Set(
        [
          row.void?.voidedById,
          ...row.adjustments.flatMap((a) => [
            a.requestedById,
            a.decision?.decidedById,
          ]),
        ].filter((v): v is string => Boolean(v)),
      ),
    ];
    const users =
      userIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          });
    const name = new Map(users.map((u) => [u.id, u.fullName] as const));
    const balance = (await this.balances.load([id])).get(id) as Balance;

    return {
      ...toItem(row, balance, todayIso()),
      replacesInvoiceId: row.replacesInvoiceId,
      replacedBy: row.replacedBy,
      lines: row.lines.map((l) => ({
        id: l.id,
        feeHead: l.feeHead,
        descriptionEn: l.descriptionEn,
        descriptionNp: l.descriptionNp,
        source: l.source,
        gross: l.grossAmount.toNumber(),
        lineDiscount: l.lineDiscount.toNumber(),
        invoiceDiscountShare: l.invoiceDiscountShare.toNumber(),
        net: l.netAmount.toNumber(),
      })),
      void: row.void
        ? {
            reason: row.void.reason,
            voidedAt: row.void.voidedAt.toISOString(),
            voidedBy: name.get(row.void.voidedById) ?? null,
          }
        : null,
      adjustments: row.adjustments.map((a) => ({
        id: a.id,
        kind: a.kind,
        amount: a.amount.toNumber(),
        reason: a.reason,
        requestedAt: a.requestedAt.toISOString(),
        requestedBy: name.get(a.requestedById) ?? null,
        status:
          a.decision === null
            ? 'PENDING'
            : a.decision.approved
              ? 'APPROVED'
              : 'REJECTED',
        decidedBy: a.decision
          ? (name.get(a.decision.decidedById) ?? null)
          : null,
        decisionNote: a.decision?.note ?? null,
      })),
    };
  }
}
