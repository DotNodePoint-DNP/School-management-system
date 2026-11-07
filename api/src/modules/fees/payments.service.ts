import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  dateParts,
  isoToDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { reserveSequence } from '../../common/utils/sequence.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  ListPaymentsQueryDto,
  RecordPaymentDto,
} from './dto/payment.dto.js';
import { FiscalYearsService } from './fiscal-years.service.js';
import {
  type Balance,
  InvoiceBalanceService,
  invoiceStatus,
} from './invoice-balance.service.js';
import { CreditService } from './credit.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

export const formatReceiptNumber = (fiscalLabel: string, n: number): string =>
  `R-${fiscalLabel}-${String(n).padStart(6, '0')}`;
const normaliseReference = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toUpperCase();
const STUDENT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
} as const;

const SELECT = {
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
  note: true,
  createdAt: true,
  fiscalYear: { select: { id: true, label: true } },
  allocations: {
    orderBy: { invoice: { number: 'asc' as const } },
    select: {
      amount: true,
      invoice: {
        select: {
          id: true,
          number: true,
          kind: true,
          period: { select: { name: true } },
          student: { select: STUDENT },
        },
      },
    },
  },
  reversal: { select: { reason: true, reversedById: true, reversedAt: true } },
  refunds: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      amount: true,
      method: true,
      reference: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PaymentSelect;
type Row = Prisma.PaymentGetPayload<{ select: typeof SELECT }>;

export interface PaymentView {
  id: string;
  receiptNo: string;
  fiscalYear: { id: string; label: string };
  paidOn: string;
  paidOnBs: string | null;
  method: string;
  reference: string | null;
  amount: number;
  payer: { guardianId: string | null; name: string | null };
  receivedBy: string | null;
  note: string | null;
  status: 'ACTIVE' | 'REVERSED';
  refunds: {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    at: string;
  }[];
  allocations: {
    invoice: {
      id: string;
      number: string;
      kind: string;
      period: string | null;
    };
    student: { id: string; admissionNo: string; name: string };
    amount: number;
  }[];
  allocated: number;
  refunded: number;
  /** Advance credit still held: what was received, less what was applied and refunded. 0 once reversed. */
  unapplied: number;
  creditStudentId: string | null;
  reversal: {
    reason: string;
    reversedBy: string | null;
    reversedAt: string;
  } | null;
  createdAt: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalYears: FiscalYearsService,
    private readonly balances: InvoiceBalanceService,
    private readonly credit: CreditService,
  ) {}

  // ---------------------------------------------------------------- recording

  async record(
    dto: RecordPaymentDto,
    actor: AuthUser,
  ): Promise<PaymentView & { duplicate: boolean }> {
    const explicit = dto.allocations !== undefined;
    const auto = dto.autoAllocate !== undefined;
    if (explicit === auto)
      throw new BadRequestException(
        'Give either allocations (which invoices to pay) or autoAllocate (which students to pay for)',
      );
    if (dto.method === 'CASH' && dto.reference)
      throw new BadRequestException('A cash payment has no reference');
    if (dto.method !== 'CASH' && !dto.reference)
      throw new BadRequestException(
        'Give the cheque number or transaction reference',
      );
    const reference = dto.reference ? normaliseReference(dto.reference) : null;

    const today = todayIso();
    const paidOn = resolveDate('paidOn', dto.paidOn, dto.paidOnBs) ?? today;
    if (paidOn > today)
      throw new BadRequestException('A payment cannot be dated in the future');
    if (paidOn < today) {
      if (!actor.permissions.includes('fees:payment-backdate'))
        throw new ForbiddenException(
          'You may not record a payment for an earlier date',
        );
      if (!dto.note || dto.note.length < 10)
        throw new BadRequestException(
          'A backdated payment needs a note of at least 10 characters explaining why',
        );
    }

    const amountPaisa = toPaisa(dto.amount);
    const given = dto.allocations ?? [];
    if (new Set(given.map((a) => a.invoiceId)).size !== given.length)
      throw new BadRequestException(
        'An invoice can appear only once in the allocations',
      );
    if (given.reduce((n, a) => n + toPaisa(a.amount), 0) > amountPaisa)
      throw new BadRequestException(
        'The allocations add up to more than the payment',
      );
    const fiscalYear = await this.fiscalYears.openFor(paidOn);

    const result = await this.prisma.$transaction(async (tx) => {
      // The same form sent twice (or at the same moment) returns the receipt already created.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment_key:${dto.idempotencyKey}`}))`;
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          receivedById: true,
        },
      });
      if (existing) {
        if (
          toPaisa(existing.amount.toNumber()) !== amountPaisa ||
          existing.method !== dto.method ||
          existing.reference !== reference ||
          existing.receivedById !== actor.id
        ) {
          throw new ConflictException(
            'This request key was already used for a different payment. Use a new key for each payment.',
          );
        }
        return { id: existing.id, duplicate: true };
      }

      await this.fiscalYears.lockOpen(tx, fiscalYear.id);
      if (reference) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payref:${dto.method}:${reference}`}))`;
        const used = await tx.payment.findFirst({
          where: { method: dto.method, reference, reversal: { is: null } },
          select: { receiptNo: true },
        });
        if (used)
          throw new ConflictException(
            `This ${dto.method.toLowerCase().replace('_', ' ')} reference was already recorded on receipt ${used.receiptNo}`,
          );
      }

      // Lock every invoice that could be paid, in a fixed order, and only then read what is owed.
      let invoiceIds: string[];
      if (auto) {
        const studentIds = dto.autoAllocate?.studentIds ?? [];
        if (
          (await tx.student.count({ where: { id: { in: studentIds } } })) !==
          studentIds.length
        )
          throw new NotFoundException('Some of those students do not exist');
        invoiceIds = (
          await tx.invoice.findMany({
            where: { studentId: { in: studentIds }, void: { is: null } },
            select: { id: true },
          })
        ).map((i) => i.id);
      } else {
        invoiceIds = given.map((a) => a.invoiceId);
      }
      const sorted = [...invoiceIds].sort();
      if (sorted.length > 0) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
      }
      const invoices = await tx.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: {
          id: true,
          number: true,
          studentId: true,
          issuedOn: true,
          dueDate: true,
          void: { select: { invoiceId: true } },
        },
      });
      const invoiceBy = new Map(invoices.map((i) => [i.id, i] as const));
      const balances = await this.balances.load(invoiceIds, tx);
      const owed = (id: string): number =>
        (balances.get(id) as Balance).outstandingPaisa;

      const planned: {
        invoiceId: string;
        studentId: string;
        amountPaisa: number;
      }[] = [];
      if (auto) {
        const eligible = invoices
          .filter(
            (i) =>
              i.void === null &&
              toIsoDate(i.issuedOn) <= paidOn &&
              owed(i.id) > 0,
          )
          .sort(
            (a, b) =>
              a.dueDate.getTime() - b.dueDate.getTime() ||
              a.issuedOn.getTime() - b.issuedOn.getTime() ||
              a.number.localeCompare(b.number),
          );
        let left = amountPaisa;
        for (const inv of eligible) {
          if (left === 0) break;
          const take = Math.min(left, owed(inv.id));
          planned.push({
            invoiceId: inv.id,
            studentId: inv.studentId,
            amountPaisa: take,
          });
          left -= take;
        }
      } else {
        for (const a of given) {
          const inv = invoiceBy.get(a.invoiceId);
          if (!inv)
            throw new NotFoundException('One of those invoices does not exist');
          if (inv.void)
            throw new ConflictException(
              `Invoice ${inv.number} is void and cannot be paid`,
            );
          if (toIsoDate(inv.issuedOn) > paidOn)
            throw new ConflictException(
              `Invoice ${inv.number} was issued after the payment date, so this payment cannot be applied to it`,
            );
          if (toPaisa(a.amount) > owed(inv.id))
            throw new ConflictException(
              `Invoice ${inv.number}: NPR ${a.amount} is more than the NPR ${fromPaisa(owed(inv.id))} still owed`,
            );
          planned.push({
            invoiceId: inv.id,
            studentId: inv.studentId,
            amountPaisa: toPaisa(a.amount),
          });
        }
      }

      // Anything not applied to an invoice is refused, unless the cashier explicitly keeps it as advance credit.
      const remainder =
        amountPaisa - planned.reduce((n, p) => n + p.amountPaisa, 0);
      let creditStudentId: string | null = null;
      if (remainder > 0) {
        if (!dto.keepExcessAsCredit) {
          throw new ConflictException(
            auto
              ? `NPR ${fromPaisa(remainder)} is more than these students owe. Reduce the amount, or keep the excess as advance credit.`
              : `NPR ${fromPaisa(remainder)} of this payment is not applied to any invoice. Apply it, or keep it as advance credit.`,
          );
        }
        const wanted = dto.keepExcessAsCredit.studentId;
        const allowed = auto
          ? new Set(dto.autoAllocate?.studentIds)
          : planned.length > 0
            ? new Set(planned.map((p) => p.studentId))
            : null;
        if (allowed && !allowed.has(wanted))
          throw new BadRequestException(
            'Advance credit must be held for one of the students being paid for',
          );
        const holder = await tx.student.findUnique({
          where: { id: wanted },
          select: { status: true },
        });
        if (!holder)
          throw new BadRequestException('That student does not exist');
        if (holder.status !== 'ACTIVE')
          throw new ConflictException(
            'Advance credit can only be held for a student who is still in the school',
          );
        creditStudentId = wanted;
      } else if (dto.keepExcessAsCredit) {
        throw new BadRequestException(
          'There is no excess to keep as advance credit',
        );
      }

      if (dto.payerGuardianId) {
        const involved = [
          ...new Set([
            ...planned.map((p) => p.studentId),
            ...(creditStudentId ? [creditStudentId] : []),
          ]),
        ];
        const linked = await tx.studentGuardian.count({
          where: {
            guardianId: dto.payerGuardianId,
            studentId: { in: involved },
          },
        });
        if (linked === 0)
          throw new BadRequestException(
            'That guardian is not linked to any student being paid for',
          );
      }

      const id = randomUUID();
      const receiptNo = formatReceiptNumber(
        fiscalYear.label,
        await reserveSequence(tx, `receipt:${fiscalYear.id}`, 1),
      );
      await tx.payment.create({
        data: {
          id,
          receiptNo,
          fiscalYearId: fiscalYear.id,
          paidOn: isoToDate(paidOn),
          method: dto.method,
          reference,
          amount: dto.amount,
          payerGuardianId: dto.payerGuardianId,
          payerName: dto.payerName,
          creditStudentId,
          receivedById: actor.id,
          idempotencyKey: dto.idempotencyKey,
          note: dto.note,
        },
      });
      if (planned.length > 0) {
        await tx.paymentAllocation.createMany({
          data: [...planned]
            .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId))
            .map((p) => ({
              paymentId: id,
              invoiceId: p.invoiceId,
              amount: fromPaisa(p.amountPaisa),
              allocatedById: actor.id,
            })),
        });
      }
      // Numbers only: no names, references or notes in the audit log.
      await this.audit.recordIn(tx, {
        actor,
        action: 'payment.recorded',
        entityType: 'payment',
        entityId: id,
        details: {
          receiptNo,
          method: dto.method,
          amount: dto.amount,
          invoices: planned.length,
          credit: fromPaisa(remainder),
        },
      });
      return { id, duplicate: false };
    }, TX);

    return { ...(await this.get(result.id)), duplicate: result.duplicate };
  }

  // ---------------------------------------------------------------- reading

  async get(id: string): Promise<PaymentView> {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Payment not found');
    return (await this.present([row]))[0] as PaymentView;
  }

  async list(q: ListPaymentsQueryDto): Promise<Paginated<PaymentView>> {
    const where: Prisma.PaymentWhereInput = {};
    if (q.fiscalYearId) where.fiscalYearId = q.fiscalYearId;
    if (q.method) where.method = q.method;
    if (q.receivedById) where.receivedById = q.receivedById;
    if (q.studentId)
      where.OR = [
        { creditStudentId: q.studentId },
        { allocations: { some: { invoice: { studentId: q.studentId } } } },
      ];
    if (q.from || q.to)
      where.paidOn = {
        ...(q.from ? { gte: isoToDate(q.from) } : {}),
        ...(q.to ? { lte: isoToDate(q.to) } : {}),
      };
    if (q.search) {
      const search: Prisma.PaymentWhereInput = {
        OR: [
          { receiptNo: { contains: q.search, mode: 'insensitive' } },
          { reference: { contains: q.search, mode: 'insensitive' } },
        ],
      };
      where.AND = [search];
    }
    if (q.reversed === true) where.reversal = { isNot: null };
    if (q.reversed === false) where.reversal = { is: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { receiptNo: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return toPaginated(await this.present(rows), total, q);
  }

  /** What each student owes right now, oldest first: the cashier's screen before taking a payment. */
  async dues(studentIds: string[]) {
    const students = await this.prisma.student.findMany({
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
    });
    if (students.length !== new Set(studentIds).size)
      throw new NotFoundException('Some of those students do not exist');
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId: { in: studentIds }, void: { is: null } },
      orderBy: [{ dueDate: 'asc' }, { issuedOn: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        kind: true,
        studentId: true,
        dueDate: true,
        netAmount: true,
        period: { select: { name: true } },
      },
    });
    const balances = await this.balances.load(invoices.map((i) => i.id));
    const today = todayIso();
    const held = await this.credit.held(studentIds);

    const perStudent = students.map((s) => {
      const open = invoices
        .filter(
          (i) =>
            i.studentId === s.id &&
            (balances.get(i.id) as Balance).outstandingPaisa > 0,
        )
        .map((i) => {
          const b = balances.get(i.id) as Balance;
          const due = dateParts(i.dueDate);
          return {
            id: i.id,
            number: i.number,
            kind: i.kind,
            period: i.period?.name ?? null,
            dueDate: due.ad,
            dueDateBs: due.bs,
            net: i.netAmount.toNumber(),
            adjusted: fromPaisa(b.adjustedPaisa),
            paid: fromPaisa(b.paidPaisa),
            outstanding: fromPaisa(b.outstandingPaisa),
            overdue: invoiceStatus(b, due.ad, today).overdue,
          };
        });
      const enrollment = s.enrollments[0];
      return {
        student: {
          id: s.id,
          admissionNo: s.admissionNo,
          name: displayName(s),
          className: enrollment?.section.schoolClass.name ?? null,
          sectionName: enrollment?.section.name ?? null,
        },
        invoices: open,
        credit: fromPaisa(held.get(s.id)?.totalPaisa ?? 0),
        outstanding: fromPaisa(
          open.reduce((n, i) => n + toPaisa(i.outstanding), 0),
        ),
      };
    });
    return {
      students: perStudent,
      totalOutstanding: fromPaisa(
        perStudent.reduce((n, s) => n + toPaisa(s.outstanding), 0),
      ),
      totalCredit: fromPaisa(
        perStudent.reduce((n, s) => n + toPaisa(s.credit), 0),
      ),
    };
  }

  private async present(rows: Row[]): Promise<PaymentView[]> {
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.receivedById, r.reversal?.reversedById])
          .filter((v): v is string => Boolean(v)),
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

    return rows.map((r) => {
      const paid = dateParts(r.paidOn);
      const allocated = r.allocations.reduce(
        (n, a) => n + toPaisa(a.amount.toNumber()),
        0,
      );
      const refunded = r.refunds.reduce(
        (n, f) => n + toPaisa(f.amount.toNumber()),
        0,
      );
      return {
        id: r.id,
        receiptNo: r.receiptNo,
        fiscalYear: r.fiscalYear,
        paidOn: paid.ad,
        paidOnBs: paid.bs,
        method: r.method,
        reference: r.reference,
        amount: r.amount.toNumber(),
        payer: { guardianId: r.payerGuardianId, name: r.payerName },
        receivedBy: name.get(r.receivedById) ?? null,
        note: r.note,
        status: r.reversal ? 'REVERSED' : 'ACTIVE',
        allocations: r.allocations.map((a) => ({
          invoice: {
            id: a.invoice.id,
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
        allocated: fromPaisa(allocated),
        refunded: fromPaisa(refunded),
        refunds: r.refunds.map((f) => ({
          id: f.id,
          amount: f.amount.toNumber(),
          method: f.method,
          reference: f.reference,
          at: f.createdAt.toISOString(),
        })),
        unapplied: r.reversal
          ? 0
          : fromPaisa(toPaisa(r.amount.toNumber()) - allocated - refunded),
        creditStudentId: r.creditStudentId,
        reversal: r.reversal
          ? {
              reason: r.reversal.reason,
              reversedBy: name.get(r.reversal.reversedById) ?? null,
              reversedAt: r.reversal.reversedAt.toISOString(),
            }
          : null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }
}
