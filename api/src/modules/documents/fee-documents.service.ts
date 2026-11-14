import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  adToBsString,
  dateParts,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { chunked } from '../../common/utils/chunked.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AGEING_BUCKETS, ageingKey, type AgeingKey } from '../fees/ageing.js';
import { CreditService } from '../fees/credit.service.js';
import { DuesReportService } from '../fees/dues-report.service.js';
import {
  InvoiceBalanceService,
  invoiceStatus,
  type Balance,
} from '../fees/invoice-balance.service.js';
import { ReceiptsService } from '../fees/receipts.service.js';
import { StatementsService } from '../fees/statements.service.js';
import type { PrintBatch, PrintEnvelope } from './document-contract.js';
import type {
  PrintFeeVouchersDto,
  PrintInvoicesDto,
  PrintReceiptsDto,
  PrintStatementsDto,
} from './dto/print-fee-documents.dto.js';
import { PrintAssemblyService } from './print-assembly.service.js';

const TX = { maxWait: 15_000, timeout: 30_000 } as const;
const MAX_VOUCHERS = 200;
const IN_LIMIT = 1000;

type ReceiptDocument = Awaited<ReturnType<ReceiptsService['print']>>;
type StatementDocument = Awaited<ReturnType<StatementsService['forStudent']>>;

