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

const PFX = 'E2E-PAY';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-pay-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const seq = (receiptNo: string): number => Number(receiptNo.slice(-6));

type Who =
  | 'setup'
  | 'cashier'
  | 'cashier2'
  | 'clerk'
  | 'backdater'
  | 'principal'
  | 'reader'
  | 'plain';
type S = 's1' | 's2' | 's3' | 's4';
const STUDENTS: S[] = ['s1', 's2', 's3', 's4'];

describe('Payments, receipts and allocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let fiscalLabel = '';
  let fiscalStart = '';
  let createdFiscalYear = false;
  let yearA = '';
  let classId = '';
  let guardianId = '';
  const stu = {} as Record<S, string>;
  const adm = {} as Record<S, string>;
  /** The three invoices of each student, oldest due date first. */
  const inv = {} as Record<S, string[]>;
  let rawCount = 0;
  let baseSeq = 0;
  let keptReceipts = 0;

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
  const auto = (
    amount: number,
    ids: S[],
    extra: object = {},
    t = token.cashier,
  ) =>
    pay(
      {
        amount,
        autoAllocate: { studentIds: ids.map((s) => stu[s]) },
        ...extra,
      },
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
  const rawPayment = (amount: number) =>
    prisma.payment.create({
      data: {
        receiptNo: `RAW-${RUN}-${++rawCount}`,
        fiscalYearId,
        paidOn: date(today()),
        method: 'CASH',
        amount,
        receivedById: userId.cashier,
        idempotencyKey: `raw-${RUN}-${rawCount}-xxxx`,
      },
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
    const users = await prisma.user.findMany({
      where: { email: { startsWith: 'e2e-pay-' } },
      select: { id: true },
    });
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
        const payments = (
          await tx.payment.findMany({
            where: {
              OR: [
                { receivedById: { in: users.map((u) => u.id) } },
                { receiptNo: { startsWith: `RAW-${RUN}` } },
              ],
            },
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
      where: { email: { startsWith: 'e2e-pay-' } },
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
      fiscalLabel = covering.label;
      fiscalStart = covering.startDate.toISOString().slice(0, 10);
    } else {
      try {
        fiscalStart = addDays(today(), -100);
        const created = await prisma.fiscalYear.create({
          data: {
            label: `${PFX}-${RUN}-FY`,
            startDate: date(fiscalStart),
            endDate: date(addDays(fiscalStart, 364)),
          },
        });
        fiscalYearId = created.id;
        fiscalLabel = created.label;
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
      ['fees', 'adjust'],
    ]);
    await makeUser('cashier2', [
      ['fees', 'read'],
      ['fees', 'payment-record'],
      ['fees', 'adjust'],
    ]);
    await makeUser('clerk', [
      ['fees', 'read'],
      ['fees', 'payment-record'],
    ]);
    await makeUser('backdater', [
      ['fees', 'read'],
      ['fees', 'payment-record'],
      ['fees', 'payment-backdate'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'invoice-void'],
      ['fees', 'adjust-approve'],
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

    guardianId = (
      await prisma.guardian.create({
        data: { firstName: `${PFX}-G`, phone: `+97798${TAIL.slice(0, 8)}` },
      })
    ).id;
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
                    { guardianId, relationship: 'FATHER', isPrimary: true },
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
    }
    baseSeq = await counter();
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-pay-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('lets only cashiers record payments', async ({ skip }) => {
    if (blocked) skip();
    await http().post(`${V1}/payments`).send({}).expect(401);
    for (const t of [token.plain, token.reader, token.principal])
      await auto(100, ['s1'], {}, t).expect(403);
    await get('/payments', token.plain).expect(403);
    await get('/dues?studentIds=' + stu.s1, token.plain).expect(403);
    await get('/payments', token.reader).expect(200);
    await get(`/payments/${randomUUID()}`).expect(404);
  });

  it('validates every payment request', async ({ skip }) => {
    if (blocked) skip();
    const one = [{ invoiceId: inv.s1[0], amount: 100 }];
    await pay({ amount: 100 }).expect(400); // neither allocations nor autoAllocate
    await pay({
      amount: 100,
      allocations: one,
      autoAllocate: { studentIds: [stu.s1] },
    }).expect(400); // both
    await pay({ amount: 100, allocations: one, reference: 'X-1000' }).expect(
      400,
    ); // cash has no reference
    await pay({ amount: 100, allocations: one, method: 'CHEQUE' }).expect(400); // others need one
    await pay({
      amount: 100,
      allocations: one,
      method: 'ESEWA',
      reference: 'a!b',
    }).expect(400);
    await pay({ amount: 100, allocations: one, method: 'GIFT' }).expect(400);
    await pay({ amount: 0, allocations: one }).expect(400);
    await pay({ amount: 10_000_000.01, allocations: one }).expect(400);
    await pay({ amount: 12.345, allocations: one }).expect(400);
    await pay({
      amount: 100,
      allocations: one,
      idempotencyKey: 'not-a-uuid',
    }).expect(400);
    await pay({
      amount: 100,
      allocations: [
        { invoiceId: inv.s1[0], amount: 60 },
        { invoiceId: inv.s1[0], amount: 40 },
      ],
    }).expect(400); // an invoice twice
    await pay({
      amount: 100,
      allocations: [{ invoiceId: inv.s1[0], amount: 150 }],
    }).expect(400); // more than the payment
    await pay({
      amount: 100,
      allocations: one,
      paidOn: addDays(today(), 1),
    }).expect(400);
    await pay({
      amount: 100,
      allocations: one,
      paidOn: today(),
      paidOnBs: '2083-01-01',
    }).expect(400);
    await pay({
      amount: 100,
      allocations: one,
      payerGuardianId: randomUUID(),
    }).expect(400);
    await auto(100, ['s1'], {
      keepExcessAsCredit: { studentId: stu.s1 },
    }).expect(400); // nothing to keep
    await pay({
      amount: 100,
      allocations: [{ invoiceId: randomUUID(), amount: 100 }],
    }).expect(404);
    await pay({
      amount: 100,
      autoAllocate: { studentIds: [randomUUID()] },
    }).expect(404);
    await pay({ amount: 100, autoAllocate: { studentIds: [] } }).expect(400);
    await pay({
      amount: 6000,
      allocations: [{ invoiceId: inv.s1[0], amount: 5001 }],
    }).expect(409); // more than the invoice owes
    await pay({
      amount: 6000,
      allocations: [{ invoiceId: inv.s1[0], amount: 3000 }],
    }).expect(409); // 3000 would be left unapplied
    expect(await counter()).toBe(baseSeq); // no refusal used a receipt number
  });

  it('takes a partial payment, paying the oldest invoice first', async ({
    skip,
  }) => {
    if (blocked) skip();
    const res = await auto(6000, ['s1'], { payerName: 'Hari Rai' }).expect(201);
    const p = res.body.data;
    expect(p).toMatchObject({
      duplicate: false,
      amount: 6000,
      method: 'CASH',
      status: 'ACTIVE',
      allocated: 6000,
      unapplied: 0,
      receivedBy: 'E2E cashier',
      payer: { name: 'Hari Rai', guardianId: null },
    });
    expect(p.receiptNo).toBe(
      `R-${fiscalLabel}-${String(baseSeq + 1).padStart(6, '0')}`,
    );
    expect(
      p.allocations.map((a: { invoice: { id: string }; amount: number }) => [
        a.invoice.id,
        a.amount,
      ]),
    ).toEqual([
      [inv.s1[0], 5000],
      [inv.s1[1], 1000],
    ]);
    expect(p.paidOn).toBe(today());
    expect(await invoice(inv.s1[0])).toMatchObject({
      status: 'PAID',
      paid: 5000,
      outstanding: 0,
    });
    expect(await invoice(inv.s1[1])).toMatchObject({
      status: 'PARTIAL',
      paid: 1000,
      outstanding: 4000,
    });
    expect(await invoice(inv.s1[2])).toMatchObject({
      status: 'OPEN',
      paid: 0,
      outstanding: 5000,
    });
  });

  it('takes one payment for two siblings and finishes a part-paid invoice', async ({
    skip,
  }) => {
    if (blocked) skip();
    const ref = `TXN-${RUN}-1`;
    const res = await pay({
      amount: 9000,
      method: 'BANK_TRANSFER',
      reference: ref.toLowerCase(),
      payerGuardianId: guardianId,
      payerName: 'Hari Rai',
      allocations: [
        { invoiceId: inv.s1[1], amount: 4000 },
        { invoiceId: inv.s2[0], amount: 5000 },
      ],
    }).expect(201);
    const p = res.body.data;
    expect(p).toMatchObject({
      amount: 9000,
      allocated: 9000,
      unapplied: 0,
      reference: ref.toUpperCase(),
      payer: { guardianId },
    }); // the reference is stored in capitals
    expect(
      p.allocations
        .map((a: { student: { admissionNo: string } }) => a.student.admissionNo)
        .sort(),
    ).toEqual([adm.s1, adm.s2]);
    expect(seq(p.receiptNo)).toBe(baseSeq + 2);
    expect(await invoice(inv.s1[1])).toMatchObject({
      status: 'PAID',
      paid: 5000,
      outstanding: 0,
    });
    expect(await invoice(inv.s2[0])).toMatchObject({ status: 'PAID' });
    await pay({
      amount: 100,
      allocations: [{ invoiceId: inv.s3[0], amount: 100 }],
      payerGuardianId: guardianId,
    }).expect(400); // that guardian does not belong to s3
  });

  it('refuses overpayment unless the excess is explicitly kept as advance credit', async ({
    skip,
  }) => {
    if (blocked) skip();
    const refused = await auto(20_000, ['s3']).expect(409);
    expect(refused.body.error.message).toMatch(
      /NPR 5000 is more than these students owe/,
    );
    await auto(20_000, ['s3'], {
      keepExcessAsCredit: { studentId: stu.s1 },
    }).expect(400); // s1 is not one of the students being paid for
    const kept = await auto(20_000, ['s3'], {
      keepExcessAsCredit: { studentId: stu.s3 },
    }).expect(201);
    expect(kept.body.data).toMatchObject({
      amount: 20_000,
      allocated: 15_000,
      unapplied: 5000,
      creditStudentId: stu.s3,
    });
    for (const id of inv.s3)
      expect(await invoice(id)).toMatchObject({
        status: 'PAID',
        outstanding: 0,
      });

    // A pure advance payment with nothing to pay yet.
    const advance = await pay({
      amount: 1000,
      allocations: [],
      keepExcessAsCredit: { studentId: stu.s3 },
    }).expect(201);
    expect(advance.body.data).toMatchObject({
      allocations: [],
      allocated: 0,
      unapplied: 1000,
      creditStudentId: stu.s3,
    });
    await pay({ amount: 1000, allocations: [] }).expect(409); // without the explicit choice it is refused
    keptReceipts += 2;
  });

  it('never records the same payment twice', async ({ skip }) => {
    if (blocked) skip();
    const key = randomUUID();
    const before = await counter();
    const first = await auto(1000, ['s2'], { idempotencyKey: key }).expect(201);
    expect(first.body.data.duplicate).toBe(false);
    const second = await auto(1000, ['s2'], { idempotencyKey: key }).expect(
      201,
    );
    expect(second.body.data).toMatchObject({
      duplicate: true,
      id: first.body.data.id,
      receiptNo: first.body.data.receiptNo,
    });
    expect(await counter()).toBe(before + 1);
    await auto(2000, ['s2'], { idempotencyKey: key }).expect(409); // the same key for a different payment
    await auto(1000, ['s2'], { idempotencyKey: key }, token.cashier2).expect(
      409,
    ); // or by someone else

    const racing = randomUUID();
    const both = await Promise.all([
      auto(500, ['s2'], { idempotencyKey: racing }),
      auto(500, ['s2'], { idempotencyKey: racing }),
    ]);
    expect(both.map((r) => r.status)).toEqual([201, 201]);
    expect(both.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
    expect(new Set(both.map((r) => r.body.data.id)).size).toBe(1);
    expect(
      await prisma.payment.count({ where: { idempotencyKey: racing } }),
    ).toBe(1);
    expect(await counter()).toBe(before + 2);
    expect(await invoice(inv.s2[1])).toMatchObject({
      paid: 1500,
      outstanding: 3500,
      status: 'PARTIAL',
    });
  });

  it('refuses a cheque or transaction reference that was already recorded', async ({
    skip,
  }) => {
    if (blocked) skip();
    const one = (extra: object) =>
      pay({
        amount: 100,
        allocations: [{ invoiceId: inv.s4[1], amount: 100 }],
        ...extra,
      });
    const ref = `ESW-${RUN}-A`;
    const first = await one({ method: 'ESEWA', reference: ref }).expect(201);
    const again = await one({
      method: 'ESEWA',
      reference: ref.toLowerCase(),
    }).expect(409);
    expect(again.body.error.message).toContain(first.body.data.receiptNo);
    await one({ method: 'CHEQUE', reference: ref }).expect(201); // another method may use the same text
    const fresh = `KHL-${RUN}-B`;
    const race = await Promise.all([
      one({ method: 'KHALTI', reference: fresh }),
      one({ method: 'KHALTI', reference: fresh }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]); // two cashiers typing it at once: one wins
    expect(await invoice(inv.s4[1])).toMatchObject({
      paid: 300,
      outstanding: 4700,
    });

    await expect(
      prisma.payment.create({
        data: {
          receiptNo: `RAW-${RUN}-ref`,
          fiscalYearId,
          paidOn: date(today()),
          method: 'ESEWA',
          reference: ref.toUpperCase(),
          amount: 10,
          receivedById: userId.cashier,
          idempotencyKey: `raw-${RUN}-ref-xxxx`,
        },
      }),
    ).rejects.toThrow(/already been recorded/); // and the database says no as well
    keptReceipts += 0;
  });

  it('never lets two cashiers overpay the same invoice', async ({ skip }) => {
    if (blocked) skip();
    const before = await counter();
    const request = (t: string) =>
      pay(
        { amount: 4000, allocations: [{ invoiceId: inv.s4[0], amount: 4000 }] },
        t,
      );
    const race = await Promise.all([
      request(token.cashier),
      request(token.cashier2),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(race.find((r) => r.status === 409)?.body.error.message).toMatch(
      /still owed/,
    );
    expect(await counter()).toBe(before + 1); // the loser used no receipt number
    expect(await invoice(inv.s4[0])).toMatchObject({
      paid: 4000,
      outstanding: 1000,
      status: 'PARTIAL',
    });
  });

  it('protects the money in the database even when the application is bypassed', async ({
    skip,
  }) => {
    if (blocked) skip();
    const alloc = (paymentId: string, invoiceId: string, amount: number) => ({
      paymentId,
      invoiceId,
      amount,
      allocatedById: userId.cashier,
    });
    const big = await rawPayment(9999);
    await expect(
      prisma.paymentAllocation.create({ data: alloc(big.id, inv.s4[0], 2000) }),
    ).rejects.toThrow(/more than the invoice still owes/);
    const small = await rawPayment(1000);
    await expect(
      prisma.$transaction([
        prisma.paymentAllocation.create({
          data: alloc(small.id, inv.s4[0], 600),
        }),
        prisma.paymentAllocation.create({
          data: alloc(small.id, inv.s4[1], 600),
        }),
      ]),
    ).rejects.toThrow(/does not have enough left/);
    expect(
      await prisma.paymentAllocation.count({
        where: { paymentId: { in: [big.id, small.id] } },
      }),
    ).toBe(0);

    const voidRow = await prisma.invoiceVoid.create({
      data: {
        invoiceId: inv.s4[2],
        reason: 'Raw test void of the invoice',
        voidedById: userId.principal,
      },
    });
    await expect(
      prisma.paymentAllocation.create({ data: alloc(big.id, inv.s4[2], 100) }),
    ).rejects.toThrow(/voided invoice cannot be paid/);
    expect(voidRow.invoiceId).toBe(inv.s4[2]);

    const reversed = await rawPayment(500);
    await prisma.paymentReversal.create({
      data: {
        paymentId: reversed.id,
        reason: 'Raw reversal for the test',
        reversedById: userId.principal,
      },
    });
    await expect(
      prisma.paymentAllocation.create({
        data: alloc(reversed.id, inv.s4[0], 100),
      }),
    ).rejects.toThrow(/reversed payment cannot be applied/);

    const first = await prisma.payment.findFirstOrThrow({
      where: { receivedById: userId.cashier, receiptNo: { startsWith: 'R-' } },
    });
    await expect(
      prisma.payment.update({
        where: { id: first.id },
        data: { note: 'changed' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.payment.delete({ where: { id: first.id } }),
    ).rejects.toThrow(/append-only/);
    const row = await prisma.paymentAllocation.findFirstOrThrow({
      where: { paymentId: first.id },
    });
    await expect(
      prisma.paymentAllocation.update({
        where: { id: row.id },
        data: { amount: 1 },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.paymentAllocation.delete({ where: { id: row.id } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.paymentReversal.delete({ where: { paymentId: reversed.id } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.payment.create({
        data: {
          receiptNo: `RAW-${RUN}-cash`,
          fiscalYearId,
          paidOn: date(today()),
          method: 'CASH',
          reference: 'X-1000',
          amount: 10,
          receivedById: userId.cashier,
          idempotencyKey: `raw-${RUN}-cash-xxx`,
        },
      }),
    ).rejects.toThrow(); // cash with a reference
  });

  it('cannot void an invoice that has been paid', async ({ skip }) => {
    if (blocked) skip();
    const refused = await post(
      `/invoices/${inv.s1[0]}/void`,
      { reason: 'Issued to the wrong student by mistake' },
      token.principal,
    ).expect(409);
    expect(refused.body.error.message).toMatch(/Payments have been applied/);
    await expect(
      prisma.invoiceVoid.create({
        data: {
          invoiceId: inv.s1[0],
          reason: 'Raw void of a paid invoice',
          voidedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/payments applied/);
  });

  it('caps credit notes by what is still owed after payments', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = `/invoices/${inv.s4[0]}/adjustments`;
    const tooMuch = await post(
      url,
      {
        kind: 'WAIVER',
        amount: 1500,
        reason: 'Hardship waiver approved by the committee',
      },
      token.cashier2,
    ).expect(400);
    expect(tooMuch.body.error.message).toMatch(/NPR 1000 still owed/);
    const note = await post(
      url,
      {
        kind: 'WAIVER',
        amount: 1000,
        reason: 'Hardship waiver approved by the committee',
      },
      token.cashier2,
    ).expect(201);
    await post(
      `/adjustments/${note.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(200);
    expect(await invoice(inv.s4[0])).toMatchObject({
      status: 'PAID',
      paid: 4000,
      adjusted: 1000,
      outstanding: 0,
    });
    await pay({
      amount: 1,
      allocations: [{ invoiceId: inv.s4[0], amount: 1 }],
    }).expect(409); // nothing left to pay
  });

  it('shows what a family owes, oldest first', async ({ skip }) => {
    if (blocked) skip();
    const res = await get(`/dues?studentIds=${stu.s1},${stu.s2}`).expect(200);
    const d = res.body.data;
    const s1 = d.students.find(
      (s: { student: { id: string } }) => s.student.id === stu.s1,
    );
    const s2 = d.students.find(
      (s: { student: { id: string } }) => s.student.id === stu.s2,
    );
    expect(s1).toMatchObject({
      outstanding: 5000,
      student: {
        admissionNo: adm.s1,
        className: `${PFX}-${RUN}-C`,
        sectionName: 'A',
      },
    });
    expect(
      s1.invoices.map((i: { id: string; outstanding: number }) => [
        i.id,
        i.outstanding,
      ]),
    ).toEqual([[inv.s1[2], 5000]]);
    expect(
      s2.invoices.map(
        (i: { id: string; outstanding: number; paid: number }) => [
          i.id,
          i.outstanding,
          i.paid,
        ],
      ),
    ).toEqual([
      [inv.s2[1], 3500, 1500],
      [inv.s2[2], 5000, 0],
    ]);
    expect(d.totalOutstanding).toBe(13_500);
    expect(s1.invoices[0].overdue).toBe(true); // the 2005 due dates are long past
    await get(`/dues?studentIds=${randomUUID()}`).expect(404);
    await get('/dues').expect(400);
    await get(
      `/dues?studentIds=${Array.from({ length: 11 }, () => randomUUID()).join(',')}`,
    ).expect(400);
    await get('/dues?studentIds=not-a-uuid').expect(400);
  });

  it('lists payments with filters and shows a receipt', async ({ skip }) => {
    if (blocked) skip();
    const bank = (
      await get('/payments?method=BANK_TRANSFER&pageSize=100').expect(200)
    ).body.data as { amount: number; reference: string }[];
    expect(
      bank.some((p) => p.amount === 9000 && p.reference === `TXN-${RUN}-1`),
    ).toBe(true);
    const ofS2 = (
      await get(`/payments?studentId=${stu.s2}&pageSize=100`).expect(200)
    ).body.data as { amount: number }[];
    expect(ofS2.map((p) => p.amount).sort((a, b) => a - b)).toEqual([
      500, 1000, 9000,
    ]);
    const ofS3 = (
      await get(`/payments?studentId=${stu.s3}&pageSize=100`).expect(200)
    ).body.data as { unapplied: number }[];
    expect(ofS3.map((p) => p.unapplied).sort()).toEqual([1000, 5000]); // holders of advance credit show up too
    const byReceipt = await get(
      `/payments?search=${fiscalLabel}-${String(baseSeq + 1).padStart(6, '0')}`,
    ).expect(200);
    expect(byReceipt.body.meta.total).toBe(1);
    expect(
      (await get(`/payments?search=ESW-${RUN}`).expect(200)).body.meta.total,
    ).toBe(2);
    expect(
      (
        await get(`/payments?receivedById=${userId.cashier2}`).expect(200)
      ).body.data.every(
        (p: { receivedBy: string }) => p.receivedBy === 'E2E cashier2',
      ),
    ).toBe(true);
    expect(
      (
        await get(
          `/payments?reversed=true&fiscalYearId=${fiscalYearId}&from=${today()}&to=${today()}`,
        ).expect(200)
      ).body.data.every((p: { status: string }) => p.status === 'REVERSED'),
    ).toBe(true);
    expect(
      (
        await get(
          `/payments?reversed=false&fiscalYearId=${fiscalYearId}&pageSize=1`,
        ).expect(200)
      ).body.data,
    ).toHaveLength(1);
    await get('/payments?method=GIFT').expect(400);
    await get('/payments?pageSize=1000').expect(400);
    await get('/payments?from=2026-13-40').expect(400);

    const one = (
      await get(
        `/payments/${(await prisma.payment.findFirstOrThrow({ where: { amount: 9000, receivedById: userId.cashier } })).id}`,
      ).expect(200)
    ).body.data;
    expect(one).toMatchObject({
      method: 'BANK_TRANSFER',
      fiscalYear: { label: fiscalLabel },
      reversal: null,
    });
    expect(one.paidOnBs).toEqual(expect.any(String));
  });

  it('handles dates: backdating needs permission and a reason, and cannot pay later invoices', async ({
    skip,
  }) => {
    if (blocked) skip();
    const yesterday = addDays(today(), -1);
    const advance = (extra: object, t: string) =>
      pay(
        {
          amount: 100,
          allocations: [],
          keepExcessAsCredit: { studentId: stu.s3 },
          ...extra,
        },
        t,
      );
    await advance({ paidOn: yesterday }, token.clerk).expect(403); // no permission
    await advance({ paidOn: yesterday }, token.backdater).expect(400); // no note
    await advance(
      { paidOn: yesterday, note: 'too short' },
      token.backdater,
    ).expect(400);
    if (fiscalStart < today()) {
      const ok = await advance(
        { paidOn: yesterday, note: 'Receipt book entry from the previous day' },
        token.backdater,
      ).expect(201);
      expect(ok.body.data).toMatchObject({ paidOn: yesterday, unapplied: 100 });
      keptReceipts += 1;
      const late = await pay(
        {
          amount: 100,
          allocations: [{ invoiceId: inv.s1[2], amount: 100 }],
          paidOn: yesterday,
          note: 'Receipt book entry from the previous day',
        },
        token.backdater,
      ).expect(409);
      expect(late.body.error.message).toMatch(/issued after/);
    }
  });

  it('refuses payments once the fiscal year is closed', async ({ skip }) => {
    if (blocked) skip();
    if (!createdFiscalYear) skip(); // only a fiscal year created by this test may be closed
    await prisma.fiscalYear.update({
      where: { id: fiscalYearId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    try {
      expect((await auto(100, ['s1']).expect(409)).body.error.message).toMatch(
        /closed/,
      );
    } finally {
      await prisma.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { status: 'OPEN', closedAt: null },
      });
    }
  });

  it('numbers receipts without gaps and logs only numbers', async ({
    skip,
  }) => {
    if (blocked) skip();
    const receipts = await prisma.payment.findMany({
      where: {
        fiscalYearId,
        receiptNo: { startsWith: `R-${fiscalLabel}-` },
        receivedById: { in: Object.values(userId) },
      },
      select: { receiptNo: true },
    });
    const numbers = receipts.map((r) => seq(r.receiptNo)).sort((a, b) => a - b);
    expect(numbers).toEqual(
      Array.from({ length: numbers.length }, (_, i) => baseSeq + 1 + i),
    ); // consecutive: no gaps
    expect(await counter()).toBe(baseSeq + numbers.length);
    expect(numbers.length).toBeGreaterThanOrEqual(
      9 + keptReceipts - keptReceipts,
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'payment.recorded', entityType: 'payment' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.details).toMatchObject({
      method: 'CASH',
      amount: 6000,
      invoices: 2,
      credit: 0,
    });
    const text = JSON.stringify(
      await prisma.auditLog.findMany({
        where: { action: 'payment.recorded' },
        select: { details: true },
      }),
    );
    for (const secret of [
      'Hari Rai',
      `TXN-${RUN}`,
      `ESW-${RUN}`,
      'Receipt book entry',
      PFX,
    ])
      expect(text).not.toContain(secret);
  });
});
