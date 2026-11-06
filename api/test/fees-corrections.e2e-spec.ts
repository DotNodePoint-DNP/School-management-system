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

const PFX = 'E2E-COR';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-cor-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const seq = (number: string): number => Number(number.slice(-6));
const REASON = 'Issued to the wrong student by mistake';
const WHY = 'Family hardship, approved by the committee';

type Who =
  | 'setup'
  | 'accountant'
  | 'accountant2'
  | 'principal'
  | 'both'
  | 'reader'
  | 'plain';
type Key = 'a1' | 'a2' | 'a3' | 'a4' | 'a5';
const KEYS: Key[] = ['a1', 'a2', 'a3', 'a4', 'a5'];

describe('Invoice corrections: void, reissue and credit notes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let createdFiscalYear = false;
  let yearA = '';
  let classId = '';
  const head = { TUI: '', ADM: '', UNI: '' };
  let periods: { id: string; dueDate: string }[] = [];
  const enr = {} as Record<Key, string>;
  const stu = {} as Record<Key, string>;
  const adm = {} as Record<Key, string>;
  const inv = {} as Record<Key, string>; // the first invoice of each student for period 1
  let a1Live = '';
  let a1LiveNumber = '';
  let a3Live = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t: string) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const counter = async (): Promise<number> =>
    (
      await prisma.sequence.findUnique({
        where: { name: `invoice:${fiscalYearId}` },
      })
    )?.value ?? 0;
  const voidIt = (id: string, t = token.principal) =>
    post(`/invoices/${id}/void`, { reason: REASON }, t);
  const adjust = (extra: object = {}) => ({
    kind: 'WAIVER',
    amount: 2000,
    reason: WHY,
    ...extra,
  });
  const request1 = (
    invoiceId: string,
    extra: object = {},
    t = token.accountant,
  ) => post(`/invoices/${invoiceId}/adjustments`, adjust(extra), t);
  const detail = async (id: string, t = token.reader) =>
    (await get(`/invoices/${id}`, t).expect(200)).body.data;
  const approvedDiscount = (key: Key, value: number) =>
    prisma.studentDiscount.create({
      data: {
        enrollmentId: enr[key],
        academicYearId: yearA,
        category: 'MERIT_SCHOLARSHIP',
        feeHeadId: head.TUI,
        type: 'PERCENT',
        value,
        reason: 'Merit scholarship award',
        status: 'APPROVED',
        createdById: userId.setup,
        lastEditedById: userId.setup,
        approvedById: userId.principal,
        approvedAt: new Date(),
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
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
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
        // Newest revisions first, because each one points to the invoice it replaces.
        await tx.invoice.deleteMany({
          where: { id: { in: ids }, replacesInvoiceId: { not: null } },
        });
        await tx.invoice.deleteMany({ where: { id: { in: ids } } });
      },
      { timeout: 60_000 },
    );
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
    await prisma.feeHead.deleteMany({
      where: { code: { startsWith: `T${TAIL}` } },
    });
    const fiscalYears = await prisma.fiscalYear.findMany({
      where: { label: { startsWith: PFX } },
      select: { id: true },
    });
    await prisma.sequence.deleteMany({
      where: { name: { in: fiscalYears.map((f) => `invoice:${f.id}`) } },
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
      where: { email: { startsWith: 'e2e-cor-' } },
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
    await makeUser('accountant', [
      ['fees', 'read'],
      ['fees', 'invoice-generate'],
      ['fees', 'adjust'],
    ]);
    await makeUser('accountant2', [
      ['fees', 'read'],
      ['fees', 'invoice-generate'],
      ['fees', 'adjust'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'invoice-void'],
      ['fees', 'adjust-approve'],
    ]);
    await makeUser('both', [
      ['fees', 'read'],
      ['fees', 'adjust'],
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
    const makeHead = async (
      suffix: keyof typeof head,
      frequency: 'MONTHLY' | 'ONE_TIME' | 'AD_HOC',
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
    await makeHead('ADM', 'ONE_TIME');
    await makeHead('UNI', 'AD_HOC');
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
            feeHeadId: head.TUI,
            amount: 5000,
            periodIds: periods.map((p) => p.id),
          },
          { feeHeadId: head.ADM, amount: 10000, onAdmission: true },
        ],
      },
      token.setup,
    ).expect(200);

    for (const [index, key] of KEYS.entries()) {
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
            classId,
            sectionId: section,
            rollNo: index + 1,
          },
        })
      ).id;
    }
    await post(
      '/invoices/generate',
      { kind: 'PERIODIC', periodId: periods[0]?.id, classId },
      token.accountant,
    ).expect(200);
    const rows = await prisma.invoice.findMany({
      where: { periodId: periods[0]?.id },
    });
    for (const key of KEYS)
      inv[key] = (
        rows.find((r) => r.studentId === stu[key]) as { id: string }
      ).id;
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-cor-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('gives each action to the right people only', async ({ skip }) => {
    if (blocked) skip();
    await http()
      .post(`${V1}/invoices/${inv.a1}/void`)
      .send({ reason: REASON })
      .expect(401);
    await voidIt(inv.a1, token.accountant).expect(403); // issuing is not voiding
    await voidIt(inv.a1, token.plain).expect(403);
    await post(`/invoices/${inv.a1}/reissue`, {}, token.principal).expect(403);
    await post(`/invoices/${inv.a1}/reissue/preview`, {}, token.reader).expect(
      403,
    );
    await request1(inv.a1, {}, token.reader).expect(403);
    await request1(inv.a1, {}, token.principal).expect(403); // approving is not requesting
    await post(
      `/adjustments/${randomUUID()}/approve`,
      {},
      token.accountant,
    ).expect(403);
    await post(
      `/adjustments/${randomUUID()}/reject`,
      { note: 'no good reason' },
      token.accountant,
    ).expect(403);
    await post(
      `/adjustments/${randomUUID()}/withdraw`,
      {},
      token.principal,
    ).expect(403);
    await get('/adjustments', token.plain).expect(403);
    await get('/adjustments', token.reader).expect(200);
    await post(
      `/invoices/${randomUUID()}/adjustments`,
      adjust(),
      token.accountant,
    ).expect(404);
    await get(`/adjustments/${randomUUID()}`, token.reader).expect(404);
  });

  it('voids an invoice but keeps it, its number, and the reason', async ({
    skip,
  }) => {
    if (blocked) skip();
    await post(
      `/invoices/${inv.a1}/void`,
      { reason: 'short' },
      token.principal,
    ).expect(400);
    await post(
      `/invoices/${randomUUID()}/void`,
      { reason: REASON },
      token.principal,
    ).expect(404);
    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: inv.a1 },
    });

    const res = await voidIt(inv.a1).expect(200);
    expect(res.body.data).toEqual({
      id: inv.a1,
      number: before.number,
      status: 'VOID',
    });
    const shown = await detail(inv.a1);
    expect(shown).toMatchObject({
      status: 'VOID',
      outstanding: 0,
      net: 5000,
      number: before.number,
    });
    expect(shown.void).toMatchObject({
      reason: REASON,
      voidedBy: 'E2E principal',
    });
    await voidIt(inv.a1).expect(409);

    const voided = (
      await get('/invoices?voided=true&kind=PERIODIC', token.reader).expect(200)
    ).body.data as { id: string }[];
    expect(voided.some((i) => i.id === inv.a1)).toBe(true);
    const live = (
      await get(
        `/invoices?voided=false&periodId=${periods[0]?.id}`,
        token.reader,
      ).expect(200)
    ).body.data as { id: string }[];
    expect(live.some((i) => i.id === inv.a1)).toBe(false);

    // A new run does not quietly replace it.
    const run = await post(
      '/invoices/generate',
      { kind: 'PERIODIC', periodId: periods[0]?.id, classId },
      token.accountant,
    ).expect(200);
    expect(run.body.data).toMatchObject({
      created: 0,
      skippedSummary: { ALREADY_INVOICED: 4, VOIDED_NEEDS_REISSUE: 1 },
    });

    await expect(
      prisma.invoiceVoid.delete({ where: { invoiceId: inv.a1 } }),
    ).rejects.toThrow(/append-only/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'invoice.voided', entityId: inv.a1 },
    });
    expect(audit.details).toEqual({ number: before.number });
  });

  it("reissues a voided invoice as a new revision, recalculated from today's discounts", async ({
    skip,
  }) => {
    if (blocked) skip();
    await post(`/invoices/${inv.a2}/reissue`, {}, token.accountant).expect(409); // not void
    await post(
      `/invoices/${randomUUID()}/reissue`,
      {},
      token.accountant,
    ).expect(404);
    const plain = (
      await post(
        `/invoices/${inv.a1}/reissue/preview`,
        {},
        token.accountant,
      ).expect(200)
    ).body.data;
    expect(plain).toMatchObject({
      kind: 'PERIODIC',
      revision: 2,
      replaces: { id: inv.a1 },
      net: 5000,
      originalNet: 5000,
      changed: false,
      issuedOn: today(),
      dueDate: periods[0]?.dueDate,
    });

    await approvedDiscount('a1', 10);
    const changed = (
      await post(
        `/invoices/${inv.a1}/reissue/preview`,
        {},
        token.accountant,
      ).expect(200)
    ).body.data;
    expect(changed).toMatchObject({
      gross: 5000,
      discount: 500,
      net: 4500,
      changed: true,
    });
    expect(changed.lines).toEqual([
      { code: `T${TAIL}TUI`, gross: 5000, discount: 500, net: 4500 },
    ]);

    const used = await counter();
    await post(
      `/invoices/${inv.a1}/reissue`,
      { expectNet: 5000 },
      token.accountant,
    ).expect(409); // the figures moved
    await post(
      `/invoices/${inv.a1}/reissue`,
      { dueDate: addDays(today(), 3) },
      token.accountant,
    ).expect(400); // periodic invoices keep the period's due date
    await post(
      `/invoices/${inv.a1}/reissue`,
      { expectNet: 12.345 },
      token.accountant,
    ).expect(400);
    expect(await counter()).toBe(used); // refusals use no numbers

    const made = await post(
      `/invoices/${inv.a1}/reissue`,
      { expectNet: 4500 },
      token.accountant,
    ).expect(201);
    expect(made.body.data).toMatchObject({
      revision: 2,
      net: 4500,
      replaces: { id: inv.a1 },
    });
    a1Live = made.body.data.id as string;
    a1LiveNumber = made.body.data.number as string;
    expect(seq(a1LiveNumber)).toBe(used + 1); // a fresh number, in sequence
    const row = await prisma.invoice.findUniqueOrThrow({
      where: { id: a1Live },
      include: { lines: true },
    });
    expect(row).toMatchObject({
      kind: 'PERIODIC',
      revision: 2,
      replacesInvoiceId: inv.a1,
      periodId: periods[0]?.id,
      enrollmentId: enr.a1,
      createdById: userId.accountant,
    });
    expect(row.issuedOn.toISOString().slice(0, 10)).toBe(today());
    expect(row.dueDate.toISOString().slice(0, 10)).toBe(periods[0]?.dueDate);
    expect([
      row.grossAmount.toNumber(),
      row.discountAmount.toNumber(),
      row.netAmount.toNumber(),
    ]).toEqual([5000, 500, 4500]);
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0]?.lineDiscountId).toEqual(expect.any(String));

    expect(
      (
        await post(`/invoices/${inv.a1}/reissue`, {}, token.accountant).expect(
          409,
        )
      ).body.error.message,
    ).toMatch(/already reissued as /);
    expect((await detail(inv.a1)).replacedBy).toEqual({
      id: a1Live,
      number: a1LiveNumber,
    });
    expect((await detail(a1Live)).replacesInvoiceId).toBe(inv.a1);
    const run = await post(
      '/invoices/generate',
      { kind: 'PERIODIC', periodId: periods[0]?.id, classId },
      token.accountant,
    ).expect(200);
    expect(run.body.data).toMatchObject({
      created: 0,
      skippedSummary: { ALREADY_INVOICED: 5 },
    }); // a1 has a live invoice again
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'invoice.reissued', entityId: a1Live },
    });
    expect(audit.details).toMatchObject({ to: a1LiveNumber, net: 4500 });
  });

  it('can reissue again after another void, and the invoice chain stays linked', async ({
    skip,
  }) => {
    if (blocked) skip();
    await voidIt(a1Live).expect(200);
    const used = await counter();
    const third = await post(
      `/invoices/${a1Live}/reissue`,
      {},
      token.accountant,
    ).expect(201);
    expect(third.body.data).toMatchObject({
      revision: 3,
      net: 4500,
      replaces: { id: a1Live },
    });
    expect(seq(third.body.data.number as string)).toBe(used + 1);
    a1Live = third.body.data.id as string;
    a1LiveNumber = third.body.data.number as string;
    const chain = await prisma.invoice.findMany({
      where: { enrollmentId: enr.a1, periodId: periods[0]?.id },
      orderBy: { revision: 'asc' },
      select: { revision: true, replacesInvoiceId: true, number: true },
    });
    expect(chain.map((c) => c.revision)).toEqual([1, 2, 3]);
    expect(new Set(chain.map((c) => c.number)).size).toBe(3); // voided numbers are never reused
  });

  it('handles a double click, a fully discounted student, a student who left, and ad-hoc invoices', async ({
    skip,
  }) => {
    if (blocked) skip();
    // Two people press "reissue" at the same moment: exactly one new invoice.
    await voidIt(inv.a3).expect(200);
    const used = await counter();
    const race = await Promise.all([
      post(`/invoices/${inv.a3}/reissue`, {}, token.accountant),
      post(`/invoices/${inv.a3}/reissue`, {}, token.accountant2),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    a3Live = race.find((r) => r.status === 201)?.body.data.id as string;
    expect(await counter()).toBe(used + 1); // the loser used no number
    expect(
      await prisma.invoice.count({ where: { replacesInvoiceId: inv.a3 } }),
    ).toBe(1);

    // A discount that now covers everything leaves nothing to reissue.
    await voidIt(inv.a4).expect(200);
    await approvedDiscount('a4', 100);
    expect(
      (
        await post(
          `/invoices/${inv.a4}/reissue/preview`,
          {},
          token.accountant,
        ).expect(409)
      ).body.error.message,
    ).toMatch(/fully discounted/);
    await post(`/invoices/${inv.a4}/reissue`, {}, token.accountant).expect(409);

    // A student who has left cannot be billed.
    await voidIt(inv.a5).expect(200);
    await prisma.enrollment.update({
      where: { id: enr.a5 },
      data: { status: 'WITHDRAWN', statusChangedOn: date('2005-09-01') },
    });
    expect(
      (
        await post(`/invoices/${inv.a5}/reissue`, {}, token.accountant).expect(
          409,
        )
      ).body.error.message,
    ).toMatch(/no longer enrolled/);
    await request1(inv.a5).expect(409); // and a void invoice takes no credit notes

    // Ad-hoc invoices are not reissued; they are created again.
    const adHoc = await post(
      `/enrollments/${enr.a2}/invoices/ad-hoc`,
      {
        requestKey: randomUUID(),
        lines: [{ feeHeadId: head.UNI, amount: 800 }],
      },
      token.accountant,
    ).expect(201);
    await voidIt(adHoc.body.data.id as string).expect(200);
    expect(
      (
        await post(
          `/invoices/${adHoc.body.data.id}/reissue`,
          {},
          token.accountant,
        ).expect(400)
      ).body.error.message,
    ).toMatch(/Ad-hoc/);
  });

  it('reissues an admission invoice with a due date', async ({ skip }) => {
    if (blocked) skip();
    const run = await post(
      '/invoices/generate',
      { kind: 'ADMISSION', academicYearId: yearA, enrollmentIds: [enr.a2] },
      token.accountant,
    ).expect(200);
    expect(run.body.data.created).toBe(1);
    const admission = await prisma.invoice.findFirstOrThrow({
      where: { enrollmentId: enr.a2, kind: 'ADMISSION' },
    });
    await voidIt(admission.id).expect(200);
    await post(
      `/invoices/${admission.id}/reissue`,
      { dueDate: addDays(today(), -1) },
      token.accountant,
    ).expect(400); // not in the past
    const later = addDays(today(), 10);
    const made = await post(
      `/invoices/${admission.id}/reissue`,
      { dueDate: later },
      token.accountant,
    ).expect(201);
    const row = await prisma.invoice.findUniqueOrThrow({
      where: { id: made.body.data.id as string },
    });
    expect(row).toMatchObject({
      kind: 'ADMISSION',
      revision: 2,
      periodId: null,
      replacesInvoiceId: admission.id,
    });
    expect(row.dueDate.toISOString().slice(0, 10)).toBe(later);
    expect(row.netAmount.toNumber()).toBe(10000);
  });

  it('requires a valid, affordable credit note', async ({ skip }) => {
    if (blocked) skip();
    await request1(inv.a2, { kind: 'GIFT' }).expect(400);
    await request1(inv.a2, { amount: 0 }).expect(400);
    await request1(inv.a2, { amount: 12.345 }).expect(400);
    await request1(inv.a2, { reason: 'short' }).expect(400);
    const tooMuch = await request1(inv.a2, { amount: 5000.01 }).expect(400);
    expect(tooMuch.body.error.message).toMatch(/NPR 5000 still owed/);
  });

  it('approves a credit note only by another person, and reduces what is owed', async ({
    skip,
  }) => {
    if (blocked) skip();
    const n1 = await request1(inv.a2).expect(201);
    expect(n1.body.data).toMatchObject({
      kind: 'WAIVER',
      amount: 2000,
      status: 'PENDING',
      reason: WHY,
      requestedBy: 'E2E accountant',
      decidedBy: null,
    });
    expect(n1.body.data.invoice).toMatchObject({
      id: inv.a2,
      net: 5000,
      outstanding: 5000,
      voided: false,
    });
    expect(n1.body.data.student).toMatchObject({
      admissionNo: adm.a2,
      className: `${PFX}-${RUN}-C`,
      sectionName: 'A',
    });
    await request1(inv.a2).expect(409); // an identical note is a double entry

    // Reasons are for the people who handle credit notes.
    expect((await detail(inv.a2)).adjustments[0]).toMatchObject({
      status: 'PENDING',
      reason: null,
      amount: 2000,
    });
    expect((await detail(inv.a2, token.accountant)).adjustments[0].reason).toBe(
      WHY,
    );
    expect((await detail(inv.a2, token.principal)).adjustments[0].reason).toBe(
      WHY,
    );
    expect(
      (await get(`/adjustments/${n1.body.data.id}`, token.reader).expect(200))
        .body.data.reason,
    ).toBeNull();

    // No one approves their own request, in the service or in the database.
    const own = await request1(
      inv.a2,
      { kind: 'CORRECTION', amount: 100 },
      token.both,
    ).expect(201);
    await post(
      `/adjustments/${own.body.data.id}/approve`,
      {},
      token.both,
    ).expect(409);
    await expect(
      prisma.invoiceAdjustmentDecision.create({
        data: {
          adjustmentId: own.body.data.id as string,
          approved: true,
          decidedById: userId.both,
        },
      }),
    ).rejects.toThrow(/someone other than the person who requested/);
    await post(
      `/adjustments/${own.body.data.id}/reject`,
      { note: 'Not needed after all' },
      token.principal,
    ).expect(200);

    const approved = await post(
      `/adjustments/${n1.body.data.id}/approve`,
      { note: 'Committee minute 4' },
      token.principal,
    ).expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'APPROVED',
      decidedBy: 'E2E principal',
      decisionNote: 'Committee minute 4',
      invoice: { outstanding: 3000 },
    });
    expect(await detail(inv.a2)).toMatchObject({
      adjusted: 2000,
      outstanding: 3000,
      paid: 0,
      status: 'OPEN',
    });
    await post(
      `/adjustments/${n1.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(409); // already decided
    await post(
      `/adjustments/${n1.body.data.id}/reject`,
      { note: 'Changed my mind' },
      token.principal,
    ).expect(409);
    await post(
      `/adjustments/${n1.body.data.id}/withdraw`,
      {},
      token.accountant,
    ).expect(409);
    await expect(
      prisma.invoiceAdjustment.update({
        where: { id: n1.body.data.id as string },
        data: { amount: 1 },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.invoiceAdjustmentDecision.delete({
        where: { adjustmentId: n1.body.data.id as string },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('never lets approvals add up to more than the invoice, even under a race', async ({
    skip,
  }) => {
    if (blocked) skip();
    const n2 = await request1(inv.a2, {
      kind: 'WRITE_OFF',
      amount: 1000,
    }).expect(201);
    const race = await Promise.all([
      post(`/adjustments/${n2.body.data.id}/approve`, {}, token.principal),
      post(`/adjustments/${n2.body.data.id}/approve`, {}, token.both),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]); // one decision, however many people click
    expect((await detail(inv.a2)).outstanding).toBe(2000);

    const n3 = await request1(inv.a2, {
      kind: 'WRITE_OFF',
      amount: 2000,
    }).expect(201);
    const n4 = await request1(inv.a2, {
      kind: 'CORRECTION',
      amount: 2000,
    }).expect(201); // both look fine while 2000 is owed
    await post(
      `/adjustments/${n3.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(200);
    expect(await detail(inv.a2)).toMatchObject({
      adjusted: 5000,
      outstanding: 0,
      status: 'SETTLED',
    });
    const refused = await post(
      `/adjustments/${n4.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(409);
    expect(refused.body.error.message).toMatch(/only NPR 0 is still owed/);
    await expect(
      prisma.invoiceAdjustmentDecision.create({
        data: {
          adjustmentId: n4.body.data.id as string,
          approved: true,
          decidedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/exceed/); // the database says no too
    await request1(inv.a2, { kind: 'WAIVER', amount: 1 }).expect(400); // nothing left to forgive

    await post(
      `/adjustments/${n4.body.data.id}/reject`,
      {},
      token.principal,
    ).expect(400); // a note is needed
    await post(
      `/adjustments/${n4.body.data.id}/reject`,
      { note: 'no' },
      token.principal,
    ).expect(400);
    const rejected = await post(
      `/adjustments/${n4.body.data.id}/reject`,
      { note: 'The invoice is already fully waived' },
      token.principal,
    ).expect(200);
    expect(rejected.body.data).toMatchObject({
      status: 'REJECTED',
      decisionNote: 'The invoice is already fully waived',
    });
    expect((await detail(inv.a2)).outstanding).toBe(0);
  });

  it('lets only the requester withdraw a credit note', async ({ skip }) => {
    if (blocked) skip();
    const note = await request1(a1Live, {
      kind: 'WRITE_OFF',
      amount: 300,
    }).expect(201);
    await post(
      `/adjustments/${note.body.data.id}/withdraw`,
      {},
      token.accountant2,
    ).expect(403);
    const withdrawn = await post(
      `/adjustments/${note.body.data.id}/withdraw`,
      {},
      token.accountant,
    ).expect(200);
    expect(withdrawn.body.data).toMatchObject({
      status: 'REJECTED',
      decisionNote: 'Withdrawn by the requester',
      decidedBy: 'E2E accountant',
    });
    await post(
      `/adjustments/${note.body.data.id}/approve`,
      {},
      token.principal,
    ).expect(409);
    await post(
      `/adjustments/${note.body.data.id}/withdraw`,
      {},
      token.accountant,
    ).expect(409);
    expect(await detail(a1Live)).toMatchObject({
      outstanding: 4500,
      adjusted: 0,
    });
  });

  it('shows pending credit notes as a queue with filters', async ({ skip }) => {
    if (blocked) skip();
    const q1 = await request1(a1Live, { kind: 'WAIVER', amount: 400 }).expect(
      201,
    );
    const q2 = await request1(
      a1Live,
      { kind: 'CORRECTION', amount: 500 },
      token.accountant2,
    ).expect(201);

    const pending = (
      await get(
        '/adjustments?status=PENDING&pageSize=50',
        token.principal,
      ).expect(200)
    ).body.data as {
      id: string;
      invoice: { id: string };
      reason: string | null;
    }[];
    const mine = pending.filter((p) => p.invoice.id === a1Live);
    expect(mine.map((p) => p.id)).toEqual([q1.body.data.id, q2.body.data.id]); // oldest first
    expect(mine[0]).toMatchObject({
      kind: 'WAIVER',
      amount: 400,
      status: 'PENDING',
      reason: WHY,
      requestedBy: 'E2E accountant',
      student: { admissionNo: adm.a1 },
      invoice: {
        number: a1LiveNumber,
        net: 4500,
        outstanding: 4500,
        voided: false,
      },
    });
    const asReader = (
      await get('/adjustments?status=PENDING&pageSize=50', token.reader).expect(
        200,
      )
    ).body.data as { reason: string | null }[];
    expect(asReader.every((p) => p.reason === null)).toBe(true);

    expect(
      (
        await get(
          '/adjustments?status=PENDING&kind=CORRECTION&pageSize=50',
          token.reader,
        ).expect(200)
      ).body.data.some((p: { id: string }) => p.id === q2.body.data.id),
    ).toBe(true);
    expect(
      (
        await get(
          `/adjustments?status=PENDING&classId=${classId}`,
          token.reader,
        ).expect(200)
      ).body.meta.total,
    ).toBe(2);
    expect(
      (
        await get(
          `/adjustments?status=PENDING&fiscalYearId=${fiscalYearId}&pageSize=1`,
          token.reader,
        ).expect(200)
      ).body.data,
    ).toHaveLength(1);
    const approved = (
      await get(
        '/adjustments?status=APPROVED&pageSize=50',
        token.reader,
      ).expect(200)
    ).body.data as { status: string }[];
    expect(approved.length).toBeGreaterThanOrEqual(3);
    expect(approved.every((a) => a.status === 'APPROVED')).toBe(true);
    expect(
      (
        await get(
          '/adjustments?status=REJECTED&pageSize=50',
          token.reader,
        ).expect(200)
      ).body.meta.total,
    ).toBeGreaterThanOrEqual(3);
    await get('/adjustments?status=WRONG', token.reader).expect(400);
    await get('/adjustments?pageSize=1000', token.reader).expect(400);
  });

  it('blocks a void while a credit note is waiting or has been approved', async ({
    skip,
  }) => {
    if (blocked) skip();
    expect((await voidIt(a1Live).expect(409)).body.error.message).toMatch(
      /waiting for a decision/,
    );
    const waiting = (
      await get(
        '/adjustments?status=PENDING&pageSize=50',
        token.principal,
      ).expect(200)
    ).body.data as { id: string; invoice: { id: string } }[];
    for (const n of waiting.filter((w) => w.invoice.id === a1Live)) {
      await post(
        `/adjustments/${n.id}/reject`,
        { note: 'Raising the invoice again instead' },
        token.principal,
      ).expect(200);
    }
    await voidIt(a1Live).expect(200); // fine once nothing is waiting

    expect((await voidIt(inv.a2).expect(409)).body.error.message).toMatch(
      /approved credit notes/,
    );
    await expect(
      prisma.invoiceVoid.create({
        data: {
          invoiceId: inv.a2,
          reason: REASON,
          voidedById: userId.principal,
        },
      }),
    ).rejects.toThrow(/approved adjustments/); // the database agrees
  });

  it('freezes credit notes and voids once the fiscal year is closed, but still lets the queue be cleared', async ({
    skip,
  }) => {
    if (blocked) skip();
    if (!createdFiscalYear) skip(); // this needs to close a fiscal year, which only a fiscal year created by the test may do
    const waiting = await request1(a3Live, {
      kind: 'WAIVER',
      amount: 100,
    }).expect(201);
    const second = await request1(a3Live, {
      kind: 'WRITE_OFF',
      amount: 150,
    }).expect(201);
    await prisma.fiscalYear.update({
      where: { id: fiscalYearId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    try {
      expect(
        (await request1(a3Live, { kind: 'CORRECTION', amount: 50 }).expect(409))
          .body.error.message,
      ).toMatch(/closed/);
      await post(
        `/adjustments/${waiting.body.data.id}/approve`,
        {},
        token.principal,
      ).expect(409);
      await voidIt(a3Live).expect(409);
      await post(
        `/adjustments/${waiting.body.data.id}/reject`,
        { note: 'The year has closed' },
        token.principal,
      ).expect(200);
      await post(
        `/adjustments/${second.body.data.id}/withdraw`,
        {},
        token.accountant,
      ).expect(200);
    } finally {
      await prisma.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { status: 'OPEN', closedAt: null },
      });
    }
  });

  it('records corrections in the audit log without reasons or names', async ({
    skip,
  }) => {
    if (blocked) skip();
    const requested = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'adjustment.requested', entityId: inv.a2 },
      orderBy: { occurredAt: 'asc' },
    });
    expect(requested.details).toEqual({
      invoiceNumber: (
        await prisma.invoice.findUniqueOrThrow({ where: { id: inv.a2 } })
      ).number,
      kind: 'WAIVER',
      amount: 2000,
    });
    const approved = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'adjustment.approved', entityId: inv.a2 },
    });
    expect(approved.details).toMatchObject({ kind: 'WAIVER', amount: 2000 });
    const rejected = await prisma.auditLog.findMany({
      where: { action: 'adjustment.rejected' },
    });
    expect(
      rejected.some(
        (r) => (r.details as { withdrawn?: boolean }).withdrawn === true,
      ),
    ).toBe(true);
    const all = JSON.stringify([
      requested.details,
      approved.details,
      rejected.map((r) => r.details),
    ]);
    for (const secret of [
      WHY,
      REASON,
      'Committee minute',
      'wrong student',
      PFX,
    ])
      expect(all).not.toContain(secret);
  });
});
