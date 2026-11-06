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
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  DecideAdjustmentDto,
  ListAdjustmentsQueryDto,
  RejectAdjustmentDto,
  RequestAdjustmentDto,
} from './dto/invoice-corrections.dto.js';
import { FiscalYearsService } from './fiscal-years.service.js';
import {
  type Balance,
  InvoiceBalanceService,
} from './invoice-balance.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SELECT = {
  id: true,
  kind: true,
  amount: true,
  reason: true,
  requestedById: true,
  requestedAt: true,
  invoice: {
    select: {
      id: true,
      number: true,
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
    },
  },
  decision: {
    select: { approved: true, decidedById: true, note: true, decidedAt: true },
  },
} satisfies Prisma.InvoiceAdjustmentSelect;
type Row = Prisma.InvoiceAdjustmentGetPayload<{ select: typeof SELECT }>;

export interface AdjustmentResponse {
  id: string;
  kind: 'WAIVER' | 'WRITE_OFF' | 'CORRECTION';
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Visible only to people who request or approve credit notes. */
  reason: string | null;
  decisionNote: string | null;
  requestedBy: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  invoice: {
    id: string;
    number: string;
    net: number;
    outstanding: number;
    voided: boolean;
    fiscalYear: { id: string; label: string };
  };
  student: {
    id: string;
    admissionNo: string;
    name: string;
    className: string;
    sectionName: string;
  };
}

