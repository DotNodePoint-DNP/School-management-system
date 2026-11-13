import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  adToBsString,
  isoToDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { chunked } from '../../common/utils/chunked.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { reserveSequence } from '../../common/utils/sequence.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DuesReportService, type OpenInvoice } from './dues-report.service.js';
import type {
  LateFineRunDto,
  ListLateFinesQueryDto,
  SetLateFeePolicyDto,
} from './dto/late-fee.dto.js';
import { FiscalYearsService } from './fiscal-years.service.js';
import { formatInvoiceNumber } from './invoice-generation.service.js';
import {
  InvoiceBalanceService,
  invoiceStatus,
  type Balance,
} from './invoice-balance.service.js';
import {
  fineFor,
  isFinable,
  type FinePolicyInput,
} from './late-fee-calculator.js';

type Tx = Prisma.TransactionClient;
type Db = Pick<Tx, 'enrollment' | 'lateFine'>;
const TX = { maxWait: 15_000, timeout: 120_000 } as const;
const CHUNK = 150;
const IN_LIMIT = 5000;
const PREVIEW_LIMIT = 2000;

const POLICY_SELECT = {
  id: true,
  enabled: true,
  type: true,
  value: true,
  graceDays: true,
  minOutstanding: true,
  maxFine: true,
  fineAdmission: true,
  appliesFromDueDate: true,
  feeHeadId: true,
  createdById: true,
  createdAt: true,
  feeHead: { select: { id: true, code: true, name: true } },
} satisfies Prisma.LateFeePolicySelect;
type PolicyRow = Prisma.LateFeePolicyGetPayload<{
  select: typeof POLICY_SELECT;
}>;

const policyInput = (p: PolicyRow): FinePolicyInput => ({
  type: p.type,
  value:
    p.type === 'FIXED'
      ? toPaisa(p.value.toNumber())
      : Math.round(p.value.toNumber() * 100),
  maxFinePaisa: p.maxFine ? toPaisa(p.maxFine.toNumber()) : null,
  graceDays: p.graceDays,
  minOutstandingPaisa: toPaisa(p.minOutstanding.toNumber()),
  fineAdmission: p.fineAdmission,
  appliesFromDueDate: toIsoDate(p.appliesFromDueDate),
});

export type SkipReason =
  | 'ALREADY_FINED'
  | 'NO_CURRENT_ENROLLMENT'
  | 'FINE_IS_ZERO'
  | 'CHANGED_SINCE_PREVIEW';
interface Target {
  enrollmentId: string;
  academicYearId: string;
}
interface Candidate {
  invoice: OpenInvoice;
  target: Target;
  finePaisa: number;
}
interface Skipped {
  invoiceNumber: string;
  studentId: string;
  reason: SkipReason;
}
const summarise = (counts: Iterable<string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of counts) out[r] = (out[r] ?? 0) + 1;
  return out;
};

