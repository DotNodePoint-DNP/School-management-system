import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PFX = 'E2E-PFE';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-pfe-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const SECRET_REASON = 'Need based: father lost his job this year';
const INTERNAL_NOTE = 'Internal: cheque cleared with Hari at the bank';
const CN_REASON = 'Hardship waiver approved by the committee';
const REVERSAL_REASON = 'Recorded against the wrong student by mistake';

type Who =
  | 'setup'
  | 'cashier'
  | 'principal'
  | 'staff'
  | 'parent1'
  | 'parent2'
  | 'unlinked';
type C = 'c1' | 'c2' | 'c3';
const KIDS: C[] = ['c1', 'c2', 'c3'];

describe('Parent portal: fees, receipts and printing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let yearA = '';
  let classId = '';
  const stu = {} as Record<C, string>;
  const inv = {} as Record<C, string[]>;
  const guardian = { g1: '', g2: '' };
  const pay = { A: '', B: '', C: '', D: '' };
  const receipt = { A: '', B: '', C: '', D: '' };

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t: string) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const portal = async (url: string, t = token.parent1) =>
    (await get(`/portal${url}`, t).expect(200)).body.data;
  const printBody = async (kind: string, body: object, t = token.parent1) =>
    (await post(`/portal/print/${kind}`, body, t).expect(200)).body.data;
  const record = (body: object) =>
    post(
      '/payments',
      { idempotencyKey: randomUUID(), method: 'CASH', ...body },
      token.cashier,
    );

  async function purge(): Promise<void> {
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    const students = await prisma.student.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);
    const users = (
      await prisma.user.findMany({
        where: { email: { startsWith: 'e2e-pfe-' } },
        select: { id: true },
      })
    ).map((u) => u.id);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
        const payments = (
          await tx.payment.findMany({
            where: { receivedById: { in: users } },
            select: { id: true },
          })
        ).map((p) => p.id);
        await tx.paymentReversal.deleteMany({
          where: { paymentId: { in: payments } },
        });
        await tx.paymentAllocation.deleteMany({
          where: { paymentId: { in: payments } },
        });
        await tx.payment.deleteMany({ where: { id: { in: payments } } });
        const ids = (
          await tx.invoice.findMany({
            where: { studentId: { in: studentIds } },
            select: { id: true },
          })
        ).map((i) => i.id);
        await tx.invoiceAdjustmentDecision.deleteMany({
          where: { adjustment: { invoiceId: { in: ids } } },
        });
        await tx.invoiceAdjustment.deleteMany({
          where: { invoiceId: { in: ids } },
        });
        await tx.invoiceVoid.deleteMany({ where: { invoiceId: { in: ids } } });
        await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
        await tx.invoice.deleteMany({ where: { id: { in: ids } } });
      },
      { timeout: 60_000 },
    );
    await prisma.auditLog
      .deleteMany({
        where: {
          action: 'payment.receipt_printed',
          actorName: { startsWith: 'E2E ' },
        },
      })
      .catch(() => undefined);
    await prisma.studentDiscount.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.feeStructureLinePeriod.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.feeStructureLine.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.billingPeriod.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.enrollment.deleteMany({
      where: {
        OR: [
          { studentId: { in: studentIds } },
          { academicYearId: { in: yearIds } },
        ],
      },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.section.deleteMany({
      where: { schoolClass: { name: { startsWith: PFX } } },
    });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.guardian.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    await prisma.feeHead.deleteMany({
      where: { code: { startsWith: `T${TAIL}` } },
    });
    const fiscalYears = await prisma.fiscalYear.findMany({
      where: { label: { startsWith: PFX } },
      select: { id: true },
    });
    await prisma.sequence.deleteMany({
      where: {
        name: {
          in: fiscalYears.flatMap((f) => [
            `invoice:${f.id}`,
            `receipt:${f.id}`,
          ]),
        },
      },
    });
    await prisma.fiscalYear.deleteMany({
      where: { id: { in: fiscalYears.map((f) => f.id) } },
    });
  }

  async function makeUser(
    label: Who,
    permissions: [string, string][],
  ): Promise<void> {
    const rows = await prisma.permission.findMany({
      where: {
        OR: permissions.map(([module, action]) => ({ module, action })),
      },
    });
    if (rows.length !== permissions.length)
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');
    const role = await prisma.role.create({
      data: {
        name: `${PFX}-${RUN}-${label}`,
        permissions: { create: rows.map((p) => ({ permissionId: p.id })) },
      },
    });
    const user = await prisma.user.create({
      data: {
        email: email(label),
        fullName: `E2E ${label}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    userId[label] = user.id;
    const res = await http()
      .post(`${V1}/auth/login`)
      .send({ identifier: email(label), password: PASSWORD })
      .expect(200);
    token[label] = res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const flag = await prisma.$queryRaw<
      { v: string | null }[]
    >`SELECT current_setting('app.environment', true) AS v`;
    if (flag[0]?.v !== 'test') {
      blocked =
        "Skipped: this database is not flagged as a test database (see the 7B part 1 'test database needs one flag').";
      console.warn(blocked);
      return;
    }
    await purge();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-pfe-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    if (
      (await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: date('2006-04-13') },
          endDate: { gte: date('2005-04-14') },
        },
      })) !== null
    ) {
      blocked =
        'Skipped: the database already has academic years between 2005 and 2006.';
      console.warn(blocked);
      return;
    }
    if (
      (await prisma.dayClose.findFirst({
        where: { date: date(today()), reopen: { is: null } },
      })) !== null
    ) {
      blocked =
        "Skipped: today's collection is closed, so payments cannot be recorded.";
      return;
    }
    const covering = await prisma.fiscalYear.findFirst({
      where: {
        startDate: { lte: date(today()) },
        endDate: { gte: date(today()) },
      },
    });
    if (covering) {
      if (covering.status !== 'OPEN') {
        blocked = 'Skipped: the fiscal year covering today is closed.';
        return;
      }
      fiscalYearId = covering.id;
    } else {
      try {
        const start = addDays(today(), -100);
        fiscalYearId = (
          await prisma.fiscalYear.create({
            data: {
              label: `${PFX}-${RUN}-FY`,
              startDate: date(start),
              endDate: date(addDays(start, 364)),
            },
          })
        ).id;
      } catch {
        blocked =
          'Skipped: a fiscal year already overlaps the dates this test needs.';
        return;
      }
    }

    await makeUser('setup', [
      ['fees', 'read'],
      ['fees', 'structure-manage'],
    ]);
    await makeUser('cashier', [
      ['fees', 'read'],
      ['fees', 'invoice-generate'],
      ['fees', 'payment-record'],
      ['fees', 'payment-reverse'],
      ['fees', 'adjust'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'invoice-void'],
      ['fees', 'adjust-approve'],
    ]);
    await makeUser('staff', [['fees', 'read']]);
    await makeUser('parent1', [['portal', 'access']]);
    await makeUser('parent2', [['portal', 'access']]);
    await makeUser('unlinked', [['portal', 'access']]);

    yearA = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-A`,
          startDate: date('2005-04-14'),
          endDate: date('2006-04-13'),
        },
      })
    ).id;
    classId = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C`, sortOrder: 3 },
      })
    ).id;
    const section = (
      await prisma.section.create({ data: { classId, name: 'A' } })
    ).id;
    const tuition = (
      await prisma.feeHead.create({
        data: { code: `T${TAIL}TUI`, name: `${PFX} TUI`, frequency: 'MONTHLY' },
      })
    ).id;
    const periods = (
      await post(
        `/academic-years/${yearA}/billing-periods/generate`,
        { months: 12 },
        token.setup,
      ).expect(200)
    ).body.data as { id: string }[];
    await put(
      `/academic-years/${yearA}/classes/${classId}/fee-structure`,
      {
        lines: [
          {
            feeHeadId: tuition,
            amount: 5000,
            periodIds: periods.slice(0, 3).map((p) => p.id),
          },
        ],
      },
      token.setup,
    ).expect(200);

    guardian.g1 = (
      await prisma.guardian.create({
        data: {
          firstName: `${PFX}-G1`,
          lastName: 'Rai',
          phone: `+97798${TAIL}`,
          userId: userId.parent1,
        },
      })
    ).id;
    guardian.g2 = (
      await prisma.guardian.create({
        data: {
          firstName: `${PFX}-G2`,
          lastName: 'Shrestha',
          phone: `+97797${TAIL}`,
          userId: userId.parent2,
        },
      })
    ).id;
    const owner: Record<C, string> = {
      c1: guardian.g1,
      c2: guardian.g1,
      c3: guardian.g2,
    };
    const enrollment: Record<string, string> = {};
    for (const [index, key] of KIDS.entries()) {
      const student = await prisma.student.create({
        data: {
          admissionNo: `E2E-${RUN}-${key}`,
          firstName: `${PFX}-${key}`,
          lastName: key === 'c3' ? 'Shrestha' : 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
          guardians: {
            create: [
              {
                guardianId: owner[key],
                relationship: 'FATHER',
                isPrimary: true,
              },
            ],
          },
        },
      });
      stu[key] = student.id;
      enrollment[key] = (
        await prisma.enrollment.create({
          data: {
            studentId: student.id,
            academicYearId: yearA,
            classId,
            sectionId: section,
            rollNo: index + 1,
          },
        })
      ).id;
    }
    // A need-based 10% discount for c1, approved by someone other than its creator.
    await prisma.studentDiscount.create({
      data: {
        enrollmentId: enrollment.c1 as string,
        academicYearId: yearA,
        category: 'NEED_SCHOLARSHIP',
        feeHeadId: tuition,
        type: 'PERCENT',
        value: 10,
        reason: SECRET_REASON,
        status: 'APPROVED',
        createdById: userId.setup,
        lastEditedById: userId.setup,
        approvedById: userId.principal,
        approvedAt: new Date(),
      },
    });
    for (const p of periods.slice(0, 3))
      await post(
        '/invoices/generate',
        { kind: 'PERIODIC', periodId: p.id, classId },
        token.cashier,
      ).expect(200);
    for (const key of KIDS)
      inv[key] = (
        await prisma.invoice.findMany({
          where: { studentId: stu[key] },
          orderBy: { dueDate: 'asc' },
        })
      ).map((r) => r.id);

    await post(
      `/invoices/${inv.c1[2]}/void`,
      { reason: 'Issued twice by mistake, see ledger' },
      token.principal,
    ).expect(200);
    // A: one receipt covering a child of each family. B: advance credit for c1. C: a payment for c2, then reversed. D: a bank transfer for c2.
    const a = await record({
      amount: 7500,
      note: INTERNAL_NOTE,
      allocations: [
        { invoiceId: inv.c1[0], amount: 4500 },
        { invoiceId: inv.c3[0], amount: 3000 },
      ],
    }).expect(201);
    const b = await record({
      amount: 1000,
      allocations: [],
      keepExcessAsCredit: { studentId: stu.c1 },
    }).expect(201);
    const c = await record({
      amount: 2000,
      allocations: [{ invoiceId: inv.c2[0], amount: 2000 }],
    }).expect(201);
    await post(
      `/payments/${c.body.data.id}/reverse`,
      { reason: REVERSAL_REASON },
      token.cashier,
    ).expect(200);
    const d = await record({
      amount: 1000,
      method: 'BANK_TRANSFER',
      reference: `TXN-${RUN}-PE`,
      autoAllocate: { studentIds: [stu.c2] },
    }).expect(201);
    for (const [key, res] of [
      ['A', a],
      ['B', b],
      ['C', c],
      ['D', d],
    ] as const) {
      pay[key] = res.body.data.id;
      receipt[key] = res.body.data.receiptNo;
    }
    const waiver = await post(
      `/invoices/${inv.c2[1]}/adjustments`,
      { kind: 'WAIVER', amount: 500, reason: CN_REASON },
      token.cashier,
    ).expect(201);
    await post(
      `/adjustments/${waiver.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(200);
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-pfe-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('needs a login, the portal permission and a guardian record, for every fees and print endpoint', async ({
    skip,
  }) => {
    if (blocked) skip();
    const urls = [
      '/portal/fees',
      `/portal/children/${stu.c1}/fees`,
      `/portal/children/${stu.c1}/invoices`,
      `/portal/invoices/${inv.c1[0]}`,
      `/portal/children/${stu.c1}/payments`,
      `/portal/payments/${pay.A}`,
      `/portal/children/${stu.c1}/statement`,
    ];
    for (const url of urls) {
      await http().get(`${V1}${url}`).expect(401);
      await get(url, token.staff).expect(403); // a staff login is not a parent login
    }
    for (const [kind, body] of [
      ['receipt', { paymentId: pay.A }],
      ['invoice', { invoiceId: inv.c1[0] }],
      ['statement', { studentId: stu.c1 }],
      ['report-card', { studentId: stu.c1 }],
    ] as const) {
      await http().post(`${V1}/portal/print/${kind}`).send(body).expect(401);
      await post(`/portal/print/${kind}`, body, token.staff).expect(403);
    }
    await get('/portal/fees', token.unlinked).expect(403);
    await get(`/portal/invoices/${inv.c1[0]}`, token.unlinked).expect(403);
  });

  it('answers "not found" for another family\'s children, invoices and receipts, exactly as for ids that do not exist', async ({
    skip,
  }) => {
    if (blocked) skip();
    for (const id of [stu.c3, randomUUID()]) {
      for (const tail of ['/fees', '/invoices', '/payments', '/statement']) {
        const res = await get(
          `/portal/children/${id}${tail}`,
          token.parent1,
        ).expect(404);
        expect(res.body.error.message).toBe('Child not found');
      }
    }
    for (const id of [inv.c3[1], inv.c1[2], randomUUID()]) {
      // another family's invoice, a voided invoice, and one that does not exist
      const res = await get(`/portal/invoices/${id}`, token.parent1).expect(
        404,
      );
      expect(res.body.error.message).toBe('Not found');
    }
    for (const id of [pay.A, pay.B, pay.C, pay.D].map((p) => p))
      await get(`/portal/payments/${id}`, token.parent2).then((r) =>
        expect([200, 404]).toContain(r.status),
      );
    expect(
      (await get(`/portal/payments/${pay.B}`, token.parent2).expect(404)).body
        .error.message,
    ).toBe('Not found'); // credit for another family's child
    await get(`/portal/payments/${pay.C}`, token.parent2).expect(404);
    await get(`/portal/payments/${pay.D}`, token.parent2).expect(404);
    await get(`/portal/payments/${randomUUID()}`, token.parent1).expect(404);
    for (const id of [stu.c1, stu.c2])
      for (const tail of ['/fees', '/invoices', '/payments', '/statement'])
        await get(`/portal/children/${id}${tail}`, token.parent2).expect(404);
    await get(`/portal/invoices/${inv.c1[0]}`, token.parent2).expect(404);
    await get(`/portal/invoices/${inv.c2[0]}`, token.parent2).expect(404);
    await get('/portal/invoices/not-a-uuid', token.parent1).expect(400);
  });

  it('shows what the family owes, from the same figures as the office', async ({
    skip,
  }) => {
    if (blocked) skip();
    const f = await portal('/fees');
    expect(f.totals).toEqual({
      outstanding: 18_000,
      overdue: 18_000,
      notYetDue: 0,
      credit: 1000,
    });
    expect(
      f.children.map(
        (c: {
          student: { id: string };
          outstanding: number;
          credit: number;
          openInvoices: number;
        }) => [c.student.id, c.outstanding, c.credit, c.openInvoices],
      ),
    ).toEqual([
      [stu.c1, 4500, 1000, 1],
      [stu.c2, 13_500, 0, 3],
    ]);
    expect((await portal('/fees', token.parent2)).totals).toMatchObject({
      outstanding: 12_000,
      credit: 0,
    });
    const office = (
      await get(`/dues?studentIds=${stu.c1},${stu.c2}`, token.staff).expect(200)
    ).body.data;
    expect(office.totalOutstanding).toBe(f.totals.outstanding); // the portal and the cashier never disagree

    const home = await portal('/home');
    expect(home.fees).toEqual({
      outstanding: 18_000,
      overdue: 18_000,
      credit: 1000,
    });
    expect(home.children[0]).toMatchObject({
      id: stu.c1,
      fees: { outstanding: 4500, credit: 1000 },
    });
  });

  it("lists a child's open invoices with ageing, and hides voided ones", async ({
    skip,
  }) => {
    if (blocked) skip();
    const c1 = await portal(`/children/${stu.c1}/fees`);
    expect(c1).toMatchObject({
      outstanding: 4500,
      overdue: 4500,
      notYetDue: 0,
      credit: 1000,
      student: {
        admissionNo: `E2E-${RUN}-c1`,
        className: `${PFX}-${RUN}-C`,
        sectionName: 'A',
      },
    });
    expect(
      c1.invoices.map((i: { id: string; outstanding: number }) => [
        i.id,
        i.outstanding,
      ]),
    ).toEqual([[inv.c1[1], 4500]]); // the paid one and the voided one are not listed
    expect(c1.buckets).toMatchObject({ CURRENT: 0, D90_PLUS: 4500 }); // the 2005 due dates are long past
    const c2 = await portal(`/children/${stu.c2}/fees`);
    expect(
      c2.invoices.map(
        (i: { outstanding: number; paid: number; adjusted: number }) => [
          i.outstanding,
          i.paid,
          i.adjusted,
        ],
      ),
    ).toEqual([
      [4000, 1000, 0],
      [4500, 0, 500],
      [5000, 0, 0],
    ]);
    expect(c2.invoices[0].dueDateBs).toEqual(expect.any(String));
  });

  it('lists every invoice a child has had, except voided ones, with a status filter and pages', async ({
    skip,
  }) => {
    if (blocked) skip();
    const all = (
      await get(`/portal/children/${stu.c1}/invoices`, token.parent1).expect(
        200,
      )
    ).body;
    expect(all.meta).toMatchObject({ total: 2 });
    expect(all.data.map((i: { id: string }) => i.id).sort()).toEqual(
      [inv.c1[0], inv.c1[1]].sort(),
    );
    expect(all.data.every((i: { id: string }) => i.id !== inv.c1[2])).toBe(
      true,
    );
    const open = (
      await get(
        `/portal/children/${stu.c1}/invoices?status=OPEN`,
        token.parent1,
      ).expect(200)
    ).body.data;
    expect(
      open.map((i: { id: string; status: string }) => [i.id, i.status]),
    ).toEqual([[inv.c1[1], 'OPEN']]);
    const closed = (
      await get(
        `/portal/children/${stu.c1}/invoices?status=CLOSED`,
        token.parent1,
      ).expect(200)
    ).body.data;
    expect(
      closed.map((i: { id: string; status: string; paid: number }) => [
        i.id,
        i.status,
        i.paid,
      ]),
    ).toEqual([[inv.c1[0], 'PAID', 4500]]);
    const page = (
      await get(
        `/portal/children/${stu.c2}/invoices?pageSize=2&page=2`,
        token.parent1,
      ).expect(200)
    ).body;
    expect(page.meta).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page.data).toHaveLength(1);
    await get(
      `/portal/children/${stu.c1}/invoices?status=WRONG`,
      token.parent1,
    ).expect(400);
    await get(
      `/portal/children/${stu.c1}/invoices?pageSize=1000`,
      token.parent1,
    ).expect(400);
  });

  it('shows an invoice with discounts and credit notes as amounts only', async ({
    skip,
  }) => {
    if (blocked) skip();
    const d = await portal(`/invoices/${inv.c1[0]}`);
    expect(d).toMatchObject({
      number: expect.stringMatching(/^INV-/),
      kind: 'PERIODIC',
      status: 'PAID',
      gross: 5000,
      discount: 500,
      net: 4500,
      paid: 4500,
      adjusted: 0,
      outstanding: 0,
      className: `${PFX}-${RUN}-C`,
      rollNo: 1,
    });
    expect(d.lines).toEqual([
      expect.objectContaining({ gross: 5000, discount: 500, net: 4500 }),
    ]);
    expect(d.payments).toEqual([
      {
        paymentId: pay.A,
        receiptNo: receipt.A,
        paidOn: today(),
        amount: 4500,
        viaCredit: false,
      },
    ]);
    expect(d.issuedOn.bs).toEqual(expect.any(String));
    const c2 = await portal(`/invoices/${inv.c2[1]}`);
    expect(c2).toMatchObject({
      net: 5000,
      adjusted: 500,
      paid: 0,
      outstanding: 4500,
      status: 'OPEN',
      overdue: true,
    });
    const text = JSON.stringify([d, c2]);
    for (const secret of [
      'NEED_SCHOLARSHIP',
      SECRET_REASON,
      CN_REASON,
      'WAIVER',
      'lineDiscountId',
      'category',
      'reason',
    ])
      expect(text).not.toContain(secret);
  });

  it('shows receipts for a child, and the part of each that belongs to that child', async ({
    skip,
  }) => {
    if (blocked) skip();
    const c1 = (
      await get(`/portal/children/${stu.c1}/payments`, token.parent1).expect(
        200,
      )
    ).body;
    expect(c1.meta.total).toBe(2);
    expect(
      c1.data.map((p: { receiptNo: string; forChild: number }) => [
        p.receiptNo,
        p.forChild,
      ]),
    ).toEqual([
      [receipt.B, 1000],
      [receipt.A, 4500],
    ]); // newest first; receipt A also covered another family's child
    const c2 = (
      await get(`/portal/children/${stu.c2}/payments`, token.parent1).expect(
        200,
      )
    ).body.data;
    expect(
      c2.map((p: { receiptNo: string; status: string; forChild: number }) => [
        p.receiptNo,
        p.status,
        p.forChild,
      ]),
    ).toEqual([
      [receipt.D, 'ACTIVE', 1000],
      [receipt.C, 'REVERSED', 2000],
    ]);
    expect(
      (
        await get(`/portal/children/${stu.c3}/payments`, token.parent2).expect(
          200,
        )
      ).body.data.map((p: { forChild: number }) => p.forChild),
    ).toEqual([3000]);
  });

  it("shows a family receipt with only the viewer's own children, and the rest as one amount", async ({
    skip,
  }) => {
    if (blocked) skip();
    const mine = await portal(`/payments/${pay.A}`);
    expect(mine).toMatchObject({
      receiptNo: receipt.A,
      status: 'ACTIVE',
      method: 'CASH',
      total: 7500,
      amountInWords: 'Rupees Seven Thousand Five Hundred Only',
      advanceCredit: null,
      other: { amount: 3000 },
      receivedBy: 'E2E cashier',
    });
    expect(mine.lines).toEqual([
      expect.objectContaining({
        amount: 4500,
        student: {
          id: stu.c1,
          admissionNo: `E2E-${RUN}-c1`,
          name: `${PFX}-c1 Rai`,
        },
      }),
    ]);
    const theirs = await portal(`/payments/${pay.A}`, token.parent2);
    expect(theirs.lines).toEqual([
      expect.objectContaining({
        amount: 3000,
        student: expect.objectContaining({ admissionNo: `E2E-${RUN}-c3` }),
      }),
    ]);
    expect(theirs.other).toEqual({ amount: 4500 });
    expect(JSON.stringify(mine)).not.toContain(`E2E-${RUN}-c3`);
    expect(JSON.stringify(theirs)).not.toContain(`E2E-${RUN}-c1`);
    expect(JSON.stringify([mine, theirs])).not.toContain(INTERNAL_NOTE); // the cashier's note is never shown
  });

  it('shows advance credit, a reversed receipt without its reason, and a bank reference', async ({
    skip,
  }) => {
    if (blocked) skip();
    const b = await portal(`/payments/${pay.B}`);
    expect(b).toMatchObject({
      total: 1000,
      lines: [],
      other: null,
      advanceCredit: { amount: 1000, student: { id: stu.c1 } },
    });
    const c = await portal(`/payments/${pay.C}`);
    expect(c).toMatchObject({
      status: 'REVERSED',
      total: 2000,
      lines: [expect.objectContaining({ amount: 2000 })],
    });
    const d = await portal(`/payments/${pay.D}`);
    expect(d).toMatchObject({
      method: 'BANK_TRANSFER',
      reference: `TXN-${RUN}-PE`,
      status: 'ACTIVE',
    });
    expect(JSON.stringify([b, c, d])).not.toContain(REVERSAL_REASON);
    expect(JSON.stringify(c)).not.toContain('reason');
  });

  it('writes a statement without voided invoices, with credit notes as one plain line', async ({
    skip,
  }) => {
    if (blocked) skip();
    const s1 = await portal(`/children/${stu.c1}/statement`);
    expect(
      s1.entries.map(
        (e: {
          type: string;
          debit: number;
          credit: number;
          balance: number;
        }) => [e.type, e.debit, e.credit, e.balance],
      ),
    ).toEqual([
      ['INVOICE', 4500, 0, 4500],
      ['INVOICE', 4500, 0, 9000],
      ['PAYMENT', 0, 4500, 4500], // the voided invoice and its void entry are gone
    ]);
    expect(s1).toMatchObject({
      openingBalance: 0,
      closingBalance: 4500,
      credit: 1000,
      student: { admissionNo: `E2E-${RUN}-c1` },
    });
    const s2 = await portal(`/children/${stu.c2}/statement`);
    expect(
      s2.entries.map(
        (e: { type: string; description: string; balance: number }) => [
          e.type,
          e.balance,
        ],
      ),
    ).toEqual([
      ['INVOICE', 5000],
      ['INVOICE', 10_000],
      ['INVOICE', 15_000],
      ['CREDIT_NOTE', 14_500],
      ['PAYMENT', 12_500],
      ['PAYMENT', 11_500],
      ['REVERSAL', 13_500],
    ]);
    expect(
      s2.entries.find((e: { type: string }) => e.type === 'CREDIT_NOTE')
        .description,
    ).toBe('Credit note');
    expect(s2.closingBalance).toBe(13_500);
    const office = (
      await get(`/dues?studentIds=${stu.c2}`, token.staff).expect(200)
    ).body.data;
    expect(office.totalOutstanding).toBe(s2.closingBalance); // the statement always agrees with what is owed

    expect(
      (
        await portal(
          `/children/${stu.c2}/statement?from=${addDays(today(), 1)}`,
        )
      ).entries,
    ).toEqual([]);
    expect(
      await portal(`/children/${stu.c2}/statement?from=${addDays(today(), 1)}`),
    ).toMatchObject({ openingBalance: 13_500, closingBalance: 13_500 });
    expect(
      await portal(`/children/${stu.c2}/statement?to=${addDays(today(), -1)}`),
    ).toMatchObject({ entries: [], closingBalance: 0 });
    await get(
      `/portal/children/${stu.c2}/statement?from=${today()}&to=${addDays(today(), -1)}`,
      token.parent1,
    ).expect(400);
    await get(
      `/portal/children/${stu.c2}/statement?from=2026-13-40`,
      token.parent1,
    ).expect(400);
  });

  it('stops showing a child the moment the school switches the link off', async ({
    skip,
  }) => {
    if (blocked) skip();
    await prisma.studentGuardian.updateMany({
      where: { studentId: stu.c2, guardianId: guardian.g1 },
      data: { portalAccess: false },
    });
    try {
      const f = await portal('/fees');
      expect(
        f.children.map((c: { student: { id: string } }) => c.student.id),
      ).toEqual([stu.c1]);
      expect(f.totals.outstanding).toBe(4500);
      for (const tail of ['/fees', '/invoices', '/payments', '/statement'])
        await get(`/portal/children/${stu.c2}${tail}`, token.parent1).expect(
          404,
        );
      await get(`/portal/invoices/${inv.c2[0]}`, token.parent1).expect(404);
      await get(`/portal/payments/${pay.D}`, token.parent1).expect(404); // a receipt that only touched c2
      await get(`/portal/payments/${pay.A}`, token.parent1).expect(200); // a receipt that also covers c1 stays visible
      await post(
        '/portal/print/receipt',
        { paymentId: pay.D },
        token.parent1,
      ).expect(404);
      expect((await portal('/home')).fees.outstanding).toBe(4500);
    } finally {
      await prisma.studentGuardian.updateMany({
        where: { studentId: stu.c2, guardianId: guardian.g1 },
        data: { portalAccess: true },
      });
    }
    expect((await portal('/fees')).totals.outstanding).toBe(18_000);
  });

  it('prints parent copies with blank signature lines, marked as parent copies', async ({
    skip,
  }) => {
    if (blocked) skip();
    const r = await printBody('receipt', { paymentId: pay.A });
    expect(r).toMatchObject({
      kind: 'RECEIPT',
      variant: 'PARENT_COPY',
      skipped: [],
      issuedOn: { ad: today() },
    });
    expect(r.school.nameEn).toEqual(expect.any(String));
    expect(r.documents).toHaveLength(1);
    expect(r.documents[0]).toMatchObject({
      receiptNo: receipt.A,
      other: { amount: 3000 },
      total: 7500,
    });
    expect(
      r.signatories.every((s: { mode: string }) => s.mode === 'LINE'),
    ).toBe(true);
    expect(Object.keys(r.assets).filter((k) => k.startsWith('sig:'))).toEqual(
      [],
    );
    const res = await post(
      '/portal/print/receipt',
      { paymentId: pay.A },
      token.parent1,
    ).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');

    await printBody('receipt', { paymentId: pay.A });
    expect(
      await prisma.auditLog.count({
        where: { action: 'payment.receipt_printed', entityId: pay.A },
      }),
    ).toBe(0); // a parent copy is never an office duplicate

    const inv1 = await printBody('invoice', { invoiceId: inv.c1[0] });
    expect(inv1).toMatchObject({ kind: 'INVOICE', variant: 'PARENT_COPY' });
    expect(inv1.documents[0]).toMatchObject({
      gross: 5000,
      discount: 500,
      net: 4500,
      status: 'PAID',
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'invoice.printed', entityId: inv.c1[0] },
      }),
    ).toBe(0);

    const st = await printBody('statement', {
      studentId: stu.c2,
      from: today(),
    });
    expect(st).toMatchObject({ kind: 'STATEMENT', variant: 'PARENT_COPY' });
    expect(st.documents[0].closingBalance).toBe(13_500);
  });

  it('refuses to print what the parent could not open', async ({ skip }) => {
    if (blocked) skip();
    await post(
      '/portal/print/receipt',
      { paymentId: pay.B },
      token.parent2,
    ).expect(404);
    await post(
      '/portal/print/receipt',
      { paymentId: pay.A },
      token.unlinked,
    ).expect(403);
    await post(
      '/portal/print/invoice',
      { invoiceId: inv.c3[0] },
      token.parent1,
    ).expect(404); // another family's invoice
    await post(
      '/portal/print/invoice',
      { invoiceId: inv.c1[2] },
      token.parent1,
    ).expect(404); // a voided invoice
    await post(
      '/portal/print/statement',
      { studentId: stu.c3 },
      token.parent1,
    ).expect(404);
    await post(
      '/portal/print/statement',
      { studentId: stu.c1, from: '2026-13-40' },
      token.parent1,
    ).expect(400);
    await post(
      '/portal/print/receipt',
      { paymentId: 'nope' },
      token.parent1,
    ).expect(400);
    await post('/portal/print/receipt', {}, token.parent1).expect(400);
  });

  it("never leaks internal notes, reasons, categories or another family's details anywhere", async ({
    skip,
  }) => {
    if (blocked) skip();
    const urls = [
      '/portal/me',
      '/portal/home',
      '/portal/fees',
      `/portal/children/${stu.c1}`,
      `/portal/children/${stu.c1}/fees`,
      `/portal/children/${stu.c1}/invoices`,
      `/portal/children/${stu.c1}/payments`,
      `/portal/children/${stu.c1}/statement`,
      `/portal/children/${stu.c2}/statement`,
      `/portal/invoices/${inv.c1[0]}`,
      `/portal/invoices/${inv.c2[1]}`,
      `/portal/payments/${pay.A}`,
      `/portal/payments/${pay.B}`,
      `/portal/payments/${pay.C}`,
    ];
    const parts: string[] = [];
    for (const url of urls)
      parts.push(
        JSON.stringify((await get(url, token.parent1).expect(200)).body),
      );
    const text = parts.join('\n');
    for (const secret of [
      `E2E-${RUN}-c3`,
      `${PFX}-c3`,
      'Shrestha',
      `${PFX}-G2`,
      SECRET_REASON,
      INTERNAL_NOTE,
      CN_REASON,
      REVERSAL_REASON,
      'NEED_SCHOLARSHIP',
      'WAIVER',
      `+97797${TAIL}`,
      'idempotency',
    ])
      expect(text, secret).not.toContain(secret);
  });
});
