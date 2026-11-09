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

const PFX = 'E2E-DAY';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-day-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const NOTE = 'Receipt book entry from three days ago';
const SHORT = 'Shortage of one hundred rupees noted at the counter';

type Who =
  'setup' | 'acc' | 'acc2' | 'principal' | 'reporter' | 'reader' | 'plain';
type S = 's1' | 's2' | 's3';
const STUDENTS: S[] = ['s1', 's2', 's3'];

describe('Day closing and collection reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let fiscalStart = '';
  let createdFiscalYear = false;
  let yearA = '';
  let classId = '';
  let periods: { id: string; name: string }[] = [];
  const stu = {} as Record<S, string>;
  const inv = {} as Record<S, string[]>;
  const D1 = addDays(today(), -3);
  let hasD1 = false;
  const pay1 = { cash5000: '', cash3000: '', bank4000: '', cash2000: '' };
  let esewa = '';
  let closeV1 = '';
  let closeV2 = '';
  let todayClose = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.reporter) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const pay = (body: object, t = token.acc) =>
    post(
      '/payments',
      { idempotencyKey: randomUUID(), method: 'CASH', ...body },
      t,
    );
  const advance = (s: S, amount: number, extra: object = {}, t = token.acc) =>
    pay(
      {
        amount,
        allocations: [],
        keepExcessAsCredit: { studentId: stu[s] },
        paidOn: D1,
        note: NOTE,
        ...extra,
      },
      t,
    );
  const close = (body: object, t = token.acc) => post('/day-closes', body, t);
  const reopen = (
    id: string,
    t = token.principal,
    reason = 'Found a receipt that was entered on the wrong day',
  ) => post(`/day-closes/${id}/reopen`, { reason }, t);
  const dayBody = (
    d: string,
    expectedCash: number,
    receiptCount: number,
    lines: [Who, number][],
    extra: object = {},
  ) => ({
    date: d,
    expect: { expectedCash, receiptCount },
    lines: lines.map(([who, countedCash]) => ({
      cashierId: userId[who],
      countedCash,
    })),
    ...extra,
  });

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
        where: { email: { startsWith: 'e2e-day-' } },
        select: { id: true },
      })
    ).map((u) => u.id);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
        const closes = (
          await tx.dayClose.findMany({
            where: { closedById: { in: users } },
            select: { id: true },
          })
        ).map((c) => c.id);
        await tx.dayCloseReopen.deleteMany({
          where: { dayCloseId: { in: closes } },
        });
        await tx.dayCloseLine.deleteMany({
          where: { dayCloseId: { in: closes } },
        });
        await tx.dayClose.deleteMany({ where: { id: { in: closes } } });
        const payments = (
          await tx.payment.findMany({
            where: { receivedById: { in: users } },
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
      where: { email: { startsWith: 'e2e-day-' } },
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
      fiscalStart = covering.startDate.toISOString().slice(0, 10);
    } else {
      try {
        fiscalStart = addDays(today(), -100);
        fiscalYearId = (
          await prisma.fiscalYear.create({
            data: {
              label: `${PFX}-${RUN}-FY`,
              startDate: date(fiscalStart),
              endDate: date(addDays(fiscalStart, 364)),
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
    hasD1 = fiscalStart <= D1;
    if (
      (await prisma.dayClose.findFirst({
        where: {
          date: { in: [date(D1), date(today())] },
          reopen: { is: null },
        },
      })) !== null
    ) {
      blocked =
        'Skipped: a real day close already exists for one of the dates this test needs.';
      return;
    }

    await makeUser('setup', [
      ['fees', 'read'],
      ['fees', 'structure-manage'],
    ]);
    await makeUser('acc', [
      ['fees', 'read'],
      ['fees', 'invoice-generate'],
      ['fees', 'payment-record'],
      ['fees', 'payment-backdate'],
      ['fees', 'payment-reverse'],
      ['fees', 'day-close'],
      ['fees', 'reports'],
    ]);
    await makeUser('acc2', [
      ['fees', 'read'],
      ['fees', 'payment-record'],
      ['fees', 'payment-backdate'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'payment-reverse-closed'],
      ['fees', 'refund-approve'],
      ['fees', 'day-reopen'],
      ['fees', 'reports'],
    ]);
    await makeUser('reporter', [['fees', 'reports']]);
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
    periods = (
      await post(
        `/academic-years/${yearA}/billing-periods/generate`,
        { months: 12 },
        token.setup,
      ).expect(200)
    ).body.data;
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
    for (const [index, key] of STUDENTS.entries()) {
      const student = await prisma.student.create({
        data: {
          admissionNo: `E2E-${RUN}-${key}`,
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
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
    for (const p of periods.slice(0, 2))
      await post(
        '/invoices/generate',
        { kind: 'PERIODIC', periodId: p.id, classId },
        token.acc,
      ).expect(200);
    for (const key of STUDENTS) {
      inv[key] = (
        await prisma.invoice.findMany({
          where: { studentId: stu[key] },
          orderBy: { dueDate: 'asc' },
        })
      ).map((r) => r.id);
    }
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-day-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('gives each action to the right people only', async ({ skip }) => {
    if (blocked) skip();
    await http().get(`${V1}/day-closes/preview`).expect(401);
    for (const t of [token.plain, token.reader]) {
      await get('/day-closes/preview', t).expect(403);
      await get('/day-closes', t).expect(403);
      await get('/day-closes/pending', t).expect(403);
      await get('/reports/daily', t).expect(403);
      await get('/reports/collections', t).expect(403);
    }
    await close(dayBody(today(), 0, 0, []), token.acc2).expect(403);
    await close(dayBody(today(), 0, 0, []), token.principal).expect(403); // closing is the accountant's job
    await reopen(randomUUID(), token.acc).expect(403); // reopening is the principal's
    await reopen(randomUUID(), token.reporter).expect(403);
    await reopen(randomUUID(), token.principal, 'short').expect(400);
    await reopen(randomUUID()).expect(404);
    await get(`/day-closes/${randomUUID()}`).expect(404);
  });

  it("records the day's receipts from two cashiers and shows what should be in the drawer", async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    pay1.cash5000 = (await advance('s1', 5000).expect(201)).body.data.id;
    pay1.cash3000 = (await advance('s1', 3000).expect(201)).body.data.id;
    pay1.bank4000 = (
      await advance('s2', 4000, {
        method: 'BANK_TRANSFER',
        reference: `TXN-${RUN}-D1`,
      }).expect(201)
    ).body.data.id;
    pay1.cash2000 = (
      await advance('s3', 2000, {}, token.acc2).expect(201)
    ).body.data.id;

    const p = (await get(`/day-closes/preview?date=${D1}`).expect(200)).body
      .data;
    expect(p).toMatchObject({
      date: D1,
      closed: false,
      canClose: true,
      problems: [],
      activeClose: null,
    });
    expect(p.figures).toMatchObject({
      receiptCount: 4,
      received: 14_000,
      cashReceived: 10_000,
      expectedCash: 10_000,
      cashPaidOut: { refunds: 0, reversals: 0, total: 0 },
    });
    expect(
      p.figures.byMethod.map(
        (m: { method: string; count: number; amount: number }) => [
          m.method,
          m.count,
          m.amount,
        ],
      ),
    ).toEqual([
      ['CASH', 3, 10_000],
      ['BANK_TRANSFER', 1, 4000],
    ]);
    expect(
      p.figures.cashiers.map(
        (c: {
          cashier: { name: string };
          cashReceived: number;
          otherReceived: number;
        }) => [c.cashier.name, c.cashReceived, c.otherReceived],
      ),
    ).toEqual([
      ['E2E acc', 8000, 4000],
      ['E2E acc2', 2000, 0],
    ]);
    expect(p.dateBs).toEqual(expect.any(String));

    const pending = (
      await get(`/day-closes/pending?from=${D1}&to=${D1}`).expect(200)
    ).body.data;
    expect(pending).toEqual([
      expect.objectContaining({ date: D1, payments: 4, total: 14_000 }),
    ]);
    const byBs = (
      await get(`/day-closes/preview?dateBs=${p.dateBs}`).expect(200)
    ).body.data;
    expect(byBs.date).toBe(D1);
    await get(`/day-closes/preview?date=${D1}&dateBs=${p.dateBs}`)
      .expect(200)
      .then((r) => expect(r.body.data.date).toBe(D1)); // either calendar for the same day
  });

  it('refuses a close that does not add up, with a clear reason', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const ok: [Who, number][] = [
      ['acc', 8000],
      ['acc2', 2000],
    ];
    await close(dayBody(D1, 10_000, 4, [['acc', 8000]])).expect(400); // the second cashier has no count
    await close(dayBody(D1, 10_000, 4, [...ok, ['principal', 0]])).expect(400); // someone who took no cash
    await close(dayBody(D1, 10_000, 4, [...ok, ['acc', 1]])).expect(400); // the same person twice
    await close(
      dayBody(D1, 10_000, 4, [
        ['acc', -1],
        ['acc2', 2000],
      ]),
    ).expect(400);
    await close(
      dayBody(D1, 10_000, 4, [
        ['acc', 8000.123],
        ['acc2', 2000],
      ]),
    ).expect(400);
    await close(dayBody(D1, 9_999, 4, ok)).expect(409); // the figures moved since the screen was loaded
    await close(dayBody(D1, 10_000, 5, ok)).expect(409);
    await close({ ...dayBody(D1, 10_000, 4, ok), dateBs: '2062-01-01' }).expect(
      400,
    ); // both calendars
    await close(dayBody(addDays(today(), 1), 0, 0, [])).expect(400); // tomorrow has not happened
    await close(dayBody('1990-01-01', 0, 0, [])).expect(409); // no fiscal year covers it

    const short = dayBody(D1, 10_000, 4, [
      ['acc', 7900],
      ['acc2', 2000],
    ]);
    expect((await close(short).expect(400)).body.error.message).toMatch(
      /NPR 100 short/,
    ); // a difference needs an explanation
    await close({ ...short, note: SHORT }).expect(400); // and so does the cashier who is short
    await close({ ...short, note: 'short' }).expect(400);
    expect(await prisma.dayClose.count({ where: { date: date(D1) } })).toBe(0);
  });

  it('closes the day, and keeps the shortage on record', async ({ skip }) => {
    if (blocked || !hasD1) skip();
    const res = await close({
      date: D1,
      expect: { expectedCash: 10_000, receiptCount: 4 },
      note: SHORT,
      lines: [
        {
          cashierId: userId.acc,
          countedCash: 7900,
          note: 'One torn note was refused at the bank',
        },
        { cashierId: userId.acc2, countedCash: 2000 },
      ],
    }).expect(201);
    const c = res.body.data;
    closeV1 = c.id;
    expect(c).toMatchObject({
      date: D1,
      version: 1,
      status: 'ACTIVE',
      expectedCash: 10_000,
      countedCash: 9900,
      cashPaidOut: 0,
      variance: -100,
      receiptCount: 4,
      closedBy: 'E2E acc',
      note: SHORT,
      reopen: null,
    });
    expect(c.methodTotals).toEqual([
      { method: 'CASH', count: 3, amount: 10_000 },
      { method: 'BANK_TRANSFER', count: 1, amount: 4000 },
    ]);
    expect(
      c.lines.map(
        (l: {
          cashier: { name: string };
          expectedCash: number;
          countedCash: number;
          variance: number;
        }) => [l.cashier.name, l.expectedCash, l.countedCash, l.variance],
      ),
    ).toEqual([
      ['E2E acc', 8000, 7900, -100],
      ['E2E acc2', 2000, 2000, 0],
    ]);

    await close(
      dayBody(D1, 10_000, 4, [
        ['acc', 8000],
        ['acc2', 2000],
      ]),
    ).expect(409); // already closed
    expect(
      (await get(`/day-closes/preview?date=${D1}`).expect(200)).body.data,
    ).toMatchObject({
      closed: true,
      canClose: false,
      activeClose: { id: closeV1 },
    });
    expect(
      (await get(`/day-closes/pending?from=${D1}&to=${D1}`).expect(200)).body
        .data,
    ).toEqual([]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'day.closed', entityId: closeV1 },
    });
    expect(audit.details).toEqual({
      date: D1,
      version: 1,
      expectedCash: 10_000,
      countedCash: 9900,
      variance: -100,
      receipts: 4,
    });
    await expect(
      prisma.dayCloseLine.update({
        where: {
          dayCloseId_cashierId: { dayCloseId: closeV1, cashierId: userId.acc },
        },
        data: { countedCash: 8000, variance: 0 },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('locks the closed day against new receipts, in the application and in the database', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const refused = await advance('s1', 100).expect(409);
    expect(refused.body.error.message).toMatch(/closed/);
    await expect(
      prisma.payment.create({
        data: {
          receiptNo: `RAW-${RUN}-d1`,
          fiscalYearId,
          paidOn: date(D1),
          method: 'CASH',
          amount: 10,
          receivedById: userId.acc,
          idempotencyKey: `raw-${RUN}-d1-xxxx`,
        },
      }),
    ).rejects.toThrow(/has been closed/);
    expect(
      (await get(`/reports/daily?date=${D1}`).expect(200)).body.data,
    ).toMatchObject({
      official: 'CLOSE',
      changedSinceClose: false,
      close: { id: closeV1, variance: -100 },
    });
  });

  it('lets a later reversal move cash on that later day, and flags the old close as changed', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const reversed = await post(
      `/payments/${pay1.cash3000}/reverse`,
      { reason: 'Recorded against the wrong student' },
      token.acc,
    ).expect(200);
    expect(reversed.body.data.status).toBe('REVERSED');

    const d1 = (await get(`/reports/daily?date=${D1}`).expect(200)).body.data;
    expect(d1).toMatchObject({
      official: 'CLOSE',
      changedSinceClose: true,
      close: { expectedCash: 10_000 },
    }); // the close is a snapshot; live figures moved
    expect(d1.live).toMatchObject({
      receiptCount: 3,
      cashReceived: 7000,
      expectedCash: 7000,
    });
    const now = (await get(`/reports/daily?date=${today()}`).expect(200)).body
      .data;
    expect(now.live.cashPaidOut).toEqual({
      refunds: 0,
      reversals: 3000,
      total: 3000,
    }); // the cash went back out today
    expect(now.live.expectedCash).toBe(-3000);
  });

  it('reopens a day with a reason, closes it again as version 2, and keeps both closes', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const opened = await reopen(closeV1).expect(200);
    expect(opened.body.data).toMatchObject({
      id: closeV1,
      status: 'REOPENED',
      reopen: {
        reopenedBy: 'E2E principal',
        reason: 'Found a receipt that was entered on the wrong day',
      },
    });
    await reopen(closeV1).expect(409);
    expect(
      (await get(`/day-closes/pending?from=${D1}&to=${D1}`).expect(200)).body
        .data,
    ).toEqual([
      expect.objectContaining({ date: D1, payments: 3, total: 11_000 }),
    ]);

    const p = (await get(`/day-closes/preview?date=${D1}`).expect(200)).body
      .data;
    expect(p).toMatchObject({ closed: false, canClose: true });
    expect(p.figures).toMatchObject({
      receiptCount: 3,
      cashReceived: 7000,
      expectedCash: 7000,
    });
    const second = await close(
      dayBody(D1, 7000, 3, [
        ['acc', 5000],
        ['acc2', 2000],
      ]),
    ).expect(201);
    closeV2 = second.body.data.id;
    expect(second.body.data).toMatchObject({
      version: 2,
      variance: 0,
      status: 'ACTIVE',
      note: null,
    }); // no difference, so no note is needed

    const history = (await get(`/reports/daily?date=${D1}`).expect(200)).body
      .data;
    expect(
      history.history.map((h: { version: number; status: string }) => [
        h.version,
        h.status,
      ]),
    ).toEqual([
      [1, 'REOPENED'],
      [2, 'ACTIVE'],
    ]);
    expect(history).toMatchObject({
      official: 'CLOSE',
      changedSinceClose: false,
      close: { id: closeV2 },
    });
    const listed = (await get(`/day-closes?from=${D1}&to=${D1}`).expect(200))
      .body;
    expect(listed.meta.total).toBe(2);
    expect(listed.data.map((c: { version: number }) => c.version)).toEqual([
      2, 1,
    ]);
    expect(
      (await get(`/day-closes?from=${D1}&to=${D1}&status=ACTIVE`).expect(200))
        .body.meta.total,
    ).toBe(1);
    expect(
      (await get(`/day-closes?from=${D1}&to=${D1}&status=REOPENED`).expect(200))
        .body.data[0].id,
    ).toBe(closeV1);
    await get('/day-closes?status=WRONG').expect(400);
  });

  it('is protected in the database even when the application is bypassed', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const base = (over: object = {}) => ({
      date: date(D1),
      version: 3,
      expectedCash: 0,
      countedCash: 0,
      cashPaidOut: 0,
      variance: 0,
      receiptCount: 0,
      methodTotals: [],
      closedById: userId.acc,
      ...over,
    });
    await expect(prisma.dayClose.create({ data: base() })).rejects.toThrow(
      /already closed/,
    ); // one active close per date
    await expect(
      prisma.dayClose.create({
        data: base({ date: date(addDays(today(), 1)), version: 1 }),
      }),
    ).rejects.toThrow(/not happened yet/);
    await expect(
      prisma.dayClose.create({
        data: base({ date: date('1990-01-01'), version: 1 }),
      }),
    ).rejects.toThrow(/open fiscal year/);
    await expect(
      prisma.dayClose.create({ data: base({ variance: 5 }) }),
    ).rejects.toThrow(); // variance must equal counted - expected
    await reopen(closeV2).expect(200);
    await expect(
      prisma.dayClose.create({ data: base({ version: 7 }) }),
    ).rejects.toThrow(/version/); // numbered in order
    await expect(
      prisma.dayCloseReopen.delete({ where: { dayCloseId: closeV2 } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.dayClose.delete({ where: { id: closeV2 } }),
    ).rejects.toThrow(/append-only/);
  });

  it("takes today's receipts, closes today, and locks reversals and refunds too", async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const s1 = await pay({
      amount: 6000,
      autoAllocate: { studentIds: [stu.s1] },
    }).expect(201);
    esewa = (
      await pay(
        {
          amount: 5000,
          method: 'ESEWA',
          reference: `ESW-${RUN}-T`,
          allocations: [{ invoiceId: inv.s2[0], amount: 5000 }],
        },
        token.acc2,
      ).expect(201)
    ).body.data.id;
    await pay({
      amount: 2500,
      allocations: [{ invoiceId: inv.s3[0], amount: 2500 }],
    }).expect(201);
    expect(s1.body.data.allocated).toBe(6000);

    // The reversal of the earlier day's 3000 cash payment left today's drawer 3000 lighter.
    const p = (await get(`/day-closes/preview?date=${today()}`).expect(200))
      .body.data;
    expect(p.figures).toMatchObject({
      receiptCount: 3,
      cashReceived: 8500,
      cashPaidOut: { reversals: 3000, total: 3000 },
      expectedCash: 5500,
    });
    expect(
      p.figures.cashiers.map(
        (c: { cashier: { name: string }; cashReceived: number }) => [
          c.cashier.name,
          c.cashReceived,
        ],
      ),
    ).toEqual([['E2E acc', 8500]]); // acc2 took only eSewa: nothing to count
    await close(
      dayBody(today(), 5500, 3, [
        ['acc', 5500],
        ['acc2', 0],
      ]),
    ).expect(400); // acc2 has no count line

    // With cash paid out, the cashier's own difference needs no note: only the day's total matters.
    const done = await close(dayBody(today(), 5500, 3, [['acc', 5500]])).expect(
      201,
    );
    todayClose = done.body.data.id;
    expect(done.body.data).toMatchObject({
      version: 1,
      expectedCash: 5500,
      countedCash: 5500,
      cashPaidOut: 3000,
      variance: 0,
      receiptCount: 3,
    });
    expect(done.body.data.lines[0]).toMatchObject({
      expectedCash: 8500,
      countedCash: 5500,
      variance: -3000,
    });

    expect(
      (
        await pay({
          amount: 100,
          autoAllocate: { studentIds: [stu.s3] },
        }).expect(409)
      ).body.error.message,
    ).toMatch(/closed/);
    expect(
      (
        await post(
          `/payments/${esewa}/reverse`,
          { reason: 'Recorded against the wrong student' },
          token.acc,
        ).expect(409)
      ).body.error.message,
    ).toMatch(/closed/);
    await post(
      `/payments/${pay1.bank4000}/refund`,
      {
        amount: 500,
        method: 'CASH',
        reason: 'Parent asked for a refund in writing',
      },
      token.principal,
    ).expect(409);
    await expect(
      prisma.paymentReversal.create({
        data: {
          paymentId: esewa,
          reason: 'Raw reversal while the day is closed',
          reversedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/closed/);
    await expect(
      prisma.creditRefund.create({
        data: {
          paymentId: pay1.bank4000,
          amount: 10,
          method: 'CASH',
          reason: 'Raw refund while the day is closed',
          approvedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/closed/);
    await post(
      '/credit/apply',
      {
        studentId: stu.s2,
        allocations: [{ invoiceId: inv.s2[1], amount: 100 }],
      },
      token.acc,
    ).expect(200); // applying credit moves no cash
  });

  it('counts a refund as cash paid out once the day is reopened, and closes it again', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    await reopen(todayClose).expect(200);
    const refund = await post(
      `/payments/${pay1.bank4000}/refund`,
      {
        amount: 500,
        method: 'CASH',
        reason: 'Parent asked for a refund in writing',
      },
      token.principal,
    ).expect(200);
    expect(refund.body.data.refunded).toBe(500);

    const p = (await get(`/day-closes/preview?date=${today()}`).expect(200))
      .body.data;
    expect(p.figures.cashPaidOut).toEqual({
      refunds: 500,
      reversals: 3000,
      total: 3500,
    });
    expect(p.figures.expectedCash).toBe(5000);
    const again = await close(
      dayBody(today(), 5000, 3, [['acc', 5000]]),
    ).expect(201);
    expect(again.body.data).toMatchObject({
      version: 2,
      variance: 0,
      cashPaidOut: 3500,
    });
    expect(
      (
        await get(`/reports/daily?date=${today()}`).expect(200)
      ).body.data.history.map((h: { version: number }) => h.version),
    ).toEqual([1, 2]);
    await reopen(again.body.data.id as string).expect(200); // leave today open for the rest of the run
  });

  it('reports collections by day, cashier, method, class and billing period, and the parts add up', async ({
    skip,
  }) => {
    if (blocked || !hasD1) skip();
    const r = (
      await get(`/reports/collections?from=${D1}&to=${today()}`).expect(200)
    ).body.data;
    expect(r.range).toMatchObject({ from: D1, to: today() });
    expect(r.totals).toEqual({
      collected: 24_500,
      payments: 6,
      cash: 15_500,
      nonCash: 9000,
      advanceCredit: 11_000,
    });
    expect(
      r.byDay.map((d: { date: string; amount: number; payments: number }) => [
        d.date,
        d.amount,
        d.payments,
      ]),
    ).toEqual([
      [D1, 11_000, 3],
      [today(), 13_500, 3],
    ]);
    expect(
      r.byCashier.map(
        (c: {
          name: string;
          amount: number;
          cash: number;
          nonCash: number;
          payments: number;
        }) => [c.name, c.amount, c.cash, c.nonCash, c.payments],
      ),
    ).toEqual([
      ['E2E acc', 17_500, 13_500, 4000, 4],
      ['E2E acc2', 7000, 2000, 5000, 2],
    ]);
    expect(
      r.byMethod.map(
        (m: { method: string; amount: number; payments: number }) => [
          m.method,
          m.amount,
          m.payments,
        ],
      ),
    ).toEqual(
      [
        ['CASH', 15_500, 4],
        ['BANK_TRANSFER', 4000, 1],
        ['ESEWA', 5000, 1],
      ].sort((a, b) => (b[1] as number) - (a[1] as number)),
    );
    expect(
      r.byClass.map((c: { name: string; amount: number }) => [
        c.name,
        c.amount,
      ]),
    ).toEqual([
      [`${PFX}-${RUN}-C`, 13_500],
      ['Advance credit (not yet applied)', 11_000],
    ]);
    expect(
      r.byPeriod.map((p: { name: string; amount: number }) => [
        p.name,
        p.amount,
      ]),
    ).toEqual([
      [periods[0]?.name, 12_500],
      [periods[1]?.name, 1000],
      ['Advance credit (not yet applied)', 11_000],
    ]);
    expect(r.reversed).toEqual({ payments: 1, amount: 3000 }); // left out of every figure above

    // Every breakdown adds up to the same total.
    const sum = (rows: { amount: number }[]): number =>
      rows.reduce((n, x) => n + Math.round(x.amount * 100), 0);
    for (const key of [
      'byDay',
      'byCashier',
      'byMethod',
      'byClass',
      'byPeriod',
    ] as const)
      expect(sum(r[key])).toBe(2_450_000);

    const acc2 = (
      await get(
        `/reports/collections?from=${D1}&to=${today()}&cashierId=${userId.acc2}`,
      ).expect(200)
    ).body.data;
    expect(acc2.totals).toMatchObject({ collected: 7000, payments: 2 });
    expect(
      acc2.byMethod
        .map((m: { method: string; amount: number }) => [m.method, m.amount])
        .sort(),
    ).toEqual([
      ['CASH', 2000],
      ['ESEWA', 5000],
    ]);
    const web = (
      await get(`/reports/collections?from=${today()}&method=ESEWA`).expect(200)
    ).body.data;
    expect(web.totals).toMatchObject({
      collected: 5000,
      payments: 1,
      advanceCredit: 0,
    });
    expect(web.byPeriod.map((p: { amount: number }) => p.amount)).toEqual([
      5000,
    ]);
    const one = (await get('/reports/collections').expect(200)).body.data; // default: today only
    expect(one.range).toMatchObject({ from: today(), to: today() });
    expect(one.totals.collected).toBe(13_500);
    expect(
      (
        await get(
          `/reports/collections?from=${today()}&to=${today()}&fiscalYearId=${randomUUID()}`,
        ).expect(200)
      ).body.data.totals.collected,
    ).toBe(0);
    await get(`/reports/collections?from=${today()}&to=${D1}`).expect(400);
    await get('/reports/collections?from=2020-01-01&to=2022-01-01').expect(400); // more than a year
    await get('/reports/collections?method=GIFT').expect(400);
    await get('/reports/collections?from=2026-13-40').expect(400);
  });

  it('writes only numbers to the audit log', async ({ skip }) => {
    if (blocked || !hasD1) skip();
    const logs = await prisma.auditLog.findMany({
      where: { action: { in: ['day.closed', 'day.reopened'] } },
      select: { details: true },
    });
    expect(logs.length).toBeGreaterThanOrEqual(6);
    const text = JSON.stringify(logs);
    for (const secret of [SHORT, 'torn note', 'wrong day', PFX, 'Rai'])
      expect(text).not.toContain(secret);
  });

  it('refuses to close or reopen inside a closed fiscal year', async ({
    skip,
  }) => {
    if (blocked || !hasD1 || !createdFiscalYear) skip(); // only a fiscal year created by this test may be closed
    await prisma.fiscalYear.update({
      where: { id: fiscalYearId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    try {
      expect(
        (await close(dayBody(D1, 0, 0, [])).expect(409)).body.error.message,
      ).toMatch(/closed/);
      await reopen(closeV2).expect(409);
      expect(
        (
          await get(`/day-closes/preview?date=${D1}`).expect(200)
        ).body.data.problems.join(' '),
      ).toMatch(/closed/);
    } finally {
      await prisma.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { status: 'OPEN', closedAt: null },
      });
    }
  });
});
