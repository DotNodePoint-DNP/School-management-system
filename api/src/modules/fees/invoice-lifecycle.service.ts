import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isoToDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { reserveSequence } from '../../common/utils/sequence.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { ChargeResult } from './charge-calculator.js';
import { ChargePlannerService } from './charge-planner.service.js';
import type {
  ReissueInvoiceDto,
  VoidInvoiceDto,
} from './dto/invoice-corrections.dto.js';
import { FeeEnrollmentLockService } from './fee-enrollment-lock.service.js';
import { FiscalYearsService } from './fiscal-years.service.js';
import {
  type Balance,
  InvoiceBalanceService,
} from './invoice-balance.service.js';
import { formatInvoiceNumber } from './invoice-generation.service.js';

type Tx = Prisma.TransactionClient;
type Db = Pick<
  Tx,
  | 'invoice'
  | 'enrollment'
  | 'billingPeriod'
  | 'feeStructureLine'
  | 'studentFeeAssignment'
  | 'studentDiscount'
>;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

interface ReissuePlan {
  old: {
    id: string;
    number: string;
    kind: 'PERIODIC' | 'ADMISSION';
    enrollmentId: string;
    studentId: string;
    academicYearId: string;
    periodId: string | null;
    revision: number;
    description: string | null;
    netPaisa: number;
  };
  charge: ChargeResult;
  dueDate: string;
}

