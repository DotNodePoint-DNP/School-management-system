import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  dateParts,
  isoToDate,
  requireDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { reserveSequence } from '../../common/utils/sequence.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { ChargeResult } from './charge-calculator.js';
import { ChargePlannerService } from './charge-planner.service.js';
import type {
  CreateAdHocInvoiceDto,
  InvoiceRunDto,
} from './dto/invoice-run.dto.js';
import { FeeEnrollmentLockService } from './fee-enrollment-lock.service.js';

type Tx = Prisma.TransactionClient;
type Db = Pick<
  Tx,
  | 'enrollment'
  | 'billingPeriod'
  | 'feeStructureLine'
  | 'studentFeeAssignment'
  | 'studentDiscount'
  | 'invoice'
>;
const TX = { maxWait: 15_000, timeout: 120_000 } as const;
const CHUNK = 200;
const PREVIEW_LIST_LIMIT = 2000;

export const formatInvoiceNumber = (fiscalLabel: string, n: number): string =>
  `INV-${fiscalLabel}-${String(n).padStart(6, '0')}`;

export type SkipReason =
  | 'ALREADY_INVOICED'
  | 'VOIDED_NEEDS_REISSUE'
  | 'NOT_ENROLLED'
  | 'NOT_A_NEW_STUDENT'
  | 'NO_ADMISSION_FEES'
  | 'NOTHING_TO_BILL'
  | 'FULLY_DISCOUNTED';
interface Skipped {
  enrollmentId: string;
  admissionNo: string;
  name: string;
  reason: SkipReason;
}
interface Candidate {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  className: string;
  sectionName: string;
  charge: ChargeResult;
}

interface Resolved {
  kind: 'PERIODIC' | 'ADMISSION';
  academicYearId: string;
  period: { id: string; name: string; sequence: number } | null;
  dueDate: string;
  issuedOn: string;
  fiscalYear: { id: string; label: string };
  people: {
    id: string;
    studentId: string;
    admissionNo: string;
    name: string;
    className: string;
    sectionName: string;
  }[];
}

export interface RunPreview {
  kind: 'PERIODIC' | 'ADMISSION';
  academicYearId: string;
  period: { id: string; name: string } | null;
  issuedOn: string;
  dueDate: string;
  fiscalYear: { id: string; label: string };
  willCreate: number;
  gross: number;
  discount: number;
  net: number;
  byHead: { code: string; name: string; net: number }[];
  students: {
    enrollmentId: string;
    admissionNo: string;
    name: string;
    className: string;
    sectionName: string;
    gross: number;
    discount: number;
    net: number;
    lines: { code: string; net: number }[];
  }[];
  skipped: Skipped[];
  skippedSummary: Record<string, number>;
  truncated: boolean;
}

export interface RunResult {
  created: number;
  net: number;
  firstNumber: string | null;
  lastNumber: string | null;
  chunks: number;
  skipped: Skipped[];
  skippedSummary: Record<string, number>;
}

export interface InvoiceRef {
  id: string;
  number: string;
}

@Injectable()
export class InvoiceGenerationService {
  private readonly logger = new Logger(InvoiceGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly planner: ChargePlannerService,
    private readonly locks: FeeEnrollmentLockService,
  ) {}

  // ---------------------------------------------------------------- periodic and admission runs

  async preview(dto: InvoiceRunDto): Promise<RunPreview> {
    const resolved = await this.resolve(dto);
    const { candidates, skipped } = await this.computeAll(
      this.prisma,
      resolved,
    );
    return this.toPreview(resolved, candidates, skipped);
  }

