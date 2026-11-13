import { Injectable } from '@nestjs/common';
import { chunked } from '../../common/utils/chunked.js';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  adToBsString,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { displayName } from '../../common/utils/person.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AGEING_BUCKETS,
  ageingKey,
  daysPast,
  type AgeingKey,
} from './ageing.js';
import { distribute } from './charge-calculator.js';
import { CreditService } from './credit.service.js';
import type {
  DuesStudentsQueryDto,
  DuesSummaryQueryDto,
} from './dto/dues-report.dto.js';
import { InvoiceBalanceService } from './invoice-balance.service.js';

type Db = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'invoice' | 'invoiceAdjustment' | 'paymentAllocation'
>;
const CHUNK = 5000;

export interface OpenInvoice {
  id: string;
  number: string;
  kind: 'PERIODIC' | 'ADMISSION' | 'AD_HOC';
  studentId: string;
  enrollmentId: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  periodId: string | null;
  dueDate: string;
  netPaisa: number;
  adjustedPaisa: number;
  paidPaisa: number;
  outstandingPaisa: number;
  /** Days past the due date. Zero or negative: not yet overdue. */
  daysOverdue: number;
}

export interface OpenFilter {
  classId?: string;
  sectionId?: string;
  academicYearId?: string;
  studentIds?: string[];
  invoiceIds?: string[];
}

type Buckets = Record<AgeingKey, { paisa: number; invoices: number }>;
const emptyBuckets = (): Buckets => ({
  CURRENT: { paisa: 0, invoices: 0 },
  D1_30: { paisa: 0, invoices: 0 },
  D31_60: { paisa: 0, invoices: 0 },
  D61_90: { paisa: 0, invoices: 0 },
  D90_PLUS: { paisa: 0, invoices: 0 },
});
const bucketsOut = (b: Buckets) =>
  AGEING_BUCKETS.map((x) => ({
    key: x.key,
    label: x.label,
    amount: fromPaisa(b[x.key].paisa),
    invoices: b[x.key].invoices,
  }));

interface Agg {
  outstanding: number;
  overdue: number;
  invoices: number;
  students: Set<string>;
  buckets: Buckets;
}
const newAgg = (): Agg => ({
  outstanding: 0,
  overdue: 0,
  invoices: 0,
  students: new Set(),
  buckets: emptyBuckets(),
});
function addTo(agg: Agg, inv: OpenInvoice): void {
  const key = ageingKey(inv.daysOverdue);
  agg.outstanding += inv.outstandingPaisa;
  if (inv.daysOverdue > 0) agg.overdue += inv.outstandingPaisa;
  agg.invoices += 1;
  agg.students.add(inv.studentId);
  agg.buckets[key].paisa += inv.outstandingPaisa;
  agg.buckets[key].invoices += 1;
}
const byKey = (
  rows: OpenInvoice[],
  key: (i: OpenInvoice) => string,
): Map<string, Agg> => {
  const out = new Map<string, Agg>();
  for (const r of rows) {
    const a = out.get(key(r)) ?? newAgg();
    addTo(a, r);
    out.set(key(r), a);
  }
  return out;
};

