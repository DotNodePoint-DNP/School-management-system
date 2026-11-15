import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { todayIso, toIsoDate } from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CreditService } from './credit.service.js';
import type {
  ApplyCreditDto,
  RefundCreditDto,
  ReversePaymentDto,
} from './dto/payment-corrections.dto.js';
import { FiscalYearsService } from './fiscal-years.service.js';
import {
  type Balance,
  InvoiceBalanceService,
} from './invoice-balance.service.js';
import { PaymentsService, type PaymentView } from './payments.service.js';
import { DayLockService } from './day-lock.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const nepalDate = (d: Date): string =>
  new Date(d.getTime() + 345 * 60_000).toISOString().slice(0, 10);

export interface ApplyCreditResult {
  studentId: string;
  applied: number;
  creditRemaining: number;
  allocations: { invoice: { id: string; number: string }; amount: number }[];
}

@Injectable()
export class PaymentCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalYears: FiscalYearsService,
    private readonly balances: InvoiceBalanceService,
    private readonly credit: CreditService,
    private readonly payments: PaymentsService,
    private readonly days: DayLockService,
  ) {}

  // ---------------------------------------------------------------- reversal

  /**
   * Cancels a payment. The receipt keeps its number, the invoices it paid become payable again, and the record stays.
   * Same day: anyone who may reverse payments. Any earlier day: principal-level permission only.
   */
  async reverse(
    id: string,
    dto: ReversePaymentDto,
    actor: AuthUser,
  ): Promise<PaymentView> {
    const may = (permission: string): boolean =>
      actor.permissions.includes(permission);
    if (!may('fees:payment-reverse') && !may('fees:payment-reverse-closed'))
      throw new ForbiddenException('You may not reverse payments');
    const today = todayIso();

    await this.prisma.$transaction(async (tx) => {
      const found = await tx.payment.findUnique({
        where: { id },
        select: { fiscalYearId: true, createdAt: true },
      });
      if (!found) throw new NotFoundException('Payment not found');
      const sameDay = nepalDate(found.createdAt) === today;
      if (!sameDay && !may('fees:payment-reverse-closed')) {
        throw new ForbiddenException(
          'This payment was recorded on an earlier day. Reversing it needs principal-level approval.',
        );
      }
      await this.fiscalYears.lockOpen(tx, found.fiscalYearId);
      await this.days.assertOpen(tx, today);
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      const pay = await tx.payment.findUniqueOrThrow({
        where: { id },
        select: {
          receiptNo: true,
          amount: true,
          reversal: { select: { paymentId: true } },
          refunds: { select: { id: true } },
        },
      });
      if (pay.reversal)
        throw new ConflictException('This payment has already been reversed');
      if (pay.refunds.length > 0)
        throw new ConflictException(
          'Money has been refunded from this payment, so it cannot be reversed',
        );

      await tx.paymentReversal.create({
        data: { paymentId: id, reason: dto.reason, reversedById: actor.id },
      });
      // Numbers only: the reason stays out of the audit log.
      await this.audit.recordIn(tx, {
        actor,
        action: 'payment.reversed',
        entityType: 'payment',
        entityId: id,
        details: {
          receiptNo: pay.receiptNo,
          amount: pay.amount.toNumber(),
          sameDay,
        },
      });
    }, TX);
    return this.payments.get(id);
  }

  // ---------------------------------------------------------------- applying advance credit

  /** An explicit action: nothing ever applies credit by itself. */
  async applyCredit(
    dto: ApplyCreditDto,
    actor: AuthUser,
  ): Promise<ApplyCreditResult> {
    const auto = dto.autoAllocate === true;
    const given = dto.allocations ?? [];
    if ((dto.allocations !== undefined) === auto)
      throw new BadRequestException(
        'Give either allocations (which invoices to pay) or autoAllocate: true',
      );
    if (dto.allocations !== undefined && given.length === 0)
      throw new BadRequestException('Choose at least one invoice');
    if (dto.maxAmount !== undefined && !auto)
      throw new BadRequestException('maxAmount works only with autoAllocate');
    if (new Set(given.map((a) => a.invoiceId)).size !== given.length)
      throw new BadRequestException(
        'An invoice can appear only once in the allocations',
      );
    const fiscalYear = await this.fiscalYears.openFor(todayIso());

    return this.prisma.$transaction(async (tx) => {
      // Lock order: fiscal year, this student's credit, the payments holding it, then the invoices.
      await this.fiscalYears.lockOpen(tx, fiscalYear.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credit:${dto.studentId}`}))`;
      if (
        !(await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Student not found');
      await tx.$queryRaw`SELECT id FROM payments WHERE credit_student_id = ${dto.studentId}::uuid ORDER BY id FOR UPDATE`;
      const held = (await this.credit.held([dto.studentId], tx)).get(
        dto.studentId,
      );
      if (!held)
        throw new ConflictException('This student holds no advance credit');

      const invoiceIds = auto
        ? (
            await tx.invoice.findMany({
              where: { studentId: dto.studentId, void: { is: null } },
              select: { id: true },
            })
          ).map((i) => i.id)
        : given.map((a) => a.invoiceId);
      if (invoiceIds.length > 0) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id IN (${Prisma.join([...invoiceIds].sort().map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
      }
      const invoices = await tx.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: {
          id: true,
          number: true,
          studentId: true,
          dueDate: true,
          issuedOn: true,
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
          .filter((i) => i.void === null && owed(i.id) > 0)
          .sort(
            (a, b) =>
              a.dueDate.getTime() - b.dueDate.getTime() ||
              a.issuedOn.getTime() - b.issuedOn.getTime() ||
              a.number.localeCompare(b.number),
          );
        let left = Math.min(
          held.totalPaisa,
          dto.maxAmount !== undefined
            ? toPaisa(dto.maxAmount)
            : Number.MAX_SAFE_INTEGER,
        );
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
        if (planned.length === 0)
          throw new ConflictException(
            'There is nothing to apply the credit to',
          );
      } else {
        for (const a of given) {
          const inv = invoiceBy.get(a.invoiceId);
          if (!inv)
            throw new NotFoundException('One of those invoices does not exist');
          if (inv.void)
            throw new ConflictException(
              `Invoice ${inv.number} is void and cannot be paid`,
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
        const total = planned.reduce((n, p) => n + p.amountPaisa, 0);
        if (total > held.totalPaisa)
          throw new ConflictException(
            `NPR ${fromPaisa(total)} is more than the NPR ${fromPaisa(held.totalPaisa)} of advance credit held`,
          );
      }

      // Credit may pay this student's invoices or a sibling's (a student who shares a guardian), and nobody else's.
      const others = [
        ...new Set(
          planned.map((p) => p.studentId).filter((s) => s !== dto.studentId),
        ),
      ];
      if (others.length > 0) {
        const mine = await tx.studentGuardian.findMany({
          where: { studentId: dto.studentId },
          select: { guardianId: true },
        });
        const linked =
          mine.length === 0
            ? []
            : await tx.studentGuardian.findMany({
                where: {
                  studentId: { in: others },
                  guardianId: { in: mine.map((m) => m.guardianId) },
                },
                select: { studentId: true },
              });
        const family = new Set(linked.map((l) => l.studentId));
        if (others.some((s) => !family.has(s))) {
          throw new BadRequestException(
            "Advance credit can only pay this student's own invoices or a sibling's (a student who shares a guardian)",
          );
        }
      }

      // Oldest receipt first. One invoice may draw from two receipts.
      const pool = held.payments.map((p) => ({
        id: p.id,
        left: p.unappliedPaisa,
      }));
      const rows: {
        paymentId: string;
        invoiceId: string;
        amountPaisa: number;
      }[] = [];
      for (const plan of planned) {
        let need = plan.amountPaisa;
        for (const p of pool) {
          if (need === 0) break;
          const take = Math.min(need, p.left);
          if (take === 0) continue;
          rows.push({
            paymentId: p.id,
            invoiceId: plan.invoiceId,
            amountPaisa: take,
          });
          p.left -= take;
          need -= take;
        }
      }
      await tx.paymentAllocation.createMany({
        data: rows
          .sort(
            (a, b) =>
              a.invoiceId.localeCompare(b.invoiceId) ||
              a.paymentId.localeCompare(b.paymentId),
          )
          .map((r) => ({
            paymentId: r.paymentId,
            invoiceId: r.invoiceId,
            amount: fromPaisa(r.amountPaisa),
            allocatedById: actor.id,
          })),
      });

      const applied = planned.reduce((n, p) => n + p.amountPaisa, 0);
      await this.audit.recordIn(tx, {
        actor,
        action: 'credit.applied',
        entityType: 'student',
        entityId: dto.studentId,
        details: {
          amount: fromPaisa(applied),
          invoices: planned.length,
          receipts: new Set(rows.map((r) => r.paymentId)).size,
        },
      });
      return {
        studentId: dto.studentId,
        applied: fromPaisa(applied),
        creditRemaining: fromPaisa(held.totalPaisa - applied),
        allocations: planned.map((p) => ({
          invoice: {
            id: p.invoiceId,
            number: (invoiceBy.get(p.invoiceId) as { number: string }).number,
          },
          amount: fromPaisa(p.amountPaisa),
        })),
      };
    }, TX);
  }

  // ---------------------------------------------------------------- refunding unapplied credit

  /** Hands unapplied advance credit back. One person acts; the permission is principal-level. */
  async refund(
    id: string,
    dto: RefundCreditDto,
    actor: AuthUser,
  ): Promise<PaymentView> {
    if (dto.method === 'CASH' && dto.reference)
      throw new BadRequestException('A cash refund has no reference');
    if (dto.method !== 'CASH' && !dto.reference)
      throw new BadRequestException(
        'Give the cheque number or transaction reference for this refund',
      );
    const reference = dto.reference
      ? dto.reference.trim().replace(/\s+/g, ' ').toUpperCase()
      : null;
    const amountPaisa = toPaisa(dto.amount);
    const fiscalYear = await this.fiscalYears.openFor(todayIso());

    await this.prisma.$transaction(async (tx) => {
      await this.fiscalYears.lockOpen(tx, fiscalYear.id);
      await this.days.assertOpen(tx, todayIso());
      const found = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      if (found.length === 0) throw new NotFoundException('Payment not found');
      const pay = await tx.payment.findUniqueOrThrow({
        where: { id },
        select: {
          receiptNo: true,
          amount: true,
          reversal: { select: { paymentId: true } },
          allocations: { select: { amount: true } },
          refunds: { select: { amount: true } },
        },
      });
      if (pay.reversal)
        throw new ConflictException(
          'This payment was reversed, so it holds no credit to refund',
        );
      const used = [...pay.allocations, ...pay.refunds].reduce(
        (n, x) => n + toPaisa(x.amount.toNumber()),
        0,
      );
      const unapplied = toPaisa(pay.amount.toNumber()) - used;
      if (unapplied <= 0)
        throw new ConflictException(
          'This payment has no unapplied advance credit to refund',
        );
      if (amountPaisa > unapplied)
        throw new ConflictException(
          `Only NPR ${fromPaisa(unapplied)} of this payment is unapplied credit`,
        );

      await tx.creditRefund.create({
        data: {
          paymentId: id,
          amount: dto.amount,
          method: dto.method,
          reference,
          reason: dto.reason,
          approvedById: actor.id,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'credit.refunded',
        entityType: 'payment',
        entityId: id,
        details: {
          receiptNo: pay.receiptNo,
          amount: dto.amount,
          method: dto.method,
        },
      });
    }, TX);
    return this.payments.get(id);
  }

  async creditOf(studentId: string) {
    if (
      !(await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Student not found');
    const held = (await this.credit.held([studentId])).get(studentId);
    return {
      studentId,
      total: fromPaisa(held?.totalPaisa ?? 0),
      payments: (held?.payments ?? []).map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        paidOn: p.paidOn,
        unapplied: fromPaisa(p.unappliedPaisa),
      })),
    };
  }
}
