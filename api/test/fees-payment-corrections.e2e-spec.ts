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

const PFX = 'E2E-PC';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-pc-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const WHY = 'Entered against the wrong family by mistake';
const ASKED = 'Parent asked for a refund in writing';

type Who = 'setup' | 'cashier' | 'cashier2' | 'principal' | 'reader' | 'plain';
type S = 's1' | 's2' | 's3' | 's4';
const STUDENTS: S[] = ['s1', 's2', 's3', 's4'];

describe('Payment corrections, credit, statements and receipts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let createdFiscalYear = false;
  let yearA = '';
  let classId = '';
  const stu = {} as Record<S, string>;
  const adm = {} as Record<S, string>;
  const inv = {} as Record<S, string[]>;
  const invNumber = {} as Record<string, string>;
  let p1 = { id: '', receiptNo: '' };
  let b = { id: '' };
  let c1 = { id: '', receiptNo: '' };
  let c2 = { id: '', receiptNo: '' };
  let c3 = { id: '' };
  let r1 = { id: '' };

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.reader) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const pay = (body: object, t = token.cashier) =>
    post(
      '/payments',
      { idempotencyKey: randomUUID(), method: 'CASH', ...body },
      t,
    );
  const auto = (amount: number, ids: S[], t = token.cashier) =>
    pay({ amount, autoAllocate: { studentIds: ids.map((s) => stu[s]) } }, t);
  const credit = (s: S, amount: number, t = token.cashier) =>
    pay(
      { amount, allocations: [], keepExcessAsCredit: { studentId: stu[s] } },
      t,
    );
  const apply = (body: object, t = token.cashier) =>
    post('/credit/apply', body, t);
  const reverse = (id: string, t = token.cashier, reason = WHY) =>
    post(`/payments/${id}/reverse`, { reason }, t);
  const refund = (id: string, body: object, t = token.principal) =>
    post(
      `/payments/${id}/refund`,
      { method: 'CASH', reason: ASKED, ...body },
      t,
    );
  const counter = async (): Promise<number> =>
    (
      await prisma.sequence.findUnique({
        where: { name: `receipt:${fiscalYearId}` },
      })
    )?.value ?? 0;
  const invoice = async (id: string) =>
    (await get(`/invoices/${id}`).expect(200)).body.data;
  const creditOf = async (s: S) =>
    (await get(`/students/${stu[s]}/credit`).expect(200)).body.data;

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
    const users = await prisma.user.findMany({
      where: { email: { startsWith: 'e2e-pc-' } },
      select: { id: true },
    });
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
        const payments = (
          await tx.payment.findMany({
            where: { receivedById: { in: users.map((u) => u.id) } },
            select: { id: true },
          })
        ).map((p) => p.id);
        await tx.creditRefund.deleteMany({
          where: { paymentId: { in: payments } },
        });
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
    const rows = permissions.length
      ? await prisma.permission.findMany({
          where: {
            OR: permissions.map(([module, action]) => ({ module, action })),
          },
        })
      : [];
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
      where: { email: { startsWith: 'e2e-pc-' } },
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
        createdFiscalYear = true;
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
      ['fees', 'print'],
    ]);
    await makeUser('cashier2', [
      ['fees', 'read'],
      ['fees', 'payment-record'],
      ['fees', 'payment-reverse'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'invoice-void'],
      ['fees', 'payment-reverse-closed'],
      ['fees', 'refund-approve'],
    ]);
    await makeUser('reader', [['fees', 'read']]);
    await makeUser('plain', []);

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
            periodIds: periods.map((p) => p.id),
          },
        ],
      },
      token.setup,
    ).expect(200);

    const guardian = await prisma.guardian.create({
      data: { firstName: `${PFX}-G`, phone: `+97798${TAIL.slice(0, 8)}` },
    });
    for (const [index, key] of STUDENTS.entries()) {
      adm[key] = `E2E-${RUN}-${key}`;
      const sibling = key === 's1' || key === 's2';
      const student = await prisma.student.create({
        data: {
          admissionNo: adm[key],
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
          ...(sibling
            ? {
                guardians: {
                  create: [
                    {
                      guardianId: guardian.id,
                      relationship: 'FATHER',
                      isPrimary: true,
                    },
                  ],
                },
              }
            : {}),
        },
      });
      stu[key] = student.id;
      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          academicYearId: yearA,
          classId,
          sectionId: section,
          rollNo: index + 1,
        },
      });
    }
    for (const p of periods.slice(0, 3))
      await post(
        '/invoices/generate',
        { kind: 'PERIODIC', periodId: p.id, classId },
        token.cashier,
      ).expect(200);
    for (const key of STUDENTS) {
      const rows = await prisma.invoice.findMany({
        where: { studentId: stu[key] },
        orderBy: { dueDate: 'asc' },
      });
      inv[key] = rows.map((r) => r.id);
      for (const r of rows) invNumber[r.id] = r.number;
    }
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-pc-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('gives each action to the right people only', async ({ skip }) => {
    if (blocked) skip();
    const id = randomUUID();
    await http()
      .post(`${V1}/payments/${id}/reverse`)
      .send({ reason: WHY })
      .expect(401);
    for (const t of [token.plain, token.reader]) {
      await reverse(id, t).expect(403);
      await refund(id, { amount: 1 }, t).expect(403);
      await apply({ studentId: stu.s1, autoAllocate: true }, t).expect(403);
      await get(`/payments/${id}/receipt`, t).expect(403);
    }
    await refund(id, { amount: 1 }, token.cashier).expect(403); // refunding is principal-level
    await get(`/payments/${id}/receipt`, token.principal).expect(403); // printing is a cashier's job
    await get(`/students/${stu.s1}/statement`, token.plain).expect(403);
    await get(`/students/${stu.s1}/credit`, token.plain).expect(403);
    await get(`/students/${stu.s1}/statement`, token.reader).expect(200);
  });

  it('validates reversals', async ({ skip }) => {
    if (blocked) skip();
    await reverse(randomUUID(), token.cashier, 'short').expect(400);
    await reverse(randomUUID()).expect(404);
    await post(`/payments/${randomUUID()}/reverse`, {}, token.cashier).expect(
      400,
    );
  });

  it('reverses a payment made today: the receipt number stays, and the invoices become payable again', async ({
    skip,
  }) => {
    if (blocked) skip();
    const made = (await auto(6000, ['s1']).expect(201)).body.data;
    p1 = { id: made.id, receiptNo: made.receiptNo };
    expect(await invoice(inv.s1[0])).toMatchObject({ status: 'PAID' });
    const before = await counter();

    const done = await reverse(p1.id, token.cashier2).expect(200); // anyone with the permission may reverse it
    expect(done.body.data).toMatchObject({
      status: 'REVERSED',
      receiptNo: p1.receiptNo,
      unapplied: 0,
      amount: 6000,
      reversal: { reason: WHY, reversedBy: 'E2E cashier2' },
    });
    expect(await counter()).toBe(before); // a reversal uses no receipt number
    expect(await invoice(inv.s1[0])).toMatchObject({
      status: 'OPEN',
      paid: 0,
      outstanding: 5000,
    });
    expect(await invoice(inv.s1[1])).toMatchObject({
      status: 'OPEN',
      paid: 0,
      outstanding: 5000,
    });

    await reverse(p1.id).expect(409); // already reversed
    expect(
      (
        await get('/payments?reversed=true&pageSize=100').expect(200)
      ).body.data.some((p: { id: string }) => p.id === p1.id),
    ).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'payment.reversed', entityId: p1.id },
    });
    expect(audit.details).toEqual({
      receiptNo: p1.receiptNo,
      amount: 6000,
      sameDay: true,
    });
    await expect(
      prisma.paymentReversal.delete({ where: { paymentId: p1.id } }),
    ).rejects.toThrow(/append-only/);
  });

  it('lets a reference be used again once its payment was reversed', async ({
    skip,
  }) => {
    if (blocked) skip();
    const ref = `ESW-${RUN}-R`;
    const one = (extra: object = {}) =>
      pay({
        amount: 100,
        method: 'ESEWA',
        reference: ref,
        allocations: [{ invoiceId: inv.s2[0], amount: 100 }],
        ...extra,
      });
    const a = await one().expect(201);
    await one().expect(409);
    await reverse(a.body.data.id as string).expect(200);
    b = { id: (await one().expect(201)).body.data.id as string }; // the same reference, now that the first was cancelled
    expect(await invoice(inv.s2[0])).toMatchObject({
      paid: 100,
      outstanding: 4900,
    });
  });

  it('needs principal-level approval to reverse a payment from an earlier day', async ({
    skip,
  }) => {
    if (blocked) skip();
    const old = await prisma.payment.create({
      data: {
        receiptNo: `RAW-${RUN}-old`,
        fiscalYearId,
        paidOn: date(today()),
        method: 'CASH',
        amount: 1000,
        receivedById: userId.cashier,
        idempotencyKey: `raw-${RUN}-old-xxxx`,
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        paymentId: old.id,
        invoiceId: inv.s3[0],
        amount: 1000,
        allocatedById: userId.cashier,
      },
    });
    expect(await invoice(inv.s3[0])).toMatchObject({
      paid: 1000,
      outstanding: 4000,
    });

    const refused = await reverse(old.id, token.cashier).expect(403);
    expect(refused.body.error.message).toMatch(/earlier day/);
    await reverse(old.id, token.cashier2).expect(403);
    await reverse(old.id, token.principal).expect(200);
    expect(await invoice(inv.s3[0])).toMatchObject({
      paid: 0,
      outstanding: 5000,
    });
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { action: 'payment.reversed', entityId: old.id },
        })
      ).details,
    ).toMatchObject({ sameDay: false });
  });

  it('validates applying advance credit', async ({ skip }) => {
    if (blocked) skip();
    c1 = await credit('s1', 3000)
      .expect(201)
      .then((r) => ({
        id: r.body.data.id as string,
        receiptNo: r.body.data.receiptNo as string,
      }));
    c2 = await credit('s1', 2000)
      .expect(201)
      .then((r) => ({
        id: r.body.data.id as string,
        receiptNo: r.body.data.receiptNo as string,
      }));
    const dues = (await get(`/dues?studentIds=${stu.s1},${stu.s2}`).expect(200))
      .body.data;
    expect(
      dues.students.find(
        (s: { student: { id: string } }) => s.student.id === stu.s1,
      ).credit,
    ).toBe(5000);
    expect(dues.totalCredit).toBe(5000);
    const held = await creditOf('s1');
    expect(held.total).toBe(5000);
    expect(
      held.payments.map((p: { receiptNo: string; unapplied: number }) => [
        p.receiptNo,
        p.unapplied,
      ]),
    ).toEqual([
      [c1.receiptNo, 3000],
      [c2.receiptNo, 2000],
    ]); // oldest first

    await apply({ studentId: stu.s1 }).expect(400); // neither
    await apply({
      studentId: stu.s1,
      autoAllocate: true,
      allocations: [{ invoiceId: inv.s1[0], amount: 100 }],
    }).expect(400); // both
    await apply({
      studentId: stu.s1,
      allocations: [{ invoiceId: inv.s1[0], amount: 100 }],
      maxAmount: 100,
    }).expect(400);
    await apply({ studentId: stu.s1, allocations: [] }).expect(400);
    await apply({
      studentId: stu.s1,
      allocations: [
        { invoiceId: inv.s1[0], amount: 50 },
        { invoiceId: inv.s1[0], amount: 50 },
      ],
    }).expect(400);
    await apply({
      studentId: stu.s1,
      allocations: [{ invoiceId: inv.s1[0], amount: 0 }],
    }).expect(400);
    await apply({ allocations: [{ invoiceId: inv.s1[0], amount: 50 }] }).expect(
      400,
    ); // no student
    await apply({ studentId: randomUUID(), autoAllocate: true }).expect(404);
    await apply({ studentId: stu.s3, autoAllocate: true }).expect(409); // s3 holds no credit
    await apply({
      studentId: stu.s1,
      allocations: [{ invoiceId: randomUUID(), amount: 50 }],
    }).expect(404);
    const stranger = await apply({
      studentId: stu.s1,
      allocations: [{ invoiceId: inv.s3[1], amount: 50 }],
    }).expect(400);
    expect(stranger.body.error.message).toMatch(/sibling/);
  });

  it('applies credit across receipts, to a sibling, and by auto-allocation', async ({
    skip,
  }) => {
    if (blocked) skip();
    const first = await apply({
      studentId: stu.s1,
      allocations: [{ invoiceId: inv.s1[0], amount: 4000 }],
    }).expect(200);
    expect(first.body.data).toMatchObject({
      applied: 4000,
      creditRemaining: 1000,
      allocations: [{ invoice: { id: inv.s1[0] }, amount: 4000 }],
    });
    const rows = await prisma.paymentAllocation.findMany({
      where: { invoiceId: inv.s1[0] },
      orderBy: { amount: 'asc' },
    });
    expect(rows.map((r) => [r.paymentId, r.amount.toNumber()])).toEqual([
      [c2.id, 1000],
      [c1.id, 3000],
    ]); // drawn from two receipts, oldest first
    expect(await invoice(inv.s1[0])).toMatchObject({
      status: 'PARTIAL',
      paid: 4000,
      outstanding: 1000,
    });

    const sibling = await apply({
      studentId: stu.s1,
      allocations: [{ invoiceId: inv.s2[1], amount: 500 }],
    }).expect(200);
    expect(sibling.body.data).toMatchObject({
      applied: 500,
      creditRemaining: 500,
    });
    expect(await invoice(inv.s2[1])).toMatchObject({
      paid: 500,
      outstanding: 4500,
    });

    expect(
      (
        await apply({
          studentId: stu.s1,
          allocations: [{ invoiceId: inv.s1[0], amount: 600 }],
        }).expect(409)
      ).body.error.message,
    ).toMatch(/more than the NPR 500 of advance credit/);
    expect(
      (
        await apply({
          studentId: stu.s1,
          allocations: [{ invoiceId: inv.s1[0], amount: 1100 }],
        }).expect(409)
      ).body.error.message,
    ).toMatch(/still owed/);

    const auto1 = await apply({ studentId: stu.s1, autoAllocate: true }).expect(
      200,
    );
    expect(auto1.body.data).toMatchObject({
      applied: 500,
      creditRemaining: 0,
      allocations: [{ invoice: { id: inv.s1[0] }, amount: 500 }],
    }); // the oldest invoice first
    expect(await invoice(inv.s1[0])).toMatchObject({
      paid: 4500,
      outstanding: 500,
    });
    expect(
      (await apply({ studentId: stu.s1, autoAllocate: true }).expect(409)).body
        .error.message,
    ).toMatch(/holds no advance credit/);
    expect((await creditOf('s1')).total).toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'credit.applied', entityId: stu.s1 },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.details).toEqual({ amount: 4000, invoices: 1, receipts: 2 });
  });

  it('never lets two people spend the same credit twice', async ({ skip }) => {
    if (blocked) skip();
    c3 = { id: (await credit('s1', 1000).expect(201)).body.data.id as string };
    const race = await Promise.all([
      apply(
        {
          studentId: stu.s1,
          allocations: [{ invoiceId: inv.s1[1], amount: 800 }],
        },
        token.cashier,
      ),
      apply(
        {
          studentId: stu.s1,
          allocations: [{ invoiceId: inv.s1[2], amount: 800 }],
        },
        token.cashier2,
      ),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(race.find((r) => r.status === 200)?.body.data.creditRemaining).toBe(
      200,
    );
    expect((await creditOf('s1')).total).toBe(200);
    const paid =
      (await invoice(inv.s1[1])).paid + (await invoice(inv.s1[2])).paid;
    expect(paid).toBe(800);

    // Reversing a receipt whose credit was used puts those invoices back in debt.
    const reversed = await reverse(c1.id).expect(200);
    expect(reversed.body.data.status).toBe('REVERSED');
    expect(await invoice(inv.s1[0])).toMatchObject({
      paid: 1500,
      outstanding: 3500,
      status: 'PARTIAL',
    });
    expect((await creditOf('s1')).total).toBe(200); // credit from other receipts is untouched
  });

  it('refunds unapplied credit, and keeps the books exact', async ({
    skip,
  }) => {
    if (blocked) skip();
    r1 = { id: (await credit('s4', 5000).expect(201)).body.data.id as string };
    await refund(r1.id, { amount: 1000 }, token.cashier2).expect(403);
    await refund(r1.id, { amount: 100, reason: 'short' }).expect(400);

    const cash = await refund(r1.id, { amount: 1000 }).expect(200);
    expect(cash.body.data).toMatchObject({
      refunded: 1000,
      unapplied: 4000,
      refunds: [{ amount: 1000, method: 'CASH', reference: null }],
    });
    expect(
      (await refund(r1.id, { amount: 4001 }).expect(409)).body.error.message,
    ).toMatch(/Only NPR 4000/);
    await refund(r1.id, { amount: 100, method: 'BANK_TRANSFER' }).expect(400); // other methods need a reference
    await refund(r1.id, {
      amount: 100,
      method: 'CASH',
      reference: 'X-1000',
    }).expect(400);
    const bank = await refund(r1.id, {
      amount: 500,
      method: 'BANK_TRANSFER',
      reference: `bnk-${RUN}`,
    }).expect(200);
    expect(bank.body.data).toMatchObject({ refunded: 1500, unapplied: 3500 });
    expect(
      bank.body.data.refunds.map(
        (f: { reference: string | null }) => f.reference,
      ),
    ).toEqual([null, `BNK-${RUN}`]);
    expect((await creditOf('s4')).total).toBe(3500);

    await refund(b.id, { amount: 10 }).expect(409); // a payment that kept no credit
    await refund(p1.id, { amount: 10 }).expect(409); // a reversed payment
    await refund(randomUUID(), { amount: 10 }).expect(404);
    expect((await reverse(r1.id).expect(409)).body.error.message).toMatch(
      /refunded/,
    ); // money has left
    await expect(
      prisma.paymentReversal.create({
        data: {
          paymentId: r1.id,
          reason: 'Raw reversal after a refund',
          reversedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/refunded cannot be reversed/);
    await expect(
      prisma.creditRefund.create({
        data: {
          paymentId: r1.id,
          amount: 3501,
          method: 'CASH',
          reason: 'Raw refund of more than is held',
          approvedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/not that much unapplied credit/);

    const spent = await apply({
      studentId: stu.s4,
      allocations: [{ invoiceId: inv.s4[0], amount: 3500 }],
    }).expect(200);
    expect(spent.body.data).toMatchObject({
      applied: 3500,
      creditRemaining: 0,
    });
    await refund(r1.id, { amount: 1 }).expect(409); // nothing unapplied is left
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'credit.refunded', entityId: r1.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.details).toMatchObject({ amount: 1000, method: 'CASH' });
  });

  it('never lets a refund and an application spend the same credit', async ({
    skip,
  }) => {
    if (blocked) skip();
    const r2 = (await credit('s4', 1000).expect(201)).body.data.id as string;
    const race = await Promise.all([
      refund(r2, { amount: 800 }),
      apply({
        studentId: stu.s4,
        allocations: [{ invoiceId: inv.s4[1], amount: 800 }],
      }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await creditOf('s4')).total).toBe(200);
  });

  it('writes a statement that always agrees with the dues', async ({
    skip,
  }) => {
    if (blocked) skip();
    // s2: three invoices of 5000; a reversed payment of 100; a payment of 100; 500 of a sibling's credit; one invoice voided.
    await post(
      `/invoices/${inv.s2[2]}/void`,
      { reason: 'Issued twice by mistake, see ledger' },
      token.principal,
    ).expect(200);
    const s = (await get(`/students/${stu.s2}/statement`).expect(200)).body
      .data;

    expect(s.student).toMatchObject({
      admissionNo: adm.s2,
      className: `${PFX}-${RUN}-C`,
      sectionName: 'A',
    });
    expect(s.entries.map((e: { type: string }) => e.type)).toEqual([
      'INVOICE',
      'INVOICE',
      'INVOICE',
      'VOID',
      'PAYMENT',
      'PAYMENT',
      'PAYMENT',
      'REVERSAL',
    ]);
    expect(s.totals).toEqual({
      invoiced: 15_000,
      voided: 5000,
      creditNotes: 0,
      payments: 700,
      reversed: 100,
      outstanding: 9400,
    });
    expect(s.openingBalance).toBe(0);
    expect(s.closingBalance).toBe(9400);
    expect(s.entries[0]).toMatchObject({
      debit: 5000,
      credit: 0,
      balance: 5000,
    });
    expect(s.entries[2].balance).toBe(15_000);
    expect(s.entries[3]).toMatchObject({
      debit: 0,
      credit: 5000,
      balance: 10_000,
      description: expect.stringMatching(/voided/),
    });
    expect(s.entries.at(-1)).toMatchObject({
      type: 'REVERSAL',
      debit: 100,
      balance: 9400,
    });
    const appliedEntry = s.entries.find((e: { description: string }) =>
      e.description.includes('advance credit'),
    );
    expect(appliedEntry).toMatchObject({
      type: 'PAYMENT',
      credit: 500,
      against: invNumber[inv.s2[1] as string],
      date: today(),
    });
    expect(s.entries[0].dateBs).toEqual(expect.any(String));
    expect(s.credit).toEqual({ total: 0, payments: [] });

    const dues = (await get(`/dues?studentIds=${stu.s2}`).expect(200)).body
      .data;
    expect(dues.totalOutstanding).toBe(s.closingBalance); // the two views never disagree

    const future = (
      await get(
        `/students/${stu.s2}/statement?from=${addDays(today(), 1)}`,
      ).expect(200)
    ).body.data;
    expect(future).toMatchObject({
      openingBalance: 9400,
      entries: [],
      closingBalance: 9400,
    });
    const past = (
      await get(
        `/students/${stu.s2}/statement?to=${addDays(today(), -1)}`,
      ).expect(200)
    ).body.data;
    expect(past).toMatchObject({
      openingBalance: 0,
      entries: [],
      closingBalance: 0,
    });
    expect(
      (
        await get(
          `/students/${stu.s2}/statement?from=${today()}&to=${today()}`,
        ).expect(200)
      ).body.data.entries,
    ).toHaveLength(8);
    expect(
      (
        await get(
          `/students/${stu.s2}/statement?academicYearId=${yearA}`,
        ).expect(200)
      ).body.data.closingBalance,
    ).toBe(9400);
    expect(
      (
        await get(
          `/students/${stu.s2}/statement?academicYearId=${randomUUID()}`,
        ).expect(200)
      ).body.data,
    ).toMatchObject({ entries: [], closingBalance: 0 });
    await get(`/students/${stu.s2}/statement?from=2026-13-40`).expect(400);
    await get(
      `/students/${stu.s2}/statement?from=${today()}&to=${addDays(today(), -1)}`,
    ).expect(400);
    await get(`/students/${randomUUID()}/statement`).expect(404);

    // A student holding credit shows it beside the ledger.
    expect(
      (await get(`/students/${stu.s1}/statement`).expect(200)).body.data.credit,
    ).toMatchObject({ total: 200, payments: [{ unapplied: 200 }] });
  });

  it('prints receipts: the first is the original, the rest are marked duplicate', async ({
    skip,
  }) => {
    if (blocked) skip();
    const print = (id: string, t = token.cashier) =>
      get(`/payments/${id}/receipt`, t);
    const first = (await print(p1.id).expect(200)).body.data;
    expect(first).toMatchObject({
      receiptNo: p1.receiptNo,
      status: 'REVERSED',
      method: 'CASH',
      total: 6000,
      amountInWords: 'Rupees Six Thousand Only',
      receivedBy: 'E2E cashier',
      copy: { kind: 'ORIGINAL', number: 1 },
      advanceCredit: { amount: 0, student: null },
    });
    expect(
      first.lines.map(
        (l: { amount: number; student: { admissionNo: string } }) => [
          l.student.admissionNo,
          l.amount,
        ],
      ),
    ).toEqual([
      [adm.s1, 5000],
      [adm.s1, 1000],
    ]);
    expect(first.lines[0]).toMatchObject({
      student: { className: `${PFX}-${RUN}-C`, sectionName: 'A' },
      invoice: { kind: 'PERIODIC' },
    });
    expect(first.paidOnBs).toEqual(expect.any(String));
    expect(first).not.toHaveProperty('note');
    expect((await print(p1.id).expect(200)).body.data.copy).toEqual({
      kind: 'DUPLICATE',
      number: 2,
    });
    expect((await print(p1.id).expect(200)).body.data.copy).toEqual({
      kind: 'DUPLICATE',
      number: 3,
    });
    await print(randomUUID()).expect(404);

    // A receipt for advance credit shows what was kept at the time, even after the credit was spent.
    const kept = (await print(c2.id).expect(200)).body.data;
    expect(kept).toMatchObject({
      lines: [],
      total: 2000,
      amountInWords: 'Rupees Two Thousand Only',
      advanceCredit: { amount: 2000, student: { admissionNo: adm.s1 } },
    });

    // Two people pressing Print at the same moment: one original, one duplicate.
    const both = await Promise.all([print(c3.id), print(c3.id, token.cashier)]);
    expect(both.map((r) => r.body.data.copy.kind).sort()).toEqual([
      'DUPLICATE',
      'ORIGINAL',
    ]);
    expect(
      await prisma.auditLog.count({
        where: { action: 'payment.receipt_printed', entityId: p1.id },
      }),
    ).toBe(3);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'payment.receipt_printed', entityId: p1.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.details).toEqual({ copy: 1 });
  });

  it('keeps reasons, references and names out of the audit log', async ({
    skip,
  }) => {
    if (blocked) skip();
    const logs = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'payment.reversed',
            'credit.applied',
            'credit.refunded',
            'payment.receipt_printed',
          ],
        },
      },
      select: { details: true },
    });
    const text = JSON.stringify(logs);
    for (const secret of [WHY, ASKED, `BNK-${RUN}`, `ESW-${RUN}`, PFX, 'Rai'])
      expect(text).not.toContain(secret);
  });

  it('refuses reversals, refunds and credit once the fiscal year is closed', async ({
    skip,
  }) => {
    if (blocked) skip();
    if (!createdFiscalYear) skip(); // only a fiscal year created by this test may be closed
    await prisma.fiscalYear.update({
      where: { id: fiscalYearId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    try {
      expect((await reverse(c3.id).expect(409)).body.error.message).toMatch(
        /closed/,
      );
      await refund(c3.id, { amount: 100 }).expect(409);
      await apply({ studentId: stu.s1, autoAllocate: true }).expect(409);
    } finally {
      await prisma.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { status: 'OPEN', closedAt: null },
      });
    }
  });
});