  async commit(dto: InvoiceRunDto, actor: AuthUser): Promise<RunResult> {
    const resolved = await this.resolve(dto);
    const { candidates, skipped: initiallySkipped } = await this.computeAll(
      this.prisma,
      resolved,
    );

    if (dto.expect) {
      const net = candidates.reduce((n, c) => n + c.charge.netPaisa, 0);
      if (
        dto.expect.count !== candidates.length ||
        toPaisa(dto.expect.netTotal) !== net
      ) {
        throw new ConflictException(
          `The figures changed since the preview (now ${candidates.length} invoice(s), NPR ${fromPaisa(net)}). Preview again before generating.`,
        );
      }
    }

    const skipped = [...initiallySkipped];
    const heads = await this.headMap();
    let created = 0;
    let netPaisa = 0;
    let first: string | null = null;
    let last: string | null = null;
    let chunks = 0;
    const ids = candidates.map((c) => c.enrollmentId);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const result = await this.prisma.$transaction(
        (tx) =>
          this.commitChunk(tx, resolved, ids.slice(i, i + CHUNK), heads, actor),
        TX,
      );
      chunks += 1;
      created += result.created;
      netPaisa += result.netPaisa;
      first ??= result.first;
      last = result.last ?? last;
      skipped.push(...result.skipped);
    }
    return {
      created,
      net: fromPaisa(netPaisa),
      firstNumber: first,
      lastNumber: last,
      chunks,
      skipped,
      skippedSummary: this.summarise(skipped),
    };
  }

  /** One transaction: lock, recalculate, number, and write in bulk. Anything now invoiced elsewhere is skipped, not duplicated. */
  private async commitChunk(
    tx: Tx,
    r: Resolved,
    enrollmentIds: string[],
    heads: Map<string, { name: string; nameNp: string | null }>,
    actor: AuthUser,
  ): Promise<{
    created: number;
    netPaisa: number;
    first: string | null;
    last: string | null;
    skipped: Skipped[];
  }> {
    const year = await this.years.lockYearShared(tx, r.academicYearId);
    if (year.status === 'CLOSED')
      throw new ConflictException(
        'This academic year is closed and can no longer be changed',
      );
    await this.lockFiscalYear(tx, r.fiscalYear.id);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice_run:${r.kind}:${r.period?.id ?? r.academicYearId}`}))`;
    await tx.$queryRaw`
      SELECT id FROM enrollments WHERE id IN (${Prisma.join(enrollmentIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;

    const { candidates, skipped } = await this.computeChunk(
      tx,
      r,
      enrollmentIds,
    );
    if (candidates.length === 0)
      return { created: 0, netPaisa: 0, first: null, last: null, skipped };

    const startNumber = await reserveSequence(
      tx,
      `invoice:${r.fiscalYear.id}`,
      candidates.length,
    );
    const rows = candidates.map((c, i) => ({
      c,
      id: randomUUID(),
      number: formatInvoiceNumber(r.fiscalYear.label, startNumber + i),
    }));
    await tx.invoice.createMany({
      data: rows.map(({ c, id, number }) => ({
        id,
        number,
        fiscalYearId: r.fiscalYear.id,
        kind: r.kind,
        enrollmentId: c.enrollmentId,
        studentId: c.studentId,
        academicYearId: r.academicYearId,
        periodId: r.period?.id ?? null,
        revision: 1,
        description: r.period?.name ?? 'Admission',
        issuedOn: isoToDate(r.issuedOn),
        dueDate: isoToDate(r.dueDate),
        grossAmount: fromPaisa(c.charge.grossPaisa),
        discountAmount: fromPaisa(
          c.charge.lineDiscountsPaisa + c.charge.invoiceDiscountPaisa,
        ),
        netAmount: fromPaisa(c.charge.netPaisa),
        createdById: actor.id,
      })),
    });
    await tx.invoiceLine.createMany({
      data: rows.flatMap(({ c, id }) =>
        c.charge.lines.map((l) => ({
          invoiceId: id,
          feeHeadId: l.feeHeadId,
          descriptionEn: heads.get(l.feeHeadId)?.name ?? l.code,
          descriptionNp: heads.get(l.feeHeadId)?.nameNp ?? null,
          source: l.source,
          grossAmount: fromPaisa(l.grossPaisa),
          lineDiscount: fromPaisa(l.lineDiscountPaisa),
          invoiceDiscountShare: fromPaisa(l.invoiceDiscountPaisa),
          netAmount: fromPaisa(l.netPaisa),
          lineDiscountId: l.lineDiscountId,
          invoiceDiscountId:
            l.invoiceDiscountPaisa > 0 ? c.charge.invoiceDiscountId : null,
        })),
      ),
    });

    const netPaisa = candidates.reduce((n, c) => n + c.charge.netPaisa, 0);
    // Counts and numbers only: no names in the audit log.
    await this.audit.recordIn(tx, {
      actor,
      action: 'invoice.run',
      entityType: 'fiscal_year',
      entityId: r.fiscalYear.id,
      details: {
        kind: r.kind,
        periodId: r.period?.id ?? null,
        academicYearId: r.academicYearId,
        created: rows.length,
        net: fromPaisa(netPaisa),
        first: rows[0]?.number ?? null,
        last: rows.at(-1)?.number ?? null,
      },
    });
    this.logger.log(
      `Invoice run (${r.kind}): ${rows.length} created in one chunk`,
    );
    return {
      created: rows.length,
      netPaisa,
      first: rows[0]?.number ?? null,
      last: rows.at(-1)?.number ?? null,
      skipped,
    };
  }

  // ---------------------------------------------------------------- ad-hoc invoices

  /** One invoice for one student: uniform, books, a diary. Ad-hoc heads only. No discounts apply. */
  async createAdHoc(
    enrollmentId: string,
    dto: CreateAdHocInvoiceDto,
    actor: AuthUser,
  ): Promise<InvoiceRef & { net: number; duplicate: boolean }> {
    const today = todayIso();
    const dueDate = resolveDate('dueDate', dto.dueDate, dto.dueDateBs) ?? today;
    if (dueDate < today)
      throw new BadRequestException('The due date cannot be in the past');
    if (dto.lines.length === 0)
      throw new BadRequestException('Add at least one charge');

    // The same form sent twice returns the invoice already created.
    const existing = await this.findByRequestKey(dto.requestKey, enrollmentId);
    if (existing) return { ...existing, duplicate: true };

    const fiscalYear = await this.currentFiscalYear(today);
    const heads = await this.prisma.feeHead.findMany({
      where: { id: { in: [...new Set(dto.lines.map((l) => l.feeHeadId))] } },
      select: {
        id: true,
        code: true,
        name: true,
        nameNp: true,
        frequency: true,
        isActive: true,
      },
    });
    const headBy = new Map(heads.map((h) => [h.id, h] as const));
    for (const line of dto.lines) {
      const head = headBy.get(line.feeHeadId);
      if (!head)
        throw new BadRequestException('One or more fee heads do not exist');
      if (!head.isActive)
        throw new ConflictException(`The fee head ${head.code} is inactive`);
      if (head.frequency !== 'AD_HOC')
        throw new BadRequestException(
          `${head.code} is not an ad-hoc head. Regular fees come from the class fee structure.`,
        );
    }
    const totalPaisa = dto.lines.reduce((n, l) => n + toPaisa(l.amount), 0);
    if (totalPaisa > 10_000_000_000)
      throw new BadRequestException(
        'This invoice is larger than the maximum allowed',
      );

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await this.lockFiscalYear(tx, fiscalYear.id);
        const { academicYearId } = await this.locks.lock(tx, enrollmentId, {
          requireEnrolled: true,
        });
        const enrollment = await tx.enrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
          select: { studentId: true },
        });
        const number = formatInvoiceNumber(
          fiscalYear.label,
          await reserveSequence(tx, `invoice:${fiscalYear.id}`, 1),
        );
        const id = randomUUID();
        await tx.invoice.create({
          data: {
            id,
            number,
            fiscalYearId: fiscalYear.id,
            kind: 'AD_HOC',
            enrollmentId,
            studentId: enrollment.studentId,
            academicYearId,
            periodId: null,
            revision: 1,
            description: dto.description ?? null,
            issuedOn: isoToDate(today),
            dueDate: isoToDate(dueDate),
            grossAmount: fromPaisa(totalPaisa),
            discountAmount: 0,
            netAmount: fromPaisa(totalPaisa),
            createdById: actor.id,
            requestKey: dto.requestKey,
            lines: {
              create: dto.lines.map((l) => {
                const head = headBy.get(l.feeHeadId) as (typeof heads)[number];
                return {
                  feeHeadId: l.feeHeadId,
                  descriptionEn: l.description ?? head.name,
                  descriptionNp: l.description ? null : head.nameNp,
                  source: 'MANUAL' as const,
                  grossAmount: l.amount,
                  lineDiscount: 0,
                  invoiceDiscountShare: 0,
                  netAmount: l.amount,
                };
              }),
            },
          },
        });
        await this.audit.recordIn(tx, {
          actor,
          action: 'invoice.created',
          entityType: 'invoice',
          entityId: id,
          details: {
            number,
            kind: 'AD_HOC',
            net: fromPaisa(totalPaisa),
            lines: dto.lines.length,
          },
        });
        return { id, number };
      }, TX);
      return { ...created, net: fromPaisa(totalPaisa), duplicate: false };
    } catch (error) {
      // Two identical requests at the same moment: the second one finds the first one's invoice.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.findByRequestKey(dto.requestKey, enrollmentId);
        if (again) return { ...again, duplicate: true };
      }
      throw error;
    }
  }

  private async findByRequestKey(
    requestKey: string,
    enrollmentId: string,
  ): Promise<(InvoiceRef & { net: number }) | null> {
    const found = await this.prisma.invoice.findUnique({
      where: { requestKey },
      select: { id: true, number: true, enrollmentId: true, netAmount: true },
    });
    if (!found) return null;
    if (found.enrollmentId !== enrollmentId)
      throw new ConflictException(
        'This request key was already used for another student. Use a new key for each invoice.',
      );
    return {
      id: found.id,
      number: found.number,
      net: found.netAmount.toNumber(),
    };
  }

  // ---------------------------------------------------------------- planning a run

  /** Turns the request into a fixed set of students, a fiscal year, a due date and an issue date. */
  private async resolve(dto: InvoiceRunDto): Promise<Resolved> {
    const selectors = [
      dto.sectionId,
      dto.classId,
      dto.enrollmentIds && dto.enrollmentIds.length > 0 ? 'ids' : undefined,
      dto.all === true ? 'all' : undefined,
    ].filter((v) => v !== undefined);
    if (selectors.length !== 1)
      throw new BadRequestException(
        'Choose exactly one of sectionId, classId, enrollmentIds or all: true',
      );

    const today = todayIso();
    let academicYearId: string;
    let period: Resolved['period'] = null;
    let dueDate: string;
    if (dto.kind === 'PERIODIC') {
      if (!dto.periodId)
        throw new BadRequestException(
          'Choose the billing period to invoice (periodId)',
        );
      if (dto.academicYearId)
        throw new BadRequestException(
          'A periodic run takes a periodId, not an academicYearId',
        );
      if (dto.dueDate || dto.dueDateBs)
        throw new BadRequestException(
          "Periodic invoices use the billing period's due date",
        );
      const p = await this.prisma.billingPeriod.findUnique({
        where: { id: dto.periodId },
        select: {
          id: true,
          academicYearId: true,
          name: true,
          sequence: true,
          dueDate: true,
        },
      });
      if (!p) throw new NotFoundException('Billing period not found');
      academicYearId = p.academicYearId;
      period = { id: p.id, name: p.name, sequence: p.sequence };
      dueDate = toIsoDate(p.dueDate);
    } else {
      if (!dto.academicYearId)
        throw new BadRequestException(
          'Choose the academic year (academicYearId)',
        );
      if (dto.periodId)
        throw new BadRequestException(
          'An admission run takes an academicYearId, not a periodId',
        );
      academicYearId = dto.academicYearId;
      dueDate = resolveDate('dueDate', dto.dueDate, dto.dueDateBs) ?? today;
      if (dueDate < today)
        throw new BadRequestException('The due date cannot be in the past');
    }

    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { status: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    if (year.status === 'CLOSED')
      throw new ConflictException(
        'This academic year is closed and can no longer be changed',
      );
    const fiscalYear = await this.currentFiscalYear(today);

    const where: Prisma.EnrollmentWhereInput = {
      academicYearId,
      status: 'ENROLLED',
    };
    if (dto.sectionId) {
      if (
        !(await this.prisma.section.findUnique({
          where: { id: dto.sectionId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Section not found');
      where.sectionId = dto.sectionId;
    }
    if (dto.classId) {
      if (
        !(await this.prisma.schoolClass.findUnique({
          where: { id: dto.classId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Class not found');
      where.classId = dto.classId;
    }
    if (dto.enrollmentIds && dto.enrollmentIds.length > 0)
      where.id = { in: dto.enrollmentIds };

    const rows = await this.prisma.enrollment.findMany({
      where,
      orderBy: [
        { section: { schoolClass: { sortOrder: 'asc' } } },
        { section: { name: 'asc' } },
        { rollNo: 'asc' },
      ],
      select: {
        id: true,
        studentId: true,
        student: {
          select: {
            admissionNo: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        section: {
          select: { name: true, schoolClass: { select: { name: true } } },
        },
      },
    });
    if (
      dto.enrollmentIds &&
      dto.enrollmentIds.length > 0 &&
      rows.length !== new Set(dto.enrollmentIds).size
    ) {
      throw new NotFoundException(
        'Some of those students are not currently enrolled in this academic year',
      );
    }
    return {
      kind: dto.kind,
      academicYearId,
      period,
      dueDate,
      issuedOn: today,
      fiscalYear,
      people: rows.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        admissionNo: e.student.admissionNo,
        name: displayName(e.student),
        className: e.section.schoolClass.name,
        sectionName: e.section.name,
      })),
    };
  }

  private async computeAll(
    db: Db,
    r: Resolved,
  ): Promise<{ candidates: Candidate[]; skipped: Skipped[] }> {
    const candidates: Candidate[] = [];
    const skipped: Skipped[] = [];
    const ids = r.people.map((p) => p.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = await this.computeChunk(db, r, ids.slice(i, i + CHUNK));
      candidates.push(...part.candidates);
      skipped.push(...part.skipped);
    }
    return { candidates, skipped };
  }

  /** Decides, for each student, whether an invoice is created, and with exactly what, or why not. */
  private async computeChunk(
    db: Db,
    r: Resolved,
    enrollmentIds: string[],
  ): Promise<{ candidates: Candidate[]; skipped: Skipped[] }> {
    const plans = await this.planner.planMany(enrollmentIds, db);
    const existing = await db.invoice.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        kind: r.kind,
        ...(r.period ? { periodId: r.period.id } : {}),
      },
      select: { enrollmentId: true, void: { select: { invoiceId: true } } },
    });
    // A live invoice wins over a voided one, whatever order they come back in.
    const state = new Map<string, 'LIVE' | 'VOIDED'>();
    for (const e of existing) {
      if (e.void === null) state.set(e.enrollmentId, 'LIVE');
      else if (!state.has(e.enrollmentId)) state.set(e.enrollmentId, 'VOIDED');
    }

    const candidates: Candidate[] = [];
    const skipped: Skipped[] = [];
    for (const id of enrollmentIds) {
      const plan = plans.get(id);
      if (!plan) continue;
      const who = {
        enrollmentId: id,
        admissionNo: plan.enrollment.admissionNo,
        name: displayName(plan.enrollment.studentName),
      };
      if (plan.enrollment.status !== 'ENROLLED') {
        skipped.push({ ...who, reason: 'NOT_ENROLLED' });
        continue;
      }
      const found = state.get(id);
      if (found === 'LIVE') {
        skipped.push({ ...who, reason: 'ALREADY_INVOICED' });
        continue;
      }
      if (found === 'VOIDED') {
        skipped.push({ ...who, reason: 'VOIDED_NEEDS_REISSUE' });
        continue;
      }

      let charge: ChargeResult | null | undefined;
      if (r.kind === 'ADMISSION') {
        if (!plan.isNewStudent) {
          skipped.push({ ...who, reason: 'NOT_A_NEW_STUDENT' });
          continue;
        }
        charge = plan.admission;
        if (!charge || charge.lines.length === 0) {
          skipped.push({ ...who, reason: 'NO_ADMISSION_FEES' });
          continue;
        }
      } else {
        charge = plan.periods.find((p) => p.periodId === r.period?.id)?.charge;
        if (!charge || charge.lines.length === 0) {
          skipped.push({ ...who, reason: 'NOTHING_TO_BILL' });
          continue;
        }
      }
      if (charge.netPaisa <= 0) {
        skipped.push({ ...who, reason: 'FULLY_DISCOUNTED' });
        continue;
      }
      candidates.push({
        enrollmentId: id,
        studentId: plan.enrollment.studentId,
        admissionNo: who.admissionNo,
        name: who.name,
        className: plan.enrollment.className,
        sectionName: plan.enrollment.sectionName,
        charge,
      });
    }
    return { candidates, skipped };
  }

  private async toPreview(
    r: Resolved,
    candidates: Candidate[],
    skipped: Skipped[],
  ): Promise<RunPreview> {
    const heads = await this.headMap();
    const sum = (pick: (c: Candidate) => number): number =>
      candidates.reduce((n, c) => n + pick(c), 0);
    const perHead = new Map<
      string,
      { code: string; name: string; netPaisa: number }
    >();
    for (const c of candidates) {
      for (const l of c.charge.lines) {
        const current = perHead.get(l.feeHeadId) ?? {
          code: l.code,
          name: heads.get(l.feeHeadId)?.name ?? l.code,
          netPaisa: 0,
        };
        current.netPaisa += l.netPaisa;
        perHead.set(l.feeHeadId, current);
      }
    }
    return {
      kind: r.kind,
      academicYearId: r.academicYearId,
      period: r.period ? { id: r.period.id, name: r.period.name } : null,
      issuedOn: r.issuedOn,
      dueDate: r.dueDate,
      fiscalYear: r.fiscalYear,
      willCreate: candidates.length,
      gross: fromPaisa(sum((c) => c.charge.grossPaisa)),
      discount: fromPaisa(
        sum((c) => c.charge.lineDiscountsPaisa + c.charge.invoiceDiscountPaisa),
      ),
      net: fromPaisa(sum((c) => c.charge.netPaisa)),
      byHead: [...perHead.values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((h) => ({
          code: h.code,
          name: h.name,
          net: fromPaisa(h.netPaisa),
        })),
      students: candidates.slice(0, PREVIEW_LIST_LIMIT).map((c) => ({
        enrollmentId: c.enrollmentId,
        admissionNo: c.admissionNo,
        name: c.name,
        className: c.className,
        sectionName: c.sectionName,
        gross: fromPaisa(c.charge.grossPaisa),
        discount: fromPaisa(
          c.charge.lineDiscountsPaisa + c.charge.invoiceDiscountPaisa,
        ),
        net: fromPaisa(c.charge.netPaisa),
        lines: c.charge.lines.map((l) => ({
          code: l.code,
          net: fromPaisa(l.netPaisa),
        })),
      })),
      skipped: skipped.slice(0, PREVIEW_LIST_LIMIT),
      skippedSummary: this.summarise(skipped),
      truncated:
        candidates.length > PREVIEW_LIST_LIMIT ||
        skipped.length > PREVIEW_LIST_LIMIT,
    };
  }

  private summarise(skipped: Skipped[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of skipped) out[s.reason] = (out[s.reason] ?? 0) + 1;
    return out;
  }

  private async headMap(): Promise<
    Map<string, { code: string; name: string; nameNp: string | null }>
  > {
    const heads = await this.prisma.feeHead.findMany({
      select: { id: true, code: true, name: true, nameNp: true },
    });
    return new Map(
      heads.map(
        (h) =>
          [h.id, { code: h.code, name: h.name, nameNp: h.nameNp }] as const,
      ),
    );
  }

  /** Invoices are always issued today, in the fiscal year that covers today. */
  private async currentFiscalYear(
    today: string,
  ): Promise<{ id: string; label: string }> {
    const fiscalYear = await this.prisma.fiscalYear.findFirst({
      where: {
        startDate: { lte: isoToDate(today) },
        endDate: { gte: isoToDate(today) },
      },
      select: { id: true, label: true, status: true },
    });
    if (!fiscalYear)
      throw new ConflictException(
        'No fiscal year covers today. Create the fiscal year before billing.',
      );
    if (fiscalYear.status !== 'OPEN')
      throw new ConflictException(`Fiscal year ${fiscalYear.label} is closed`);
    return { id: fiscalYear.id, label: fiscalYear.label };
  }

  /** A shared lock, so closing a fiscal year waits for invoices being written and vice versa. */
  private async lockFiscalYear(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { status: string }[]
    >`SELECT status::text AS status FROM fiscal_years WHERE id = ${id}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Fiscal year not found');
    if (row.status !== 'OPEN')
      throw new ConflictException('This fiscal year is closed');
  }
}