@Injectable()
export class LateFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalYears: FiscalYearsService,
    private readonly years: AcademicYearsService,
    private readonly dues: DuesReportService,
    private readonly balances: InvoiceBalanceService,
  ) {}

  // ---------------------------------------------------------------- the policy

  async policy() {
    const rows = await this.prisma.lateFeePolicy.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: POLICY_SELECT,
    });
    const names = await this.names(rows.map((r) => r.createdById));
    const view = (p: PolicyRow) => ({
      id: p.id,
      enabled: p.enabled,
      type: p.type,
      value: p.value.toNumber(),
      graceDays: p.graceDays,
      minOutstanding: p.minOutstanding.toNumber(),
      maxFine: p.maxFine?.toNumber() ?? null,
      fineAdmission: p.fineAdmission,
      appliesFromDueDate: toIsoDate(p.appliesFromDueDate),
      appliesFromDueDateBs: adToBsString(toIsoDate(p.appliesFromDueDate)),
      feeHead: p.feeHead,
      setBy: names.get(p.createdById) ?? null,
      setAt: p.createdAt.toISOString(),
    });
    return { policy: rows[0] ? view(rows[0]) : null, history: rows.map(view) };
  }

  /** Saves a new version of the policy. The newest version is the one in force. */
  async setPolicy(dto: SetLateFeePolicyDto, actor: AuthUser) {
    if (dto.type === 'PERCENT' && dto.value > 100)
      throw new BadRequestException('A percentage cannot be more than 100');
    const from =
      resolveDate(
        'appliesFromDueDate',
        dto.appliesFromDueDate,
        dto.appliesFromDueDateBs,
      ) ?? todayIso();
    const head = dto.feeHeadId
      ? await this.prisma.feeHead.findUnique({
          where: { id: dto.feeHeadId },
          select: {
            id: true,
            code: true,
            frequency: true,
            perStudent: true,
            isActive: true,
          },
        })
      : await this.prisma.feeHead.findUnique({
          where: { code: 'FINE' },
          select: {
            id: true,
            code: true,
            frequency: true,
            perStudent: true,
            isActive: true,
          },
        });
    if (!head)
      throw new BadRequestException(
        dto.feeHeadId
          ? 'That fee head does not exist'
          : 'The standard FINE fee head is missing. Run the seed, or choose a fee head.',
      );
    if (!head.isActive)
      throw new ConflictException(`The fee head ${head.code} is inactive`);
    if (head.frequency !== 'AD_HOC' || head.perStudent)
      throw new BadRequestException(
        `${head.code} cannot hold fines: choose an ad-hoc fee head that is not per-student`,
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('late_fee_policy'))`;
      await tx.lateFeePolicy.create({
        data: {
          enabled: dto.enabled,
          type: dto.type,
          value: dto.value,
          graceDays: dto.graceDays,
          minOutstanding: dto.minOutstanding ?? 1,
          maxFine: dto.maxFine ?? null,
          fineAdmission: dto.fineAdmission === true,
          appliesFromDueDate: isoToDate(from),
          feeHeadId: head.id,
          createdById: actor.id,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'late_fee.policy_set',
        entityType: 'late_fee_policy',
        entityId: head.id,
        details: {
          enabled: dto.enabled,
          type: dto.type,
          value: dto.value,
          graceDays: dto.graceDays,
          minOutstanding: dto.minOutstanding ?? 1,
          maxFine: dto.maxFine ?? null,
          appliesFrom: from,
        },
      });
    }, TX);
    return this.policy();
  }

  // ---------------------------------------------------------------- preview and apply

  async preview(dto: LateFineRunDto) {
    const policy = await this.requireActive();
    const today = todayIso();
    const plan = await this.plan(policy, dto, today);

    const studentIds = [
      ...new Set([
        ...plan.candidates.map((c) => c.invoice.studentId),
        ...plan.skipped.map((s) => s.studentId),
      ]),
    ];
    const [students, periods] = await Promise.all([
      this.studentInfo(studentIds),
      this.prisma.billingPeriod.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                plan.candidates.flatMap((c) =>
                  c.invoice.periodId ? [c.invoice.periodId] : [],
                ),
              ),
            ],
          },
        },
        select: { id: true, name: true },
      }),
    ]);
    const periodName = new Map(periods.map((p) => [p.id, p.name] as const));
    const view = await this.policy();
    return {
      policy: view.policy,
      asOf: today,
      count: plan.candidates.length,
      total: fromPaisa(plan.totalPaisa),
      candidates: plan.candidates.slice(0, PREVIEW_LIMIT).map((c) => ({
        invoiceId: c.invoice.id,
        invoiceNumber: c.invoice.number,
        kind: c.invoice.kind,
        period: c.invoice.periodId
          ? (periodName.get(c.invoice.periodId) ?? null)
          : null,
        dueDate: c.invoice.dueDate,
        daysOverdue: c.invoice.daysOverdue,
        base: fromPaisa(c.invoice.outstandingPaisa),
        fine: fromPaisa(c.finePaisa),
        student: students.get(c.invoice.studentId) ?? null,
        targetEnrollmentId: c.target.enrollmentId,
        targetAcademicYearId: c.target.academicYearId,
      })),
      skipped: plan.skipped
        .slice(0, PREVIEW_LIMIT)
        .map((s) => ({
          invoiceNumber: s.invoiceNumber,
          admissionNo: students.get(s.studentId)?.admissionNo ?? null,
          reason: s.reason,
        })),
      skippedSummary: summarise(plan.skipped.map((s) => s.reason)),
      truncated:
        plan.candidates.length > PREVIEW_LIMIT ||
        plan.skipped.length > PREVIEW_LIMIT,
    };
  }

  async apply(dto: LateFineRunDto, actor: AuthUser) {
    const policy = await this.requireActive();
    const today = todayIso();
    const fiscalYear = await this.fiscalYears.openFor(today);
    const plan = await this.plan(policy, dto, today);
    if (
      dto.expect &&
      (dto.expect.count !== plan.candidates.length ||
        toPaisa(dto.expect.total) !== plan.totalPaisa)
    ) {
      throw new ConflictException(
        `The figures changed since the preview (now ${plan.candidates.length} fine(s), NPR ${fromPaisa(plan.totalPaisa)}). Preview again before applying.`,
      );
    }
    const skippedCounts = summarise(plan.skipped.map((s) => s.reason));
    if (plan.candidates.length === 0)
      return {
        runId: null,
        created: 0,
        total: 0,
        firstNumber: null,
        lastNumber: null,
        chunks: 0,
        skippedSummary: skippedCounts,
      };

    const run = await this.prisma.lateFineRun.create({
      data: {
        policyId: policy.id,
        asOf: isoToDate(today),
        createdById: actor.id,
      },
      select: { id: true },
    });
    let created = 0;
    let totalPaisa = 0;
    let first: string | null = null;
    let last: string | null = null;
    let chunks = 0;
    for (const part of chunked(
      plan.candidates.map((c) => c.invoice.id),
      CHUNK,
    )) {
      const r = await this.prisma.$transaction(
        (tx) =>
          this.commitChunk(
            tx,
            { runId: run.id, policy, fiscalYear, today },
            part,
            actor,
          ),
        TX,
      );
      chunks += 1;
      created += r.created;
      totalPaisa += r.totalPaisa;
      first ??= r.first;
      last = r.last ?? last;
      for (const [reason, n] of Object.entries(r.skipped))
        skippedCounts[reason] = (skippedCounts[reason] ?? 0) + n;
    }
    return {
      runId: run.id,
      created,
      total: fromPaisa(totalPaisa),
      firstNumber: first,
      lastNumber: last,
      chunks,
      skippedSummary: skippedCounts,
    };
  }

  /** One transaction: lock the years, enrollments and source invoices, recalculate from scratch, number, and write in bulk. */
  private async commitChunk(
    tx: Tx,
    ctx: {
      runId: string;
      policy: PolicyRow;
      fiscalYear: { id: string; label: string };
      today: string;
    },
    invoiceIds: string[],
    actor: AuthUser,
  ): Promise<{
    created: number;
    totalPaisa: number;
    first: string | null;
    last: string | null;
    skipped: Record<string, number>;
  }> {
    await this.fiscalYears.lockOpen(tx, ctx.fiscalYear.id);
    const input = policyInput(ctx.policy);
    const skipped: string[] = [];

    // Lock order: academic years (shared), enrollments, then the source invoices.
    const guess = await this.resolveTargets(
      tx,
      await this.dues.openInvoices({ invoiceIds }, tx, ctx.today),
    );
    const yearIds = [
      ...new Set(
        [...guess.values()].flatMap((t) => (t ? [t.academicYearId] : [])),
      ),
    ].sort();
    const closed = new Set<string>();
    for (const id of yearIds)
      if ((await this.years.lockYearShared(tx, id)).status === 'CLOSED')
        closed.add(id);
    const enrollmentIds = [
      ...new Set(
        [...guess.values()].flatMap((t) =>
          t && !closed.has(t.academicYearId) ? [t.enrollmentId] : [],
        ),
      ),
    ].sort();
    if (enrollmentIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id IN (${Prisma.join(enrollmentIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
    }
    const sorted = [...invoiceIds].sort();
    await tx.$queryRaw`SELECT id FROM invoices WHERE id IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
    const locked = new Set(enrollmentIds);

    // Recalculate under the locks. Anything that changed in the meantime is skipped, never guessed.
    const open = (
      await this.dues.openInvoices({ invoiceIds }, tx, ctx.today)
    ).sort((a, b) => a.number.localeCompare(b.number));
    const fined = await this.alreadyFined(
      tx,
      open.map((o) => o.id),
    );
    const targets = await this.resolveTargets(tx, open);
    const rows: Candidate[] = [];
    for (const inv of open) {
      if (!isFinable(inv, input)) {
        skipped.push('CHANGED_SINCE_PREVIEW');
        continue;
      }
      if (fined.has(inv.id)) {
        skipped.push('ALREADY_FINED');
        continue;
      }
      const target = targets.get(inv.id);
      if (
        !target ||
        !locked.has(target.enrollmentId) ||
        closed.has(target.academicYearId)
      ) {
        skipped.push('CHANGED_SINCE_PREVIEW');
        continue;
      }
      const finePaisa = fineFor(input, inv.outstandingPaisa);
      if (finePaisa <= 0) {
        skipped.push('FINE_IS_ZERO');
        continue;
      }
      rows.push({ invoice: inv, target, finePaisa });
    }
    for (let i = open.length; i < invoiceIds.length; i++)
      skipped.push('CHANGED_SINCE_PREVIEW'); // paid, voided or settled meanwhile
    if (rows.length === 0)
      return {
        created: 0,
        totalPaisa: 0,
        first: null,
        last: null,
        skipped: summarise(skipped),
      };

    const start = await reserveSequence(
      tx,
      `invoice:${ctx.fiscalYear.id}`,
      rows.length,
    );
    const made = rows.map((c, i) => ({
      c,
      id: randomUUID(),
      number: formatInvoiceNumber(ctx.fiscalYear.label, start + i),
    }));
    const note = (c: Candidate): string => `Late fine for ${c.invoice.number}`;
    await tx.invoice.createMany({
      data: made.map(({ c, id, number }) => ({
        id,
        number,
        fiscalYearId: ctx.fiscalYear.id,
        kind: 'AD_HOC' as const,
        enrollmentId: c.target.enrollmentId,
        studentId: c.invoice.studentId,
        academicYearId: c.target.academicYearId,
        periodId: null,
        revision: 1,
        description: note(c),
        issuedOn: isoToDate(ctx.today),
        dueDate: isoToDate(ctx.today),
        grossAmount: fromPaisa(c.finePaisa),
        discountAmount: 0,
        netAmount: fromPaisa(c.finePaisa),
        createdById: actor.id,
        requestKey: `latefine:${c.invoice.id}`,
      })),
    });
    await tx.invoiceLine.createMany({
      data: made.map(({ c, id }) => ({
        invoiceId: id,
        feeHeadId: ctx.policy.feeHeadId,
        descriptionEn: note(c),
        descriptionNp: null,
        source: 'MANUAL' as const,
        grossAmount: fromPaisa(c.finePaisa),
        lineDiscount: 0,
        invoiceDiscountShare: 0,
        netAmount: fromPaisa(c.finePaisa),
      })),
    });
    await tx.lateFine.createMany({
      data: made.map(({ c, id }) => ({
        runId: ctx.runId,
        sourceInvoiceId: c.invoice.id,
        fineInvoiceId: id,
        baseAmount: fromPaisa(c.invoice.outstandingPaisa),
        amount: fromPaisa(c.finePaisa),
        daysOverdue: c.invoice.daysOverdue,
      })),
    });
    const totalPaisa = rows.reduce((n, c) => n + c.finePaisa, 0);
    // Numbers only: no names in the audit log.
    await this.audit.recordIn(tx, {
      actor,
      action: 'late_fee.run',
      entityType: 'late_fine_run',
      entityId: ctx.runId,
      details: {
        created: rows.length,
        total: fromPaisa(totalPaisa),
        first: made[0]?.number,
        last: made.at(-1)?.number,
      },
    });
    return {
      created: rows.length,
      totalPaisa,
      first: made[0]?.number ?? null,
      last: made.at(-1)?.number ?? null,
      skipped: summarise(skipped),
    };
  }

  // ---------------------------------------------------------------- reading what was applied

  async list(q: ListLateFinesQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.LateFineWhereInput = {};
    if (q.runId) where.runId = q.runId;
    if (q.studentId) where.sourceInvoice = { studentId: q.studentId };
    if (q.classId)
      where.sourceInvoice = {
        ...(where.sourceInvoice as object | undefined),
        enrollment: { classId: q.classId },
      };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lateFine.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          runId: true,
          amount: true,
          baseAmount: true,
          daysOverdue: true,
          createdAt: true,
          sourceInvoice: {
            select: {
              id: true,
              number: true,
              dueDate: true,
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
                    select: {
                      name: true,
                      schoolClass: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
          fineInvoice: { select: { id: true, number: true, dueDate: true } },
        },
      }),
      this.prisma.lateFine.count({ where }),
    ]);
    const balances = await this.balances.load(
      rows.map((r) => r.fineInvoice.id),
    );
    const today = todayIso();
    return toPaginated(
      rows.map((r) => {
        const b = balances.get(r.fineInvoice.id) as Balance;
        const { status } = invoiceStatus(
          b,
          toIsoDate(r.fineInvoice.dueDate),
          today,
        );
        return {
          id: r.id,
          runId: r.runId,
          amount: r.amount.toNumber(),
          base: r.baseAmount.toNumber(),
          daysOverdue: r.daysOverdue,
          appliedAt: r.createdAt.toISOString(),
          sourceInvoice: {
            id: r.sourceInvoice.id,
            number: r.sourceInvoice.number,
            dueDate: toIsoDate(r.sourceInvoice.dueDate),
          },
          fineInvoice: {
            id: r.fineInvoice.id,
            number: r.fineInvoice.number,
            status,
            outstanding: fromPaisa(b.outstandingPaisa),
          },
          student: {
            id: r.sourceInvoice.student.id,
            admissionNo: r.sourceInvoice.student.admissionNo,
            name: displayName(r.sourceInvoice.student),
          },
          className: r.sourceInvoice.enrollment.section.schoolClass.name,
          sectionName: r.sourceInvoice.enrollment.section.name,
        };
      }),
      total,
      q,
    );
  }

  async runs() {
    const runs = await this.prisma.lateFineRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        asOf: true,
        createdAt: true,
        createdById: true,
        policy: { select: { type: true, value: true, graceDays: true } },
      },
    });
    const [sums, names] = await Promise.all([
      this.prisma.lateFine.groupBy({
        by: ['runId'],
        where: { runId: { in: runs.map((r) => r.id) } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.names(runs.map((r) => r.createdById)),
    ]);
    const sumBy = new Map(sums.map((s) => [s.runId, s] as const));
    return runs.map((r) => ({
      id: r.id,
      asOf: toIsoDate(r.asOf),
      asOfBs: adToBsString(toIsoDate(r.asOf)),
      appliedAt: r.createdAt.toISOString(),
      appliedBy: names.get(r.createdById) ?? null,
      policy: {
        type: r.policy.type,
        value: r.policy.value.toNumber(),
        graceDays: r.policy.graceDays,
      },
      fines: sumBy.get(r.id)?._count._all ?? 0,
      total: sumBy.get(r.id)?._sum.amount?.toNumber() ?? 0,
    }));
  }

  // ---------------------------------------------------------------- internals

  private async requireActive(): Promise<PolicyRow> {
    const row = await this.prisma.lateFeePolicy.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: POLICY_SELECT,
    });
    if (!row)
      throw new ConflictException(
        'Late fines are not set up yet. Set the late fee policy first.',
      );
    if (!row.enabled)
      throw new ConflictException(
        'Late fines are switched off in the current policy',
      );
    return row;
  }

  private async plan(
    policy: PolicyRow,
    f: { classId?: string; sectionId?: string; studentIds?: string[] },
    today: string,
  ) {
    const input = policyInput(policy);
    const open = (await this.dues.openInvoices(f, this.prisma, today))
      .filter((inv) => isFinable(inv, input))
      .sort((a, b) => a.number.localeCompare(b.number));
    const fined = await this.alreadyFined(
      this.prisma,
      open.map((o) => o.id),
    );
    const targets = await this.resolveTargets(
      this.prisma,
      open.filter((o) => !fined.has(o.id)),
    );

    const candidates: Candidate[] = [];
    const skipped: Skipped[] = [];
    for (const inv of open) {
      const skip = (reason: SkipReason): void =>
        void skipped.push({
          invoiceNumber: inv.number,
          studentId: inv.studentId,
          reason,
        });
      if (fined.has(inv.id)) {
        skip('ALREADY_FINED');
        continue;
      }
      const target = targets.get(inv.id);
      if (!target) {
        skip('NO_CURRENT_ENROLLMENT');
        continue;
      }
      const finePaisa = fineFor(input, inv.outstandingPaisa);
      if (finePaisa <= 0) {
        skip('FINE_IS_ZERO');
        continue;
      }
      candidates.push({ invoice: inv, target, finePaisa });
    }
    return {
      candidates,
      skipped,
      totalPaisa: candidates.reduce((n, c) => n + c.finePaisa, 0),
    };
  }

  /** Where a fine goes: the invoice's own enrollment while it is open and the student is enrolled; otherwise the current one. */
  private async resolveTargets(
    db: Db,
    invoices: OpenInvoice[],
  ): Promise<Map<string, Target | null>> {
    const result = new Map<string, Target | null>();
    const own = new Map<string, Target>();
    for (const part of chunked(
      [...new Set(invoices.map((i) => i.enrollmentId))],
      IN_LIMIT,
    )) {
      const rows = await db.enrollment.findMany({
        where: { id: { in: part } },
        select: {
          id: true,
          status: true,
          academicYearId: true,
          academicYear: { select: { status: true } },
        },
      });
      for (const e of rows)
        if (e.status === 'ENROLLED' && e.academicYear.status !== 'CLOSED')
          own.set(e.id, {
            enrollmentId: e.id,
            academicYearId: e.academicYearId,
          });
    }
    const fallbackStudents = [
      ...new Set(
        invoices
          .filter((i) => !own.has(i.enrollmentId))
          .map((i) => i.studentId),
      ),
    ];
    const fallback = new Map<string, Target>();
    for (const part of chunked(fallbackStudents, IN_LIMIT)) {
      const rows = await db.enrollment.findMany({
        where: {
          studentId: { in: part },
          status: 'ENROLLED',
          academicYear: { status: { in: ['ACTIVE', 'PLANNED'] } },
        },
        orderBy: { academicYear: { startDate: 'desc' } },
        select: { id: true, studentId: true, academicYearId: true },
      });
      for (const e of rows)
        if (!fallback.has(e.studentId))
          fallback.set(e.studentId, {
            enrollmentId: e.id,
            academicYearId: e.academicYearId,
          });
    }
    for (const inv of invoices)
      result.set(
        inv.id,
        own.get(inv.enrollmentId) ?? fallback.get(inv.studentId) ?? null,
      );
    return result;
  }

  private async alreadyFined(db: Db, ids: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const part of chunked(ids, IN_LIMIT)) {
      const rows = await db.lateFine.findMany({
        where: { sourceInvoiceId: { in: part } },
        select: { sourceInvoiceId: true },
      });
      for (const r of rows) out.add(r.sourceInvoiceId);
    }
    return out;
  }

  private async studentInfo(ids: string[]) {
    const out = new Map<
      string,
      {
        id: string;
        admissionNo: string;
        name: string;
        className: string | null;
        sectionName: string | null;
      }
    >();
    for (const part of chunked(ids, IN_LIMIT)) {
      const rows = await this.prisma.student.findMany({
        where: { id: { in: part } },
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
      for (const r of rows) {
        out.set(r.id, {
          id: r.id,
          admissionNo: r.admissionNo,
          name: displayName(r),
          className: r.enrollments[0]?.section.schoolClass.name ?? null,
          sectionName: r.enrollments[0]?.section.name ?? null,
        });
      }
    }
    return out;
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName] as const));
  }
}