@Injectable()
export class InvoiceLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalYears: FiscalYearsService,
    private readonly planner: ChargePlannerService,
    private readonly balances: InvoiceBalanceService,
    private readonly locks: FeeEnrollmentLockService,
  ) {}

  // ---------------------------------------------------------------- void

  /** Cancels an invoice. It keeps its number and stays on record, marked void. */
  async void(
    id: string,
    dto: VoidInvoiceDto,
    actor: AuthUser,
  ): Promise<{ id: string; number: string; status: 'VOID' }> {
    const number = await this.prisma.$transaction(async (tx) => {
      const found = await tx.invoice.findUnique({
        where: { id },
        select: { fiscalYearId: true },
      });
      if (!found) throw new NotFoundException('Invoice not found');
      await this.fiscalYears.lockOpen(tx, found.fiscalYearId);
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id },
        select: { number: true, void: { select: { invoiceId: true } } },
      });
      if (inv.void) throw new ConflictException('This invoice is already void');

      const pending = await tx.invoiceAdjustment.count({
        where: { invoiceId: id, decision: { is: null } },
      });
      if (pending > 0)
        throw new ConflictException(
          'This invoice has credit notes waiting for a decision. Approve or reject them first.',
        );
      const balance = (await this.balances.load([id], tx)).get(id) as Balance;
      if (balance.adjustedPaisa > 0)
        throw new ConflictException(
          'This invoice has approved credit notes, so it cannot be voided',
        );
      if (balance.paidPaisa > 0)
        throw new ConflictException(
          'Payments have been applied to this invoice, so it cannot be voided. Reverse the payments first.',
        );

      await tx.invoiceVoid.create({
        data: { invoiceId: id, reason: dto.reason, voidedById: actor.id },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'invoice.voided',
        entityType: 'invoice',
        entityId: id,
        details: { number: inv.number },
      });
      return inv.number;
    }, TX);
    return { id, number, status: 'VOID' };
  }

  // ---------------------------------------------------------------- reissue

  /** What a reissue would create right now. Writes nothing and uses no invoice number. */
  async reissuePreview(id: string, dto: ReissueInvoiceDto) {
    const today = todayIso();
    const due = resolveDate('dueDate', dto.dueDate, dto.dueDateBs) ?? null;
    const plan = await this.prepare(this.prisma, id, due, today);
    const fiscalYear = await this.fiscalYears.openFor(today);
    const discount =
      plan.charge.lineDiscountsPaisa + plan.charge.invoiceDiscountPaisa;
    return {
      replaces: { id: plan.old.id, number: plan.old.number },
      kind: plan.old.kind,
      revision: plan.old.revision + 1,
      fiscalYear,
      issuedOn: today,
      dueDate: plan.dueDate,
      gross: fromPaisa(plan.charge.grossPaisa),
      discount: fromPaisa(discount),
      net: fromPaisa(plan.charge.netPaisa),
      originalNet: fromPaisa(plan.old.netPaisa),
      changed: plan.charge.netPaisa !== plan.old.netPaisa,
      lines: plan.charge.lines.map((l) => ({
        code: l.code,
        gross: fromPaisa(l.grossPaisa),
        discount: fromPaisa(l.lineDiscountPaisa + l.invoiceDiscountPaisa),
        net: fromPaisa(l.netPaisa),
      })),
    };
  }

  /** Replaces a voided invoice with a new revision, recalculated from today's fee structure and approved discounts. */
  async reissue(id: string, dto: ReissueInvoiceDto, actor: AuthUser) {
    const today = todayIso();
    const due = resolveDate('dueDate', dto.dueDate, dto.dueDateBs) ?? null;
    const fiscalYear = await this.fiscalYears.openFor(today);

    return this.prisma.$transaction(async (tx) => {
      // Lock order: fiscal year, academic year, enrollment, then the invoice. Two reissues of one invoice queue up on the enrollment.
      await this.fiscalYears.lockOpen(tx, fiscalYear.id);
      const pre = await tx.invoice.findUnique({
        where: { id },
        select: { enrollmentId: true },
      });
      if (!pre) throw new NotFoundException('Invoice not found');
      await this.locks.lock(tx, pre.enrollmentId, { requireEnrolled: true });
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;

      const plan = await this.prepare(tx, id, due, today);
      if (
        dto.expectNet !== undefined &&
        toPaisa(dto.expectNet) !== plan.charge.netPaisa
      ) {
        throw new ConflictException(
          `The amount changed since the preview (now NPR ${fromPaisa(plan.charge.netPaisa)}). Preview again before reissuing.`,
        );
      }

      const heads = await tx.feeHead.findMany({
        where: { id: { in: plan.charge.lines.map((l) => l.feeHeadId) } },
        select: { id: true, name: true, nameNp: true },
      });
      const headBy = new Map(heads.map((h) => [h.id, h] as const));
      const newId = randomUUID();
      const number = formatInvoiceNumber(
        fiscalYear.label,
        await reserveSequence(tx, `invoice:${fiscalYear.id}`, 1),
      );
      const discountPaisa =
        plan.charge.lineDiscountsPaisa + plan.charge.invoiceDiscountPaisa;
      await tx.invoice.create({
        data: {
          id: newId,
          number,
          fiscalYearId: fiscalYear.id,
          kind: plan.old.kind,
          enrollmentId: plan.old.enrollmentId,
          studentId: plan.old.studentId,
          academicYearId: plan.old.academicYearId,
          periodId: plan.old.periodId,
          revision: plan.old.revision + 1,
          replacesInvoiceId: plan.old.id,
          description: plan.old.description,
          issuedOn: isoToDate(today),
          dueDate: isoToDate(plan.dueDate),
          grossAmount: fromPaisa(plan.charge.grossPaisa),
          discountAmount: fromPaisa(discountPaisa),
          netAmount: fromPaisa(plan.charge.netPaisa),
          createdById: actor.id,
          lines: {
            create: plan.charge.lines.map((l) => ({
              feeHeadId: l.feeHeadId,
              descriptionEn: headBy.get(l.feeHeadId)?.name ?? l.code,
              descriptionNp: headBy.get(l.feeHeadId)?.nameNp ?? null,
              source: l.source,
              grossAmount: fromPaisa(l.grossPaisa),
              lineDiscount: fromPaisa(l.lineDiscountPaisa),
              invoiceDiscountShare: fromPaisa(l.invoiceDiscountPaisa),
              netAmount: fromPaisa(l.netPaisa),
              lineDiscountId: l.lineDiscountId,
              invoiceDiscountId:
                l.invoiceDiscountPaisa > 0
                  ? plan.charge.invoiceDiscountId
                  : null,
            })),
          },
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'invoice.reissued',
        entityType: 'invoice',
        entityId: newId,
        details: {
          from: plan.old.number,
          to: number,
          net: fromPaisa(plan.charge.netPaisa),
        },
      });
      return {
        id: newId,
        number,
        revision: plan.old.revision + 1,
        net: fromPaisa(plan.charge.netPaisa),
        replaces: { id: plan.old.id, number: plan.old.number },
      };
    }, TX);
  }

  /** The checks and the calculation shared by the preview and the real thing. */
  private async prepare(
    db: Db,
    id: string,
    dueInput: string | null,
    today: string,
  ): Promise<ReissuePlan> {
    const old = await db.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        kind: true,
        enrollmentId: true,
        studentId: true,
        academicYearId: true,
        periodId: true,
        revision: true,
        description: true,
        netAmount: true,
        void: { select: { invoiceId: true } },
        replacedBy: { select: { number: true } },
        period: { select: { dueDate: true } },
      },
    });
    if (!old) throw new NotFoundException('Invoice not found');
    if (!old.void)
      throw new ConflictException(
        'Only a voided invoice can be reissued. Void it first.',
      );
    if (old.replacedBy)
      throw new ConflictException(
        `This invoice was already reissued as ${old.replacedBy.number}`,
      );
    if (old.kind === 'AD_HOC')
      throw new BadRequestException(
        'Ad-hoc invoices are not reissued. Create a new ad-hoc invoice for the student.',
      );
    if (old.kind === 'PERIODIC' && dueInput !== null)
      throw new BadRequestException(
        "A periodic invoice keeps its billing period's due date",
      );

    const plan = await this.planner.plan(old.enrollmentId, db);
    if (plan.enrollment.status !== 'ENROLLED')
      throw new ConflictException(
        'This student is no longer enrolled, so the invoice cannot be reissued',
      );

    let charge: ChargeResult | null | undefined;
    let dueDate: string;
    if (old.kind === 'PERIODIC') {
      charge = plan.periods.find((p) => p.periodId === old.periodId)?.charge;
      dueDate = toIsoDate(old.period?.dueDate as Date);
    } else {
      charge = plan.admission;
      dueDate = dueInput ?? today;
      if (dueDate < today)
        throw new BadRequestException('The due date cannot be in the past');
    }
    if (!charge || charge.lines.length === 0)
      throw new ConflictException(
        'There is nothing to bill for this student under the current fee structure',
      );
    if (charge.netPaisa <= 0)
      throw new ConflictException(
        'This student is now fully discounted for this invoice, so there is nothing to reissue',
      );
    return {
      old: {
        id: old.id,
        number: old.number,
        kind: old.kind,
        enrollmentId: old.enrollmentId,
        studentId: old.studentId,
        academicYearId: old.academicYearId,
        periodId: old.periodId,
        revision: old.revision,
        description: old.description,
        netPaisa: toPaisa(old.netAmount.toNumber()),
      },
      charge,
      dueDate,
    };
  }
}
