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

const PFX = 'E2E-DUE';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-due-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const seq = (n: string): number => Number(n.slice(-6));
const OFFSETS = [-100, -75, -45, -10, 20]; // due dates of the five periods, relative to today

type Who = 'setup' | 'acc' | 'principal' | 'reader' | 'reporter' | 'plain';
type S = 's1' | 's2' | 's3' | 's4';
const STUDENTS: S[] = ['s1', 's2', 's3', 's4'];

describe('Dues, billing and late fines (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let createdFiscalYear = false;
  let yearA = '';
  let yearB = '';
  const cls = { C1: '', C2: '' };
  const sec = { C1A: '', C1B: '', C2A: '' };
  const head = { TUI: '', LAB: '', FIN: '' };
  let periods: { id: string; name: string }[] = [];
  const stu = {} as Record<S, string>;
  const enr = {} as Record<S, string>;
  const adm = {} as Record<S, string>;
  const inv = {} as Record<S, string[]>; // p1..p5, oldest due date first

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.reporter) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const ids = (list: S[]): string[] => list.map((s) => stu[s]);
  const dues = async (q = ''): Promise<any> =>
    (await get(`/reports/dues?academicYearId=${yearA}${q}`).expect(200)).body
      .data;
  const studentRows = async (q = ''): Promise<any> =>
    (
      await get(`/reports/dues/students?academicYearId=${yearA}${q}`).expect(
        200,
      )
    ).body;
  const setPolicy = (body: object) =>
    put(
      '/late-fee-policy',
      {
        enabled: true,
        type: 'FIXED',
        value: 200,
        graceDays: 5,
        minOutstanding: 100,
        appliesFromDueDate: addDays(today(), -120),
        feeHeadId: head.FIN,
        ...body,
      },
      token.principal,
    );
  const preview = (extra: object = {}, list: S[] = STUDENTS) =>
    post('/late-fines/preview', { studentIds: ids(list), ...extra }, token.acc);
  const applyFines = (extra: object = {}, list: S[] = STUDENTS) =>
    post('/late-fines/apply', { studentIds: ids(list), ...extra }, token.acc);
  const counter = async (): Promise<number> =>
    (
      await prisma.sequence.findUnique({
        where: { name: `invoice:${fiscalYearId}` },
      })
    )?.value ?? 0;
  const invoiceView = async (id: string) =>
    (await get(`/invoices/${id}`, token.reader).expect(200)).body.data;

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
        where: { email: { startsWith: 'e2e-due-' } },
        select: { id: true },
      })
    ).map((u) => u.id);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
        const invoiceIds = (
          await tx.invoice.findMany({
            where: { studentId: { in: studentIds } },
            select: { id: true },
          })
        ).map((i) => i.id);
        await tx.lateFine.deleteMany({
          where: {
            OR: [
              { sourceInvoiceId: { in: invoiceIds } },
              { fineInvoiceId: { in: invoiceIds } },
            ],
          },
        });
        await tx.lateFineRun.deleteMany({
          where: { createdById: { in: users } },
        });
        await tx.lateFeePolicy.deleteMany({
          where: { createdById: { in: users } },
        });
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
        await tx.invoiceAdjustmentDecision.deleteMany({
          where: { adjustment: { invoiceId: { in: invoiceIds } } },
        });
        await tx.invoiceAdjustment.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await tx.invoiceVoid.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await tx.invoiceLine.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
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
      where: { email: { startsWith: 'e2e-due-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    if (
      (await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: date('2007-04-13') },
          endDate: { gte: date('2005-04-14') },
        },
      })) !== null
    ) {
      blocked =
        'Skipped: the database already has academic years between 2005 and 2007.';
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
        const start = addDays(today(), -150);
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
    await makeUser('acc', [
      ['fees', 'read'],
      ['fees', 'invoice-generate'],
      ['fees', 'payment-record'],
      ['fees', 'adjust'],
      ['fees', 'reports'],
      ['fees', 'late-fee-apply'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'invoice-void'],
      ['fees', 'adjust-approve'],
      ['fees', 'late-fee-manage'],
      ['fees', 'reports'],
    ]);
    await makeUser('reader', [['fees', 'read']]);
    await makeUser('reporter', [['fees', 'reports']]);
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
    yearB = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-B`,
          startDate: date('2006-04-14'),
          endDate: date('2007-04-13'),
        },
      })
    ).id;
    cls.C1 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C1`, sortOrder: 3 },
      })
    ).id;
    cls.C2 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C2`, sortOrder: 4 },
      })
    ).id;
    sec.C1A = (
      await prisma.section.create({ data: { classId: cls.C1, name: 'A' } })
    ).id;
    sec.C1B = (
      await prisma.section.create({ data: { classId: cls.C1, name: 'B' } })
    ).id;
    sec.C2A = (
      await prisma.section.create({ data: { classId: cls.C2, name: 'A' } })
    ).id;
    const makeHead = async (
      suffix: keyof typeof head,
      frequency: 'MONTHLY' | 'AD_HOC',
    ): Promise<void> => {
      head[suffix] = (
        await prisma.feeHead.create({
          data: {
            code: `T${TAIL}${suffix}`,
            name: `${PFX} ${suffix}`,
            frequency,
          },
        })
      ).id;
    };
    await makeHead('TUI', 'MONTHLY');
    await makeHead('LAB', 'MONTHLY');
    await makeHead('FIN', 'AD_HOC');

    periods = (
      await post(
        `/academic-years/${yearA}/billing-periods/generate`,
        { months: 12 },
        token.setup,
      ).expect(200)
    ).body.data;
    for (const [i, offset] of OFFSETS.entries()) {
      await prisma.billingPeriod.update({
        where: { id: periods[i]?.id as string },
        data: { dueDate: date(addDays(today(), offset)) },
      });
    }
    const five = periods.slice(0, 5).map((p) => p.id);
    await put(
      `/academic-years/${yearA}/classes/${cls.C1}/fee-structure`,
      {
        lines: [
          { feeHeadId: head.TUI, amount: 4000, periodIds: five },
          { feeHeadId: head.LAB, amount: 1000, periodIds: five },
        ],
      },
      token.setup,
    ).expect(200);
    await put(
      `/academic-years/${yearA}/classes/${cls.C2}/fee-structure`,
      { lines: [{ feeHeadId: head.TUI, amount: 3000, periodIds: five }] },
      token.setup,
    ).expect(200);

    const placement: [S, string, 'C1' | 'C2'][] = [
      ['s1', sec.C1A, 'C1'],
      ['s2', sec.C1A, 'C1'],
      ['s3', sec.C1B, 'C1'],
      ['s4', sec.C2A, 'C2'],
    ];
    for (const [index, [key, section, klass]] of placement.entries()) {
      adm[key] = `E2E-${RUN}-${key}`;
      const student = await prisma.student.create({
        data: {
          admissionNo: adm[key],
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
        },
      });
      stu[key] = student.id;
      enr[key] = (
        await prisma.enrollment.create({
          data: {
            studentId: student.id,
            academicYearId: yearA,
            classId: cls[klass],
            sectionId: section,
            rollNo: index + 1,
          },
        })
      ).id;
    }
    for (const p of periods.slice(0, 5)) {
      for (const klass of ['C1', 'C2'] as const)
        await post(
          '/invoices/generate',
          { kind: 'PERIODIC', periodId: p.id, classId: cls[klass] },
          token.acc,
        ).expect(200);
    }
    for (const key of STUDENTS)
      inv[key] = (
        await prisma.invoice.findMany({
          where: { studentId: stu[key] },
          orderBy: { dueDate: 'asc' },
        })
      ).map((r) => r.id);

    // s1 pays 7,500 (the oldest invoice, and half of the next); s2 gets a 1,000 waiver on period 3; s3's last invoice is voided.
    await post(
      '/payments',
      {
        idempotencyKey: randomUUID(),
        amount: 7500,
        method: 'CASH',
        autoAllocate: { studentIds: [stu.s1] },
      },
      token.acc,
    ).expect(201);
    const waiver = await post(
      `/invoices/${inv.s2[2]}/adjustments`,
      {
        kind: 'WAIVER',
        amount: 1000,
        reason: 'Hardship waiver approved by the committee',
      },
      token.acc,
    ).expect(201);
    await post(
      `/adjustments/${waiver.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(200);
    await post(
      `/invoices/${inv.s3[4]}/void`,
      { reason: 'Issued twice by mistake, see ledger' },
      token.principal,
    ).expect(200);
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-due-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('gives each report and action to the right people only', async ({
    skip,
  }) => {
    if (blocked) skip();
    await http().get(`${V1}/reports/dues`).expect(401);
    for (const t of [token.plain, token.reader]) {
      await get('/reports/dues', t).expect(403);
      await get('/reports/dues/students', t).expect(403);
      await get('/reports/billing', t).expect(403);
    }
    await get('/late-fee-policy', token.plain).expect(403);
    await get('/late-fines', token.plain).expect(403);
    await put(
      '/late-fee-policy',
      {
        enabled: true,
        type: 'FIXED',
        value: 200,
        graceDays: 5,
        feeHeadId: head.FIN,
      },
      token.acc,
    ).expect(403); // the principal sets the policy
    await post('/late-fines/preview', {}, token.principal).expect(403); // the accountant applies it
    await post('/late-fines/apply', {}, token.reporter).expect(403);
  });

  it('summarises what is owed by age, class, section and fee head', async ({
    skip,
  }) => {
    if (blocked) skip();
    const r = await dues();
    expect(r.asOf).toBe(today());
    expect(r.asOfBs).toEqual(expect.any(String));
    expect(r.totals).toMatchObject({
      outstanding: 76_500,
      overdue: 63_500,
      notYetDue: 13_000,
      invoices: 18,
      students: 4,
    });
    expect(
      r.totals.buckets.map(
        (b: { key: string; amount: number; invoices: number }) => [
          b.key,
          b.amount,
          b.invoices,
        ],
      ),
    ).toEqual([
      ['CURRENT', 13_000, 3],
      ['D1_30', 18_000, 4],
      ['D31_60', 17_000, 4],
      ['D61_90', 15_500, 4],
      ['D90_PLUS', 13_000, 3],
    ]);
    expect(
      r.byClass.map(
        (c: {
          name: string;
          outstanding: number;
          overdue: number;
          invoices: number;
          students: number;
        }) => [c.name, c.outstanding, c.overdue, c.invoices, c.students],
      ),
    ).toEqual([
      [`${PFX}-${RUN}-C1`, 61_500, 51_500, 13, 3],
      [`${PFX}-${RUN}-C2`, 15_000, 12_000, 5, 1],
    ]);
    expect(
      r.bySection.map(
        (s: {
          className: string;
          name: string;
          outstanding: number;
          invoices: number;
          students: number;
        }) => [s.className, s.name, s.outstanding, s.invoices, s.students],
      ),
    ).toEqual([
      [`${PFX}-${RUN}-C1`, 'A', 41_500, 9, 2],
      [`${PFX}-${RUN}-C1`, 'B', 20_000, 4, 1],
      [`${PFX}-${RUN}-C2`, 'A', 15_000, 5, 1],
    ]);
    // Each invoice's balance is split over its lines in proportion: 4,000 to 1,000 for class 1, all tuition for class 2.
    const tui = r.byFeeHead.find(
      (h: { code: string }) => h.code === `T${TAIL}TUI`,
    );
    const lab = r.byFeeHead.find(
      (h: { code: string }) => h.code === `T${TAIL}LAB`,
    );
    expect(tui).toMatchObject({ outstanding: 64_200, overdue: 53_200 });
    expect(lab).toMatchObject({ outstanding: 12_300, overdue: 10_300 });
    expect(tui.outstanding + lab.outstanding).toBe(r.totals.outstanding);
  });

  it('filters dues by class and section', async ({ skip }) => {
    if (blocked) skip();
    expect((await dues(`&classId=${cls.C2}`)).totals).toMatchObject({
      outstanding: 15_000,
      invoices: 5,
      students: 1,
    });
    expect((await dues(`&sectionId=${sec.C1B}`)).totals).toMatchObject({
      outstanding: 20_000,
      overdue: 20_000,
      students: 1,
    });
    expect(
      (await dues(`&classId=${cls.C1}&sectionId=${sec.C2A}`)).totals,
    ).toMatchObject({ outstanding: 0, invoices: 0 }); // no such combination
    await get('/reports/dues?classId=not-a-uuid').expect(400);
    await get('/reports/dues/students?sort=RANDOM').expect(400);
  });

  it('lists the students who owe money, and always agrees with the invoices', async ({
    skip,
  }) => {
    if (blocked) skip();
    const all = await studentRows();
    expect(all.meta.total).toBe(4);
    expect(
      all.data.map(
        (r: { student: { admissionNo: string }; outstanding: number }) => [
          r.student.admissionNo,
          r.outstanding,
        ],
      ),
    ).toEqual([
      [adm.s2, 24_000],
      [adm.s3, 20_000],
      [adm.s1, 17_500],
      [adm.s4, 15_000],
    ]);
    const s1 = all.data.find(
      (r: { student: { id: string } }) => r.student.id === stu.s1,
    );
    expect(s1).toMatchObject({
      className: `${PFX}-${RUN}-C1`,
      sectionName: 'A',
      outstanding: 17_500,
      overdue: 12_500,
      notYetDue: 5_000,
      invoices: 4,
      daysOverdue: 75,
      oldestDueDate: addDays(today(), -75),
      credit: 0,
      student: { status: 'ACTIVE' },
    });
    expect(s1.buckets).toEqual({
      CURRENT: 5000,
      D1_30: 5000,
      D31_60: 5000,
      D61_90: 2500,
      D90_PLUS: 0,
    });
    expect(s1.oldestDueDateBs).toEqual(expect.any(String));

    expect(
      (await studentRows('&sort=OLDEST')).data.map(
        (r: { student: { admissionNo: string } }) => r.student.admissionNo,
      ),
    ).toEqual([adm.s2, adm.s3, adm.s4, adm.s1]); // 100 days, then by amount
    expect((await studentRows('&sort=NAME')).data).toHaveLength(4);
    expect(
      (await studentRows('&minDaysOverdue=90')).data.map(
        (r: { student: { admissionNo: string } }) => r.student.admissionNo,
      ),
    ).toEqual([adm.s2, adm.s3, adm.s4]);
    expect(
      (await studentRows('&minOutstanding=20000')).data.map(
        (r: { student: { admissionNo: string } }) => r.student.admissionNo,
      ),
    ).toEqual([adm.s2, adm.s3]);
    expect((await studentRows(`&search=${adm.s4}`)).data).toHaveLength(1);
    const page2 = await studentRows('&pageSize=2&page=2');
    expect(
      page2.data.map(
        (r: { student: { admissionNo: string } }) => r.student.admissionNo,
      ),
    ).toEqual([adm.s1, adm.s4]);
    expect(page2.meta).toMatchObject({ page: 2, pageSize: 2, total: 4 });

    // The figures are the same ones the cashier sees.
    const cashier = (
      await get(
        `/dues?studentIds=${ids(STUDENTS).join(',')}`,
        token.acc,
      ).expect(200)
    ).body.data;
    for (const row of cashier.students) {
      expect(row.outstanding).toBe(
        all.data.find(
          (r: { student: { id: string } }) => r.student.id === row.student.id,
        ).outstanding,
      );
    }
    expect(cashier.totalOutstanding).toBe(76_500);
  });

  it('reports what was billed and how much has been collected', async ({
    skip,
  }) => {
    if (blocked) skip();
    const bill = async (q: string) =>
      (await get(`/reports/billing?${q}`).expect(200)).body.data;
    const b = await bill(`academicYearId=${yearA}`);
    expect(b.totals).toMatchObject({
      invoices: 19,
      invoiced: 85_000,
      discounts: 0,
      billed: 85_000,
      creditNotes: 1000,
      collected: 7500,
      outstanding: 76_500,
      collectionRate: 8.9,
      voided: { invoices: 1, amount: 5000 },
    });
    const head = (code: string) =>
      b.byFeeHead.find((h: { code: string }) => h.code === `T${TAIL}${code}`);
    expect(head('TUI')).toMatchObject({
      billed: 71_000,
      creditNotes: 800,
      collected: 6000,
      outstanding: 64_200,
    });
    expect(head('LAB')).toMatchObject({
      billed: 14_000,
      creditNotes: 200,
      collected: 1500,
      outstanding: 12_300,
    }); // the same split as the dues
    expect(
      b.byClass.map(
        (c: {
          name: string;
          billed: number;
          creditNotes: number;
          collected: number;
          outstanding: number;
        }) => [c.name, c.billed, c.creditNotes, c.collected, c.outstanding],
      ),
    ).toEqual([
      [`${PFX}-${RUN}-C1`, 70_000, 1000, 7500, 61_500],
      [`${PFX}-${RUN}-C2`, 15_000, 0, 0, 15_000],
    ]);
    expect(
      b.byPeriod.map(
        (p: {
          name: string;
          billed: number;
          collected: number;
          outstanding: number;
        }) => [p.name, p.billed, p.collected, p.outstanding],
      ),
    ).toEqual([
      [periods[0]?.name, 18_000, 5000, 13_000],
      [periods[1]?.name, 18_000, 2500, 15_500],
      [periods[2]?.name, 18_000, 0, 17_000],
      [periods[3]?.name, 18_000, 0, 18_000],
      [periods[4]?.name, 13_000, 0, 13_000],
    ]);
    expect(b.byKind).toEqual([
      expect.objectContaining({
        kind: 'PERIODIC',
        billed: 85_000,
        invoices: 19,
      }),
    ]);
    const sum = (rows: { billed: number }[]): number =>
      rows.reduce((n, x) => n + Math.round(x.billed * 100), 0);
    for (const key of ['byFeeHead', 'byClass', 'byPeriod', 'byKind'] as const)
      expect(sum(b[key])).toBe(8_500_000); // every breakdown adds up

    expect(
      (await bill(`academicYearId=${yearA}&classId=${cls.C2}`)).totals,
    ).toMatchObject({ billed: 15_000, collected: 0 });
    expect((await bill(`periodId=${periods[2]?.id}`)).totals).toMatchObject({
      billed: 18_000 - 0,
      creditNotes: 1000,
      outstanding: 17_000,
    });
    expect(
      (await bill(`academicYearId=${yearA}&kind=AD_HOC`)).totals,
    ).toMatchObject({ invoices: 0, billed: 0, collectionRate: null });
    expect(
      (await bill(`academicYearId=${yearA}&from=${today()}&to=${today()}`))
        .totals.billed,
    ).toBe(85_000); // everything was issued today
    expect(
      (await bill(`academicYearId=${yearA}&from=${addDays(today(), 1)}`)).totals
        .billed,
    ).toBe(0);
    await get(
      `/reports/billing?from=${today()}&to=${addDays(today(), -1)}`,
    ).expect(400);
    await get('/reports/billing?kind=WRONG').expect(400);
  });

  it('has no late fee policy until the principal sets one, and validates it', async ({
    skip,
  }) => {
    if (blocked) skip();
    const before = (await get('/late-fee-policy', token.reader).expect(200))
      .body.data;
    if (before.policy === null)
      expect((await preview().expect(409)).body.error.message).toMatch(
        /not set up/,
      );

    await setPolicy({ type: 'PERCENT', value: 150 }).expect(400);
    await setPolicy({ value: 0 }).expect(400);
    await setPolicy({ graceDays: 400 }).expect(400);
    await setPolicy({ graceDays: -1 }).expect(400);
    await setPolicy({ minOutstanding: -1 }).expect(400);
    await setPolicy({ maxFine: 0 }).expect(400);
    await setPolicy({ feeHeadId: head.TUI }).expect(400); // a regular fee cannot hold fines
    await setPolicy({ feeHeadId: randomUUID() }).expect(400);
    await setPolicy({ type: 'WEEKLY' }).expect(400);
    await setPolicy({
      appliesFromDueDate: '2026-01-01',
      appliesFromDueDateBs: '2082-09-17',
    }).expect(201 - 201 + 400);

    const off = await setPolicy({ enabled: false }).expect(200);
    expect(off.body.data.policy).toMatchObject({
      enabled: false,
      type: 'FIXED',
      value: 200,
      feeHead: { code: `T${TAIL}FIN` },
      setBy: 'E2E principal',
    });
    expect((await preview().expect(409)).body.error.message).toMatch(
      /switched off/,
    );
    await applyFines().expect(409);
  });

  it('only fines invoices that are overdue past the grace period, big enough, and due on or after the start date', async ({
    skip,
  }) => {
    if (blocked) skip();
    const counts = async (policy: object) => {
      await setPolicy(policy).expect(200);
      const p = (await preview().expect(200)).body.data;
      return { count: p.count, total: p.total };
    };
    expect(await counts({})).toEqual({ count: 15, total: 3000 }); // s1: 3 (period 1 is paid), s2: 4, s3: 4, s4: 4
    expect(await counts({ graceDays: 50 })).toEqual({ count: 7, total: 1400 }); // only the invoices over 50 days late
    expect(await counts({ appliesFromDueDate: addDays(today(), -50) })).toEqual(
      { count: 8, total: 1600 },
    ); // history before the start date is never fined
    expect(await counts({ minOutstanding: 4500 })).toEqual({
      count: 9,
      total: 1800,
    }); // balances under 4,500 are left alone
    expect(await counts({ fineAdmission: true })).toEqual({
      count: 15,
      total: 3000,
    }); // none of these are admission invoices
    await setPolicy({}).expect(200);

    // Voided, paid and not-yet-due invoices are never candidates.
    const p = (await preview().expect(200)).body.data;
    const numbers = new Set(
      p.candidates.map((c: { invoiceId: string }) => c.invoiceId),
    );
    expect(numbers.has(inv.s1[0])).toBe(false); // paid
    expect(numbers.has(inv.s3[4])).toBe(false); // voided
    for (const key of STUDENTS) expect(numbers.has(inv[key][4])).toBe(false); // due in the future
    expect(
      p.candidates.every((c: { daysOverdue: number }) => c.daysOverdue > 5),
    ).toBe(true);
    expect(p).toMatchObject({
      asOf: today(),
      policy: { type: 'FIXED', value: 200 },
      skipped: [],
      skippedSummary: {},
      truncated: false,
    });
  });

  it('calculates percentage fines on what is unpaid, with a cap', async ({
    skip,
  }) => {
    if (blocked) skip();
    await setPolicy({ type: 'PERCENT', value: 2.5, maxFine: 100 }).expect(200);
    const p = (await preview().expect(200)).body.data;
    expect(p).toMatchObject({ count: 15, total: 1362.5 });
    const fine = (id: string) =>
      p.candidates.find((c: { invoiceId: string }) => c.invoiceId === id);
    expect(fine(inv.s1[1])).toMatchObject({
      base: 2500,
      fine: 62.5,
      daysOverdue: 75,
    }); // 2.5% of the 2,500 still unpaid
    expect(fine(inv.s1[2])).toMatchObject({ base: 5000, fine: 100 }); // 125 capped at 100
    expect(fine(inv.s2[2])).toMatchObject({ base: 4000, fine: 100 }); // exactly 100
    expect(fine(inv.s4[0])).toMatchObject({
      base: 3000,
      fine: 75,
      student: { admissionNo: adm.s4, className: `${PFX}-${RUN}-C2` },
    });
    expect(fine(inv.s1[3]).period).toBe(periods[3]?.name);
    const before = await counter();
    await preview().expect(200);
    expect(await counter()).toBe(before); // a preview uses no invoice numbers
  });

  it('leaves out students who have left, and lands fines on the current year when the old year is closed', async ({
    skip,
  }) => {
    if (blocked) skip();
    await setPolicy({}).expect(200);
    await prisma.enrollment.update({
      where: { id: enr.s3 },
      data: { status: 'WITHDRAWN', statusChangedOn: date('2005-09-01') },
    });
    const gone = (await preview({}, ['s3']).expect(200)).body.data;
    expect(gone).toMatchObject({
      count: 0,
      total: 0,
      skippedSummary: { NO_CURRENT_ENROLLMENT: 4 },
    }); // nowhere to charge them
    await prisma.enrollment.update({
      where: { id: enr.s3 },
      data: { status: 'ENROLLED', statusChangedOn: null },
    });

    // The old academic year closes; s2 has moved on to the next one, s1 has not.
    const next = await prisma.enrollment.create({
      data: {
        studentId: stu.s2,
        academicYearId: yearB,
        classId: cls.C1,
        sectionId: sec.C1A,
        rollNo: 5,
      },
    });
    await prisma.academicYear.update({
      where: { id: yearA },
      data: { status: 'CLOSED' },
    });
    try {
      const p = (await preview({}, ['s1', 's2']).expect(200)).body.data;
      expect(p.skippedSummary).toEqual({ NO_CURRENT_ENROLLMENT: 3 }); // s1 has no open enrollment to charge
      const s2 = p.candidates.filter(
        (c: { student: { admissionNo: string } }) =>
          c.student.admissionNo === adm.s2,
      );
      expect(s2).toHaveLength(4);
      for (const c of s2)
        expect(c).toMatchObject({
          targetEnrollmentId: next.id,
          targetAcademicYearId: yearB,
        }); // charged where the student is now
    } finally {
      await prisma.academicYear.update({
        where: { id: yearA },
        data: { status: 'PLANNED' },
      });
      await prisma.enrollment.delete({ where: { id: next.id } });
    }
  });

  it('applies fines as ordinary ad-hoc invoices, refusing a run whose figures moved', async ({
    skip,
  }) => {
    if (blocked) skip();
    await setPolicy({ type: 'PERCENT', value: 2.5, maxFine: 100 }).expect(200);
    const stale = await applyFines({ expect: { count: 3, total: 300 } }, [
      's4',
    ]).expect(409);
    expect(stale.body.error.message).toMatch(/figures changed/);
    expect(
      await prisma.lateFine.count({
        where: { sourceInvoiceId: { in: inv.s4 } },
      }),
    ).toBe(0);

    const before = await counter();
    const res = await applyFines({ expect: { count: 4, total: 300 } }, [
      's4',
    ]).expect(200);
    expect(res.body.data).toMatchObject({
      created: 4,
      total: 300,
      chunks: 1,
      skippedSummary: {},
    });
    expect(res.body.data.runId).toEqual(expect.any(String));

    const rows = await prisma.lateFine.findMany({
      where: { sourceInvoiceId: { in: inv.s4 } },
      orderBy: { daysOverdue: 'desc' },
      include: {
        sourceInvoice: true,
        fineInvoice: { include: { lines: true } },
      },
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.daysOverdue)).toEqual([100, 75, 45, 10]);
    for (const r of rows) {
      expect(r.amount.toNumber()).toBe(75);
      expect(r.baseAmount.toNumber()).toBe(3000);
      expect(r.runId).toBe(res.body.data.runId);
      expect(r.fineInvoice).toMatchObject({
        kind: 'AD_HOC',
        periodId: null,
        enrollmentId: enr.s4,
        studentId: stu.s4,
        revision: 1,
        createdById: userId.acc,
        requestKey: `latefine:${r.sourceInvoiceId}`,
      });
      expect(r.fineInvoice.description).toBe(
        `Late fine for ${r.sourceInvoice.number}`,
      );
      expect(r.fineInvoice.dueDate.toISOString().slice(0, 10)).toBe(today());
      expect(r.fineInvoice.netAmount.toNumber()).toBe(75);
      expect(r.fineInvoice.lines).toHaveLength(1);
      expect(r.fineInvoice.lines[0]).toMatchObject({
        feeHeadId: head.FIN,
        source: 'MANUAL',
      });
    }
    const numbers = rows
      .map((r) => seq(r.fineInvoice.number))
      .sort((a, b) => a - b);
    expect(numbers).toEqual([before + 1, before + 2, before + 3, before + 4]); // consecutive invoice numbers
    expect(res.body.data.firstNumber).toBe(
      rows.find((r) => seq(r.fineInvoice.number) === before + 1)?.fineInvoice
        .number,
    );
  });

  it('fines each invoice only once, even when the policy changes', async ({
    skip,
  }) => {
    if (blocked) skip();
    await setPolicy({}).expect(200); // a fixed 200 now
    const p = (await preview().expect(200)).body.data;
    expect(p).toMatchObject({
      count: 11,
      total: 2200,
      skippedSummary: { ALREADY_FINED: 4 },
    }); // s4's invoices already carry a fine
    const res = await applyFines({ expect: { count: 11, total: 2200 } }).expect(
      200,
    );
    expect(res.body.data).toMatchObject({
      created: 11,
      total: 2200,
      skippedSummary: { ALREADY_FINED: 4 },
    });

    const again = (await applyFines().expect(200)).body.data;
    expect(again).toMatchObject({
      created: 0,
      total: 0,
      runId: null,
      firstNumber: null,
      skippedSummary: { ALREADY_FINED: 15 },
    });
    expect((await preview().expect(200)).body.data).toMatchObject({
      count: 0,
      skippedSummary: { ALREADY_FINED: 15 },
    }); // a fine is never itself fined
    expect(
      await prisma.lateFine.count({
        where: { sourceInvoiceId: { in: STUDENTS.flatMap((s) => inv[s]) } },
      }),
    ).toBe(15);

    // Two accountants pressing the button at the same moment still produce one fine per invoice.
    const race = await Promise.all([
      applyFines({}, ['s1']),
      applyFines({}, ['s1']),
    ]);
    expect(race.map((r) => r.status)).toEqual([200, 200]);
    expect(race.reduce((n, r) => n + (r.body.data.created as number), 0)).toBe(
      0,
    );
  });

  it('lists what was applied, and shows the fines among what is owed', async ({
    skip,
  }) => {
    if (blocked) skip();
    const list = (
      await get(`/late-fines?studentId=${stu.s1}`, token.reader).expect(200)
    ).body;
    expect(list.meta.total).toBe(3);
    expect(list.data[0]).toMatchObject({
      amount: 200,
      base: expect.any(Number),
      student: { admissionNo: adm.s1 },
      className: `${PFX}-${RUN}-C1`,
      fineInvoice: { status: 'OPEN', outstanding: 200 },
    });
    expect(
      (await get(`/late-fines?classId=${cls.C2}`, token.reader).expect(200))
        .body.meta.total,
    ).toBe(4);
    const runs = (await get('/late-fines/runs', token.reader).expect(200)).body
      .data as {
      fines: number;
      total: number;
      policy: { type: string };
      appliedBy: string;
    }[];
    const ours = runs.filter((r) => r.appliedBy === 'E2E acc');
    expect(ours.map((r) => [r.fines, r.total, r.policy.type]).sort()).toEqual(
      [
        [11, 2200, 'FIXED'],
        [4, 300, 'PERCENT'],
      ].sort(),
    );
    await get('/late-fines?runId=not-a-uuid', token.reader).expect(400);

    const r = await dues();
    expect(r.totals).toMatchObject({
      outstanding: 79_000,
      overdue: 63_500,
      notYetDue: 15_500,
      invoices: 33,
    }); // fines are due today: not overdue yet
    expect(
      r.byFeeHead.find((h: { code: string }) => h.code === `T${TAIL}FIN`),
    ).toMatchObject({ outstanding: 2500, overdue: 0 });
    expect(
      (await studentRows()).data.find(
        (s: { student: { id: string } }) => s.student.id === stu.s4,
      ),
    ).toMatchObject({ outstanding: 15_300, invoices: 9 });
    const billing = (
      await get(`/reports/billing?academicYearId=${yearA}&kind=AD_HOC`).expect(
        200,
      )
    ).body.data;
    expect(billing.totals).toMatchObject({
      invoices: 15,
      billed: 2500,
      outstanding: 2500,
    });
  });

  it('waives a fine through a credit note, and never fines that invoice again', async ({
    skip,
  }) => {
    if (blocked) skip();
    const fine = await prisma.lateFine.findFirstOrThrow({
      where: { sourceInvoiceId: inv.s1[3] },
    });
    const note = await post(
      `/invoices/${fine.fineInvoiceId}/adjustments`,
      {
        kind: 'WAIVER',
        amount: 200,
        reason: 'Fee was paid on time, bank delayed it',
      },
      token.acc,
    ).expect(201);
    await post(
      `/adjustments/${note.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(200);
    expect(await invoiceView(fine.fineInvoiceId)).toMatchObject({
      status: 'SETTLED',
      outstanding: 0,
    });
    expect((await dues()).totals.outstanding).toBe(78_800);
    expect((await preview().expect(200)).body.data.count).toBe(0);
  });

  it('is protected in the database even when the application is bypassed', async ({
    skip,
  }) => {
    if (blocked) skip();
    const run = (
      await prisma.lateFineRun.findFirstOrThrow({
        where: { createdById: userId.acc },
      })
    ).id;
    const fineOf = await prisma.lateFine.findFirstOrThrow({
      where: { sourceInvoiceId: inv.s2[0] },
    });
    const adHoc = (
      await post(
        `/enrollments/${enr.s1}/invoices/ad-hoc`,
        {
          requestKey: randomUUID(),
          lines: [{ feeHeadId: head.FIN, amount: 50 }],
        },
        token.acc,
      ).expect(201)
    ).body.data.id as string;
    const raw = (sourceInvoiceId: string, fineInvoiceId: string, amount = 50) =>
      prisma.lateFine.create({
        data: {
          runId: run,
          sourceInvoiceId,
          fineInvoiceId,
          baseAmount: 100,
          amount,
          daysOverdue: 3,
        },
      });

    await expect(raw(fineOf.fineInvoiceId, adHoc)).rejects.toThrow(
      /never fined/,
    ); // a fine is never fined
    await expect(raw(inv.s2[1], adHoc)).rejects.toThrow(/does not match/); // another student's invoice
    await expect(raw(inv.s1[4], adHoc, 49)).rejects.toThrow(/does not match/); // the amount must be the invoice's
    await expect(raw(inv.s2[0], adHoc)).rejects.toThrow(); // one fine per invoice
    await expect(
      prisma.lateFine.update({ where: { id: fineOf.id }, data: { amount: 1 } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.lateFine.delete({ where: { id: fineOf.id } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.lateFeePolicy.create({
        data: {
          enabled: true,
          type: 'PERCENT',
          value: 150,
          graceDays: 0,
          minOutstanding: 0,
          appliesFromDueDate: date(today()),
          feeHeadId: head.FIN,
          createdById: userId.principal,
        },
      }),
    ).rejects.toThrow();
    const policy = await prisma.lateFeePolicy.findFirstOrThrow({
      where: { createdById: userId.principal },
    });
    await expect(
      prisma.lateFeePolicy.update({
        where: { id: policy.id },
        data: { graceDays: 0 },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      post(
        `/invoices/${adHoc}/void`,
        { reason: 'Raised by mistake, no longer needed' },
        token.principal,
      ).expect(200),
    ).resolves.toBeDefined();
    await expect(
      prisma.lateFine.create({
        data: {
          runId: run,
          sourceInvoiceId: inv.s4[4],
          fineInvoiceId: adHoc,
          baseAmount: 100,
          amount: 50,
          daysOverdue: 3,
        },
      }),
    ).rejects.toThrow(); // not even a voided fine invoice can be reused
  });

  it('keeps the head used by the policy, and writes only numbers to the audit log', async ({
    skip,
  }) => {
    if (blocked) skip();
    await put(
      `/academic-years/${yearA}/classes/${cls.C2}/fee-structure`,
      { lines: [] },
      token.setup,
    ).expect(200);
    const logs = await prisma.auditLog.findMany({
      where: { action: { in: ['late_fee.policy_set', 'late_fee.run'] } },
      select: { details: true },
    });
    expect(logs.length).toBeGreaterThanOrEqual(8);
    const text = JSON.stringify(logs);
    for (const secret of [PFX, 'Rai', 'Fee was paid on time'])
      expect(text).not.toContain(secret);
    const run = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'late_fee.run' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(run.details).toMatchObject({ created: 4, total: 300 });
  });
});