const INVOICE_SELECT = {
  id: true,
  number: true,
  kind: true,
  revision: true,
  description: true,
  issuedOn: true,
  dueDate: true,
  grossAmount: true,
  discountAmount: true,
  netAmount: true,
  fiscalYear: { select: { label: true } },
  period: { select: { name: true, nameNp: true } },
  replacesInvoice: { select: { number: true } },
  student: {
    select: {
      admissionNo: true,
      firstName: true,
      middleName: true,
      lastName: true,
      fullNameNp: true,
    },
  },
  enrollment: {
    select: {
      rollNo: true,
      section: {
        select: { name: true, schoolClass: { select: { name: true } } },
      },
    },
  },
  lines: {
    orderBy: { id: 'asc' as const },
    select: {
      descriptionEn: true,
      descriptionNp: true,
      grossAmount: true,
      lineDiscount: true,
      invoiceDiscountShare: true,
      netAmount: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

export interface InvoiceDocument {
  id: string;
  number: string;
  kind: 'PERIODIC' | 'ADMISSION' | 'AD_HOC';
  revision: number;
  fiscalYear: string;
  status: string;
  overdue: boolean;
  issuedOn: { ad: string; bs: string | null };
  dueDate: { ad: string; bs: string | null };
  period: { name: string; nameNp: string | null } | null;
  description: string | null;
  student: { admissionNo: string; name: string; nameNp: string | null };
  className: string;
  sectionName: string;
  rollNo: number | null;
  lines: {
    descriptionEn: string;
    descriptionNp: string | null;
    gross: number;
    discount: number;
    net: number;
  }[];
  gross: number;
  discount: number;
  net: number;
  /** As of the day it is printed. The invoice itself never changes. */
  balance: {
    asOf: string;
    asOfBs: string | null;
    paid: number;
    adjusted: number;
    outstanding: number;
  };
  replaces: string | null;
  copy: { kind: 'ORIGINAL' | 'DUPLICATE'; number: number };
}

@Injectable()
export class FeeDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assembly: PrintAssemblyService,
    private readonly receiptsService: ReceiptsService,
    private readonly statementsService: StatementsService,
    private readonly dues: DuesReportService,
    private readonly balances: InvoiceBalanceService,
    private readonly credit: CreditService,
  ) {}

  // ---------------------------------------------------------------- receipts

  /** Each receipt is recorded as printed: the first is the original, later ones are marked duplicate. */
  async receipts(
    dto: PrintReceiptsDto,
    actor: AuthUser,
  ): Promise<PrintBatch<'RECEIPT', ReceiptDocument>> {
    const rows = await this.prisma.payment.findMany({
      where: { id: { in: dto.paymentIds } },
      select: { paidOn: true },
    });
    if (rows.length !== dto.paymentIds.length)
      throw new NotFoundException('One or more receipts do not exist');
    const issuedOn = rows
      .map((r) => toIsoDate(r.paidOn))
      .sort()
      .at(-1) as string;
    // The header can fail (no fiscal setup, storage down): build it before any print is recorded.
    const envelope = await this.envelope(actor, issuedOn, dto);
    const documents: ReceiptDocument[] = [];
    for (const id of dto.paymentIds)
      documents.push(await this.receiptsService.print(id, actor));
    return { kind: 'RECEIPT', ...envelope, documents, skipped: [] };
  }

  // ---------------------------------------------------------------- invoices

  async invoices(
    dto: PrintInvoicesDto,
    actor: AuthUser,
  ): Promise<PrintBatch<'INVOICE', InvoiceDocument>> {
    const rows = await this.prisma.invoice.findMany({
      where: { id: { in: dto.invoiceIds } },
      select: INVOICE_SELECT,
    });
    if (rows.length !== dto.invoiceIds.length)
      throw new NotFoundException('One or more invoices do not exist');
    const issuedOn = rows
      .map((r) => toIsoDate(r.issuedOn))
      .sort()
      .at(-1) as string;
    const envelope = await this.envelope(actor, issuedOn, dto);

    const balances = await this.balances.load(dto.invoiceIds);
    const today = todayIso();
    const rowBy = new Map(rows.map((r) => [r.id, r] as const));
    const documents: InvoiceDocument[] = [];
    for (const id of dto.invoiceIds) {
      const r = rowBy.get(id) as (typeof rows)[number];
      const b = balances.get(id) as Balance;
      const issued = dateParts(r.issuedOn);
      const due = dateParts(r.dueDate);
      const { status, overdue } = invoiceStatus(b, due.ad, today);
      documents.push({
        id: r.id,
        number: r.number,
        kind: r.kind,
        revision: r.revision,
        fiscalYear: r.fiscalYear.label,
        status,
        overdue,
        issuedOn: { ad: issued.ad, bs: issued.bs },
        dueDate: { ad: due.ad, bs: due.bs },
        period: r.period
          ? { name: r.period.name, nameNp: r.period.nameNp }
          : null,
        description: r.description,
        student: {
          admissionNo: r.student.admissionNo,
          name: displayName(r.student),
          nameNp: r.student.fullNameNp,
        },
        className: r.enrollment.section.schoolClass.name,
        sectionName: r.enrollment.section.name,
        rollNo: r.enrollment.rollNo,
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
        balance: {
          asOf: today,
          asOfBs: adToBsString(today),
          paid: fromPaisa(b.paidPaisa),
          adjusted: fromPaisa(b.adjustedPaisa),
          outstanding: fromPaisa(b.outstandingPaisa),
        },
        replaces: r.replacesInvoice?.number ?? null,
        copy: await this.nextCopy('invoice.printed', 'invoice', id, actor),
      });
    }
    return { kind: 'INVOICE', ...envelope, documents, skipped: [] };
  }

  // ---------------------------------------------------------------- statements

  async statements(
    dto: PrintStatementsDto,
    actor: AuthUser,
  ): Promise<PrintBatch<'STATEMENT', StatementDocument>> {
    const envelope = await this.envelope(actor, todayIso(), dto);
    const documents: StatementDocument[] = [];
    for (const studentId of dto.studentIds) {
      documents.push(
        await this.statementsService.forStudent(studentId, {
          from: dto.from,
          to: dto.to,
          academicYearId: dto.academicYearId,
        }),
      );
    }
    await this.audit.record({
      actor,
      action: 'fees.documents_printed',
      entityType: 'print_batch',
      entityId: randomUUID(),
      details: { kind: 'STATEMENT', count: documents.length },
    });
    return { kind: 'STATEMENT', ...envelope, documents, skipped: [] };
  }

  // ---------------------------------------------------------------- fee vouchers (dues notices)

  async feeVouchers(dto: PrintFeeVouchersDto, actor: AuthUser) {
    const selectors = [
      dto.classId,
      dto.sectionId,
      dto.studentIds && dto.studentIds.length > 0 ? 'ids' : undefined,
      dto.all === true ? 'all' : undefined,
    ].filter((v) => v !== undefined);
    if (selectors.length !== 1)
      throw new BadRequestException(
        'Choose exactly one of classId, sectionId, studentIds or all: true',
      );
    const today = todayIso();
    const envelope = await this.envelope(actor, today, dto);

    let studentIds: string[] | undefined;
    if (dto.studentIds && dto.studentIds.length > 0) {
      studentIds = dto.studentIds;
    } else if (dto.classId || dto.sectionId) {
      if (
        dto.classId &&
        !(await this.prisma.schoolClass.findUnique({
          where: { id: dto.classId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Class not found');
      if (
        dto.sectionId &&
        !(await this.prisma.section.findUnique({
          where: { id: dto.sectionId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Section not found');
      const yearId =
        dto.academicYearId ??
        (
          await this.prisma.academicYear.findFirst({
            where: { status: 'ACTIVE' },
            select: { id: true },
          })
        )?.id;
      if (!yearId)
        throw new ConflictException(
          'There is no active academic year. Choose one (academicYearId).',
        );
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          academicYearId: yearId,
          status: 'ENROLLED',
          ...(dto.sectionId ? { sectionId: dto.sectionId } : {}),
          ...(dto.classId ? { classId: dto.classId } : {}),
        },
        select: { studentId: true },
      });
      studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    }

    // The invoices still owing money, for each of these students, from any year.
    let open = await this.dues.openInvoices(
      studentIds ? { studentIds } : {},
      this.prisma,
      today,
    );
    if (dto.onlyOverdue) open = open.filter((i) => i.daysOverdue > 0);
    const byStudent = new Map<string, typeof open>();
    for (const inv of open)
      byStudent.set(inv.studentId, [
        ...(byStudent.get(inv.studentId) ?? []),
        inv,
      ]);

    const minPaisa =
      dto.minOutstanding === undefined
        ? 1
        : Math.max(1, toPaisa(dto.minOutstanding));
    const selected = [...byStudent].filter(
      ([, invs]) =>
        invs.reduce((n, i) => n + i.outstandingPaisa, 0) >= minPaisa,
    );
    if (selected.length > MAX_VOUCHERS)
      throw new BadRequestException(
        `That is ${selected.length} vouchers. A batch holds at most ${MAX_VOUCHERS}: print by class or section.`,
      );

    const infos = new Map<
      string,
      Awaited<ReturnType<FeeDocumentsService['studentInfos']>> extends Map<
        string,
        infer V
      >
        ? V
        : never
    >();
    for (const [id, info] of await this.studentInfos(
      selected.map(([id]) => id),
    ))
      infos.set(id, info);
    const periodIds = [
      ...new Set(
        selected.flatMap(([, invs]) =>
          invs.flatMap((i) => (i.periodId ? [i.periodId] : [])),
        ),
      ),
    ];
    const periods =
      periodIds.length === 0
        ? []
        : await this.prisma.billingPeriod.findMany({
            where: { id: { in: periodIds } },
            select: { id: true, name: true },
          });
    const periodName = new Map(periods.map((p) => [p.id, p.name] as const));
    const held = await this.credit.held(selected.map(([id]) => id));

    const documents = selected.map(([studentId, invs]) => {
      const info = infos.get(studentId);
      const ordered = [...invs].sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) ||
          a.number.localeCompare(b.number),
      );
      const buckets = Object.fromEntries(
        AGEING_BUCKETS.map((b) => [b.key, 0]),
      ) as Record<AgeingKey, number>;
      for (const i of ordered)
        buckets[ageingKey(i.daysOverdue)] += i.outstandingPaisa;
      const outstanding = ordered.reduce((n, i) => n + i.outstandingPaisa, 0);
      const overdue = ordered
        .filter((i) => i.daysOverdue > 0)
        .reduce((n, i) => n + i.outstandingPaisa, 0);
      return {
        sortKey: {
          order: info?.classOrder ?? 0,
          section: info?.sectionName ?? '',
          roll: info?.rollNo ?? Number.MAX_SAFE_INTEGER,
          name: info?.name ?? '',
          outstanding,
        },
        document: {
          asOf: today,
          asOfBs: adToBsString(today),
          student: {
            id: studentId,
            admissionNo: info?.admissionNo ?? '',
            name: info?.name ?? '',
            nameNp: info?.nameNp ?? null,
          },
          className: info?.className ?? null,
          sectionName: info?.sectionName ?? null,
          rollNo: info?.rollNo ?? null,
          guardianName: info?.guardianName ?? null,
          invoices: ordered.map((i) => ({
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
          totals: {
            outstanding: fromPaisa(outstanding),
            overdue: fromPaisa(overdue),
            notYetDue: fromPaisa(outstanding - overdue),
          },
          buckets: Object.fromEntries(
            AGEING_BUCKETS.map((b) => [b.key, fromPaisa(buckets[b.key])]),
          ) as Record<AgeingKey, number>,
          credit: fromPaisa(held.get(studentId)?.totalPaisa ?? 0),
        },
      };
    });
    documents.sort((a, b) =>
      dto.order === 'AMOUNT'
        ? b.sortKey.outstanding - a.sortKey.outstanding ||
          a.sortKey.name.localeCompare(b.sortKey.name)
        : a.sortKey.order - b.sortKey.order ||
          a.sortKey.section.localeCompare(b.sortKey.section) ||
          a.sortKey.roll - b.sortKey.roll ||
          a.sortKey.name.localeCompare(b.sortKey.name),
    );

    const warnings = [...envelope.warnings];
    const considered = studentIds?.length;
    if (considered !== undefined && considered > documents.length)
      warnings.push(
        `${considered - documents.length} student(s) owe nothing (or less than the minimum) and were left out.`,
      );
    await this.audit.record({
      actor,
      action: 'fees.documents_printed',
      entityType: 'print_batch',
      entityId: randomUUID(),
      details: {
        kind: 'FEE_VOUCHER',
        count: documents.length,
        scope: dto.classId
          ? 'CLASS'
          : dto.sectionId
            ? 'SECTION'
            : dto.all
              ? 'ALL'
              : 'STUDENTS',
      },
    });
    return {
      kind: 'FEE_VOUCHER' as const,
      ...envelope,
      warnings,
      documents: documents.map((d) => d.document),
      skipped: [],
    };
  }

  // ---------------------------------------------------------------- internals

  /** Signature images are a forgery risk, so only people with fees:print-signed receive them. */
  private async envelope(
    actor: AuthUser,
    issuedOn: string,
    opts: { signatures?: 'auto' | 'line'; slots?: string[] },
  ): Promise<PrintEnvelope> {
    const canSign = actor.permissions.includes('fees:print-signed');
    const forceLine = opts.signatures === 'line' || !canSign;
    const envelope = await this.assembly.envelope({
      issuedOn,
      forceLine,
      slots: opts.slots ?? ['ACCOUNTANT'],
    });
    if (!canSign && opts.signatures !== 'line')
      envelope.warnings.push(
        'Digital signatures are only included for people allowed to print signed documents; blank signature lines are used.',
      );
    return envelope;
  }

  /** First print of a controlled document is the original; every later one is a duplicate. Serialised, so two clicks give one original. */
  private async nextCopy(
    action: 'invoice.printed',
    entityType: string,
    entityId: string,
    actor: AuthUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`print:${action}:${entityId}`}))`;
      const before = await tx.auditLog.count({ where: { action, entityId } });
      await this.audit.recordIn(tx, {
        actor,
        action,
        entityType,
        entityId,
        details: { copy: before + 1 },
      });
      return {
        kind: before === 0 ? ('ORIGINAL' as const) : ('DUPLICATE' as const),
        number: before + 1,
      };
    }, TX);
  }

  private async studentInfos(ids: string[]) {
    const out = new Map<
      string,
      {
        admissionNo: string;
        name: string;
        nameNp: string | null;
        className: string | null;
        classOrder: number;
        sectionName: string | null;
        rollNo: number | null;
        guardianName: string | null;
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
          fullNameNp: true,
          enrollments: {
            orderBy: { academicYear: { startDate: 'desc' } },
            take: 1,
            select: {
              rollNo: true,
              section: {
                select: {
                  name: true,
                  schoolClass: { select: { name: true, sortOrder: true } },
                },
              },
            },
          },
          guardians: {
            orderBy: { isPrimary: 'desc' },
            take: 1,
            select: {
              guardian: {
                select: { firstName: true, middleName: true, lastName: true },
              },
            },
          },
        },
      });
      for (const r of rows) {
        const e = r.enrollments[0];
        const g = r.guardians[0]?.guardian;
        out.set(r.id, {
          admissionNo: r.admissionNo,
          name: displayName(r),
          nameNp: r.fullNameNp,
          className: e?.section.schoolClass.name ?? null,
          classOrder: e?.section.schoolClass.sortOrder ?? 0,
          sectionName: e?.section.name ?? null,
          rollNo: e?.rollNo ?? null,
          guardianName: g ? displayName(g) : null,
        });
      }
    }
    return out;
  }
}