@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalYears: FiscalYearsService,
    private readonly balances: InvoiceBalanceService,
  ) {}

  async list(
    q: ListAdjustmentsQueryDto,
    actor: AuthUser,
  ): Promise<Paginated<AdjustmentResponse>> {
    const where: Prisma.InvoiceAdjustmentWhereInput = {};
    if (q.kind) where.kind = q.kind;
    if (q.status === 'PENDING') where.decision = { is: null };
    if (q.status === 'APPROVED') where.decision = { is: { approved: true } };
    if (q.status === 'REJECTED') where.decision = { is: { approved: false } };
    if (q.fiscalYearId || q.classId) {
      where.invoice = {
        ...(q.fiscalYearId ? { fiscalYearId: q.fiscalYearId } : {}),
        ...(q.classId ? { enrollment: { classId: q.classId } } : {}),
      };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoiceAdjustment.findMany({
        where,
        orderBy: [
          { requestedAt: q.status === 'PENDING' ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT,
      }),
      this.prisma.invoiceAdjustment.count({ where }),
    ]);
    return toPaginated(await this.present(rows, actor), total, q);
  }

  async get(id: string, actor: AuthUser): Promise<AdjustmentResponse> {
    const row = await this.prisma.invoiceAdjustment.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Credit note not found');
    return (await this.present([row], actor))[0] as AdjustmentResponse;
  }

  async request(
    invoiceId: string,
    dto: RequestAdjustmentDto,
    actor: AuthUser,
  ): Promise<AdjustmentResponse> {
    const amountPaisa = toPaisa(dto.amount);
    const id = await this.prisma.$transaction(async (tx) => {
      const inv = await this.lock(tx, invoiceId, true);
      if (inv.void)
        throw new ConflictException(
          'This invoice is void, so it cannot be adjusted',
        );
      const balance = (await this.balances.load([invoiceId], tx)).get(
        invoiceId,
      ) as Balance;
      if (amountPaisa > balance.outstandingPaisa) {
        throw new BadRequestException(
          `The amount is more than the NPR ${fromPaisa(balance.outstandingPaisa)} still owed on this invoice`,
        );
      }
      const same = await tx.invoiceAdjustment.findFirst({
        where: {
          invoiceId,
          kind: dto.kind,
          amount: dto.amount,
          decision: { is: null },
        },
        select: { id: true },
      });
      if (same)
        throw new ConflictException(
          'An identical credit note is already waiting for a decision on this invoice',
        );

      const created = await tx.invoiceAdjustment.create({
        data: {
          invoiceId,
          kind: dto.kind,
          amount: dto.amount,
          reason: dto.reason,
          requestedById: actor.id,
        },
        select: { id: true },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'adjustment.requested',
        entityType: 'invoice',
        entityId: invoiceId,
        details: {
          invoiceNumber: inv.number,
          kind: dto.kind,
          amount: dto.amount,
        },
      });
      return created.id;
    }, TX);
    return this.get(id, actor);
  }

  async approve(
    id: string,
    dto: DecideAdjustmentDto,
    actor: AuthUser,
  ): Promise<AdjustmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      const adj = await this.find(tx, id);
      const inv = await this.lock(tx, adj.invoiceId, true);
      if (
        await tx.invoiceAdjustmentDecision.findUnique({
          where: { adjustmentId: id },
          select: { adjustmentId: true },
        })
      ) {
        throw new ConflictException(
          'This credit note has already been decided',
        );
      }
      if (adj.requestedById === actor.id)
        throw new ConflictException(
          'A credit note must be approved by someone other than the person who requested it',
        );
      if (inv.void)
        throw new ConflictException(
          'This invoice is void, so it cannot be adjusted',
        );
      const balance = (await this.balances.load([adj.invoiceId], tx)).get(
        adj.invoiceId,
      ) as Balance;
      const amountPaisa = toPaisa(adj.amount.toNumber());
      if (amountPaisa > balance.outstandingPaisa) {
        throw new ConflictException(
          `This credit note is for NPR ${adj.amount.toNumber()}, but only NPR ${fromPaisa(balance.outstandingPaisa)} is still owed`,
        );
      }
      await tx.invoiceAdjustmentDecision.create({
        data: {
          adjustmentId: id,
          approved: true,
          decidedById: actor.id,
          note: dto.note,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'adjustment.approved',
        entityType: 'invoice',
        entityId: adj.invoiceId,
        details: {
          invoiceNumber: inv.number,
          kind: adj.kind,
          amount: adj.amount.toNumber(),
        },
      });
    }, TX);
    return this.get(id, actor);
  }

  async reject(
    id: string,
    dto: RejectAdjustmentDto,
    actor: AuthUser,
  ): Promise<AdjustmentResponse> {
    await this.decideNo(id, dto.note, actor, false);
    return this.get(id, actor);
  }

  /** Only the person who asked can take a request back. */
  async withdraw(id: string, actor: AuthUser): Promise<AdjustmentResponse> {
    await this.decideNo(id, 'Withdrawn by the requester', actor, true);
    return this.get(id, actor);
  }

  // ---------------------------------------------------------------- internals

  /** Rejecting never needs an open fiscal year, so the queue can always be cleared. */
  private async decideNo(
    id: string,
    note: string,
    actor: AuthUser,
    withdrawn: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const adj = await this.find(tx, id);
      if (withdrawn && adj.requestedById !== actor.id)
        throw new ForbiddenException(
          'Only the person who requested a credit note can withdraw it',
        );
      const inv = await this.lock(tx, adj.invoiceId, false);
      if (
        await tx.invoiceAdjustmentDecision.findUnique({
          where: { adjustmentId: id },
          select: { adjustmentId: true },
        })
      ) {
        throw new ConflictException(
          'This credit note has already been decided',
        );
      }
      await tx.invoiceAdjustmentDecision.create({
        data: {
          adjustmentId: id,
          approved: false,
          decidedById: actor.id,
          note,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'adjustment.rejected',
        entityType: 'invoice',
        entityId: adj.invoiceId,
        details: {
          invoiceNumber: inv.number,
          kind: adj.kind,
          amount: adj.amount.toNumber(),
          withdrawn,
        },
      });
    }, TX);
  }

  private async find(tx: Tx, id: string) {
    const adj = await tx.invoiceAdjustment.findUnique({
      where: { id },
      select: {
        invoiceId: true,
        kind: true,
        amount: true,
        requestedById: true,
      },
    });
    if (!adj) throw new NotFoundException('Credit note not found');
    return adj;
  }

  /** Lock order: fiscal year (shared), then the invoice row. */
  private async lock(
    tx: Tx,
    invoiceId: string,
    requireOpenFiscalYear: boolean,
  ) {
    const found = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { fiscalYearId: true },
    });
    if (!found) throw new NotFoundException('Invoice not found');
    if (requireOpenFiscalYear)
      await this.fiscalYears.lockOpen(tx, found.fiscalYearId);
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    return tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { number: true, void: { select: { invoiceId: true } } },
    });
  }

  private async present(
    rows: Row[],
    actor: AuthUser,
  ): Promise<AdjustmentResponse[]> {
    const balances = await this.balances.load([
      ...new Set(rows.map((r) => r.invoice.id)),
    ]);
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.requestedById, r.decision?.decidedById])
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
    const seesReasons =
      actor.permissions.includes('fees:adjust') ||
      actor.permissions.includes('fees:adjust-approve');

    return rows.map((r) => {
      const b = balances.get(r.invoice.id) as Balance;
      return {
        id: r.id,
        kind: r.kind,
        amount: r.amount.toNumber(),
        status:
          r.decision === null
            ? 'PENDING'
            : r.decision.approved
              ? 'APPROVED'
              : 'REJECTED',
        reason: seesReasons ? r.reason : null,
        decisionNote: seesReasons ? (r.decision?.note ?? null) : null,
        requestedBy: name.get(r.requestedById) ?? null,
        requestedAt: r.requestedAt.toISOString(),
        decidedBy: r.decision
          ? (name.get(r.decision.decidedById) ?? null)
          : null,
        decidedAt: r.decision?.decidedAt.toISOString() ?? null,
        invoice: {
          id: r.invoice.id,
          number: r.invoice.number,
          net: r.invoice.netAmount.toNumber(),
          outstanding: fromPaisa(b.outstandingPaisa),
          voided: b.voided,
          fiscalYear: r.invoice.fiscalYear,
        },
        student: {
          id: r.invoice.student.id,
          admissionNo: r.invoice.student.admissionNo,
          name: displayName(r.invoice.student),
          className: r.invoice.enrollment.section.schoolClass.name,
          sectionName: r.invoice.enrollment.section.name,
        },
      };
    });
  }
}