@Injectable()
export class DuesReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: InvoiceBalanceService,
    private readonly credit: CreditService,
  ) {}

  /**
   * Invoices that still owe money. A SQL pre-filter narrows the field; the amounts always come from InvoiceBalanceService,
   * so they can never disagree with what the invoice itself shows.
   */
  async openInvoices(
    filter: OpenFilter,
    db: Db = this.prisma,
    today = todayIso(),
  ): Promise<OpenInvoice[]> {
    const ids = filter.invoiceIds ?? (await this.candidateIds(filter, db));
    const out: OpenInvoice[] = [];
    for (const part of chunked(ids, CHUNK)) {
      const [rows, balances] = await Promise.all([
        db.invoice.findMany({
          where: { id: { in: part } },
          select: {
            id: true,
            number: true,
            kind: true,
            studentId: true,
            enrollmentId: true,
            academicYearId: true,
            periodId: true,
            dueDate: true,
            enrollment: { select: { classId: true, sectionId: true } },
          },
        }),
        this.balances.load(part, db),
      ]);
      for (const r of rows) {
        const b = balances.get(r.id);
        if (!b || b.voided || b.outstandingPaisa <= 0) continue;
        const due = toIsoDate(r.dueDate);
        out.push({
          id: r.id,
          number: r.number,
          kind: r.kind,
          studentId: r.studentId,
          enrollmentId: r.enrollmentId,
          academicYearId: r.academicYearId,
          classId: r.enrollment.classId,
          sectionId: r.enrollment.sectionId,
          periodId: r.periodId,
          dueDate: due,
          netPaisa: b.netPaisa,
          adjustedPaisa: b.adjustedPaisa,
          paidPaisa: b.paidPaisa,
          outstandingPaisa: b.outstandingPaisa,
          daysOverdue: daysPast(due, today),
        });
      }
    }
    return out;
  }

  async summary(q: DuesSummaryQueryDto) {
    const today = todayIso();
    const open = await this.openInvoices(q, this.prisma, today);
    const total = newAgg();
    for (const inv of open) addTo(total, inv);

    const [classes, sections] = await Promise.all([
      this.prisma.schoolClass.findMany({
        where: { id: { in: [...new Set(open.map((o) => o.classId))] } },
        select: { id: true, name: true, sortOrder: true },
      }),
      this.prisma.section.findMany({
        where: { id: { in: [...new Set(open.map((o) => o.sectionId))] } },
        select: { id: true, name: true, classId: true },
      }),
    ]);
    const classBy = new Map(classes.map((c) => [c.id, c] as const));
    const sectionBy = new Map(sections.map((s) => [s.id, s] as const));
    const summarise = (a: Agg) => ({
      outstanding: fromPaisa(a.outstanding),
      overdue: fromPaisa(a.overdue),
      invoices: a.invoices,
      students: a.students.size,
    });

    const heads = await this.splitByHead(open);
    const headRows = await this.prisma.feeHead.findMany({
      where: { id: { in: [...heads.keys()] } },
      select: { id: true, code: true, name: true, sortOrder: true },
    });

    return {
      asOf: today,
      asOfBs: adToBsString(today),
      totals: {
        ...summarise(total),
        notYetDue: fromPaisa(total.outstanding - total.overdue),
        buckets: bucketsOut(total.buckets),
      },
      byClass: [...byKey(open, (i) => i.classId)]
        .map(([id, a]) => ({
          classId: id,
          name: classBy.get(id)?.name ?? id,
          order: classBy.get(id)?.sortOrder ?? 0,
          ...summarise(a),
          buckets: bucketsOut(a.buckets),
        }))
        .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name))
        .map(({ order: _o, ...rest }) => rest),
      bySection: [...byKey(open, (i) => i.sectionId)]
        .map(([id, a]) => {
          const s = sectionBy.get(id);
          const c = s ? classBy.get(s.classId) : undefined;
          return {
            sectionId: id,
            classId: s?.classId ?? null,
            className: c?.name ?? null,
            name: s?.name ?? id,
            order: c?.sortOrder ?? 0,
            ...summarise(a),
          };
        })
        .sort(
          (x, y) =>
            x.order - y.order ||
            (x.className ?? '').localeCompare(y.className ?? '') ||
            x.name.localeCompare(y.name),
        )
        .map(({ order: _o, ...rest }) => rest),
      byFeeHead: headRows
        .map((h) => ({
          feeHeadId: h.id,
          code: h.code,
          name: h.name,
          order: h.sortOrder,
          outstanding: fromPaisa(heads.get(h.id)?.outstanding ?? 0),
          overdue: fromPaisa(heads.get(h.id)?.overdue ?? 0),
        }))
        .sort((x, y) => x.order - y.order || x.code.localeCompare(y.code))
        .map(({ order: _o, ...rest }) => rest),
    };
  }

  /** One row per student who owes money: the list to work through when following up. */
  async students(
    q: DuesStudentsQueryDto,
  ): Promise<Paginated<ReturnType<typeof present>>> {
    const today = todayIso();
    const open = await this.openInvoices(q, this.prisma, today);
    const perStudent = byKey(open, (i) => i.studentId);
    const oldest = new Map<string, string>();
    for (const inv of open)
      if (
        !oldest.has(inv.studentId) ||
        inv.dueDate < (oldest.get(inv.studentId) as string)
      )
        oldest.set(inv.studentId, inv.dueDate);

    const info = new Map<string, StudentInfo>();
    for (const part of chunked([...perStudent.keys()], CHUNK)) {
      const rows = await this.prisma.student.findMany({
        where: { id: { in: part } },
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          middleName: true,
          lastName: true,
          status: true,
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
      for (const r of rows) info.set(r.id, r);
    }

    const search = q.search?.trim().toLowerCase();
    const minOutstanding =
      q.minOutstanding === undefined ? 0 : toPaisa(q.minOutstanding);
    let rows = [...perStudent].map(([id, a]) => {
      const due = oldest.get(id) as string;
      return {
        id,
        agg: a,
        oldestDue: due,
        daysOverdue: Math.max(0, daysPast(due, today)),
        info: info.get(id),
      };
    });
    rows = rows.filter((r) => {
      if (r.agg.outstanding < minOutstanding) return false;
      if (q.minDaysOverdue !== undefined && r.daysOverdue < q.minDaysOverdue)
        return false;
      if (
        search &&
        !`${r.info ? displayName(r.info) : ''} ${r.info?.admissionNo ?? ''}`
          .toLowerCase()
          .includes(search)
      )
        return false;
      return true;
    });
    const sort = q.sort ?? 'OUTSTANDING';
    rows.sort((a, b) =>
      sort === 'NAME'
        ? (a.info ? displayName(a.info) : '').localeCompare(
            b.info ? displayName(b.info) : '',
          )
        : sort === 'OLDEST'
          ? b.daysOverdue - a.daysOverdue ||
            b.agg.outstanding - a.agg.outstanding ||
            a.id.localeCompare(b.id)
          : b.agg.outstanding - a.agg.outstanding ||
            b.daysOverdue - a.daysOverdue ||
            a.id.localeCompare(b.id),
    );

    const page = rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const held = await this.credit.held(page.map((r) => r.id));
    return toPaginated(
      page.map((r) => present(r, held.get(r.id)?.totalPaisa ?? 0)),
      rows.length,
      q,
    );
  }

  // ---------------------------------------------------------------- internals

  /** The fee-head split of what is owed: each invoice's balance is spread over its lines in proportion to their amounts. */
  async splitByHead(
    open: OpenInvoice[],
  ): Promise<Map<string, { outstanding: number; overdue: number }>> {
    const out = new Map<string, { outstanding: number; overdue: number }>();
    const invoiceBy = new Map(open.map((o) => [o.id, o] as const));
    for (const part of chunked([...invoiceBy.keys()], CHUNK)) {
      const lines = await this.prisma.invoiceLine.findMany({
        where: { invoiceId: { in: part } },
        orderBy: { id: 'asc' },
        select: { invoiceId: true, feeHeadId: true, netAmount: true },
      });
      const grouped = new Map<string, typeof lines>();
      for (const l of lines)
        grouped.set(l.invoiceId, [...(grouped.get(l.invoiceId) ?? []), l]);
      for (const [invoiceId, ls] of grouped) {
        const inv = invoiceBy.get(invoiceId) as OpenInvoice;
        const shares = distribute(
          inv.outstandingPaisa,
          ls.map((l) => toPaisa(l.netAmount.toNumber())),
        );
        ls.forEach((l, i) => {
          const entry = out.get(l.feeHeadId) ?? { outstanding: 0, overdue: 0 };
          entry.outstanding += shares[i] as number;
          if (inv.daysOverdue > 0) entry.overdue += shares[i] as number;
          out.set(l.feeHeadId, entry);
        });
      }
    }
    return out;
  }

  private async candidateIds(f: OpenFilter, db: Db): Promise<string[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`NOT EXISTS (SELECT 1 FROM invoice_voids v WHERE v.invoice_id = i.id)`,
      Prisma.sql`i.net_amount >
        COALESCE((SELECT SUM(a.amount) FROM invoice_adjustments a JOIN invoice_adjustment_decisions d ON d.adjustment_id = a.id AND d.approved WHERE a.invoice_id = i.id), 0)
        + COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id = i.id AND NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = pa.payment_id)), 0)`,
    ];
    if (f.academicYearId)
      conditions.push(
        Prisma.sql`i.academic_year_id = ${f.academicYearId}::uuid`,
      );
    if (f.classId) conditions.push(Prisma.sql`e.class_id = ${f.classId}::uuid`);
    if (f.sectionId)
      conditions.push(Prisma.sql`e.section_id = ${f.sectionId}::uuid`);
    if (f.studentIds && f.studentIds.length > 0) {
      conditions.push(
        Prisma.sql`i.student_id IN (${Prisma.join(f.studentIds.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT i.id FROM invoices i JOIN enrollments e ON e.id = i.enrollment_id WHERE ${Prisma.join(conditions, ' AND ')}`,
    );
    return rows.map((r) => r.id);
  }
}

interface StudentInfo {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  status: string;
  enrollments: { section: { name: string; schoolClass: { name: string } } }[];
}

function present(
  r: {
    id: string;
    agg: Agg;
    oldestDue: string;
    daysOverdue: number;
    info: StudentInfo | undefined;
  },
  creditPaisa: number,
) {
  const enrollment = r.info?.enrollments[0];
  return {
    student: {
      id: r.id,
      admissionNo: r.info?.admissionNo ?? '',
      name: r.info ? displayName(r.info) : '',
      status: r.info?.status ?? '',
    },
    className: enrollment?.section.schoolClass.name ?? null,
    sectionName: enrollment?.section.name ?? null,
    outstanding: fromPaisa(r.agg.outstanding),
    overdue: fromPaisa(r.agg.overdue),
    notYetDue: fromPaisa(r.agg.outstanding - r.agg.overdue),
    invoices: r.agg.invoices,
    oldestDueDate: r.oldestDue,
    oldestDueDateBs: adToBsString(r.oldestDue),
    daysOverdue: r.daysOverdue,
    buckets: Object.fromEntries(
      AGEING_BUCKETS.map((b) => [b.key, fromPaisa(r.agg.buckets[b.key].paisa)]),
    ) as Record<AgeingKey, number>,
    credit: fromPaisa(creditPaisa),
  };
}
