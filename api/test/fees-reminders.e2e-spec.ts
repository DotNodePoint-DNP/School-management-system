import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { MessagingService } from '../src/infra/messaging/messaging.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

class FakeMessaging {
  sent: {
    channel: 'sms' | 'email';
    to: string;
    subject: string | null;
    text: string;
  }[] = [];
  failing = false;
  sendSms(to: string, text: string) {
    return this.record('sms', to, null, text);
  }
  sendEmail(to: string, subject: string, text: string) {
    return this.record('email', to, subject, text);
  }
  private record(
    channel: 'sms' | 'email',
    to: string,
    subject: string | null,
    text: string,
  ) {
    if (this.failing)
      return Promise.resolve({ ok: false, error: 'gateway down' });
    this.sent.push({ channel, to, subject, text });
    return Promise.resolve({ ok: true });
  }
}

const PFX = 'E2E-REM';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-rem-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const PHONE1 = `+97798${TAIL}`;
const PHONE3 = `+97797${TAIL}`;
const MAIL2 = `e2e-rem-${RUN}-g2@test.local`;

type Who = 'setup' | 'acc' | 'reader' | 'plain';
type S = 's1' | 's2' | 's3' | 's4' | 's5' | 's6';
const STUDENTS: S[] = ['s1', 's2', 's3', 's4', 's5', 's6'];

describe('Fee reminders by SMS and email (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fake = new FakeMessaging();
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let yearA = '';
  let classId = '';
  let emptyClass = '';
  const stu = {} as Record<S, string>;
  const adm = {} as Record<S, string>;
  const guardian = { g1: '', g2: '', g3: '' };
  let runId = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.acc) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const preview = (body: object, t = token.acc) =>
    post('/reminders/fees/preview', { academicYearId: yearA, ...body }, t);
  const send = (body: object, t = token.acc) =>
    post('/reminders/fees/send', { academicYearId: yearA, ...body }, t);
  const reminders = () =>
    prisma.feeReminder.findMany({
      where: { guardianId: { in: Object.values(guardian) } },
      orderBy: { createdAt: 'asc' },
    });
  const clearLog = () =>
    prisma.feeReminder.deleteMany({
      where: { guardianId: { in: Object.values(guardian) } },
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
        where: { email: { startsWith: 'e2e-rem-' } },
        select: { id: true },
      })
    ).map((u) => u.id);
    await prisma.feeReminder.deleteMany({
      where: { run: { sentById: { in: users } } },
    });
    await prisma.feeReminder.deleteMany({
      where: { guardian: { firstName: { startsWith: PFX } } },
    });
    await prisma.feeReminderRun.deleteMany({
      where: { sentById: { in: users } },
    });
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.allow_ledger_purge', 'on', true)`;
        const payments = (
          await tx.payment.findMany({
            where: { receivedById: { in: users } },
            select: { id: true },
          })
        ).map((p) => p.id);
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
      .overrideProvider(MessagingService)
      .useValue(fake)
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
      where: { email: { startsWith: 'e2e-rem-' } },
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
    } else {
      try {
        const start = addDays(today(), -100);
        await prisma.fiscalYear.create({
          data: {
            label: `${PFX}-${RUN}-FY`,
            startDate: date(start),
            endDate: date(addDays(start, 364)),
          },
        });
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
      ['fees', 'remind'],
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
    emptyClass = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-E`, sortOrder: 4 },
      })
    ).id;
    const section = (
      await prisma.section.create({ data: { classId, name: 'A' } })
    ).id;
    await prisma.section.create({ data: { classId: emptyClass, name: 'A' } });
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
            periodIds: periods.slice(0, 2).map((p) => p.id),
          },
        ],
      },
      token.setup,
    ).expect(200);

    guardian.g1 = (
      await prisma.guardian.create({
        data: { firstName: `${PFX}-G1`, lastName: 'Rai', phone: PHONE1 },
      })
    ).id;
    guardian.g2 = (
      await prisma.guardian.create({
        data: { firstName: `${PFX}-G2`, lastName: 'Rai', email: MAIL2 },
      })
    ).id;
    guardian.g3 = (
      await prisma.guardian.create({
        data: { firstName: `${PFX}-G3`, lastName: 'Rai', phone: PHONE3 },
      })
    ).id;
    const owner: Record<S, string | null> = {
      s1: guardian.g1,
      s2: guardian.g1,
      s3: guardian.g2,
      s4: null,
      s5: guardian.g3,
      s6: guardian.g3,
    };
    for (const [index, key] of STUDENTS.entries()) {
      adm[key] = `E2E-${RUN}-${key}`;
      const student = await prisma.student.create({
        data: {
          admissionNo: adm[key],
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
          ...(owner[key]
            ? {
                guardians: {
                  create: [
                    {
                      guardianId: owner[key] as string,
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
    for (const p of periods.slice(0, 2))
      await post(
        '/invoices/generate',
        { kind: 'PERIODIC', periodId: p.id, classId },
        token.acc,
      ).expect(200);
    // Everyone owes 10,000, except s5 (50 left) and s6 (nothing left).
    await post(
      '/payments',
      {
        idempotencyKey: randomUUID(),
        amount: 9950,
        method: 'CASH',
        autoAllocate: { studentIds: [stu.s5] },
      },
      token.acc,
    ).expect(201);
    await post(
      '/payments',
      {
        idempotencyKey: randomUUID(),
        amount: 10_000,
        method: 'CASH',
        autoAllocate: { studentIds: [stu.s6] },
      },
      token.acc,
    ).expect(201);
  });

  beforeEach(() => {
    fake.sent = [];
    fake.failing = false;
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-rem-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('needs the reminder permission', async ({ skip }) => {
    if (blocked) skip();
    await http().post(`${V1}/reminders/fees/preview`).send({}).expect(401);
    for (const t of [token.plain, token.reader]) {
      await preview({ classId }, t).expect(403);
      await send({ classId }, t).expect(403);
      await get('/reminders/fees/runs', t).expect(403);
      await get(`/reminders/fees/runs/${randomUUID()}`, t).expect(403);
    }
    expect(fake.sent).toEqual([]);
  });

  it('validates what is asked for', async ({ skip }) => {
    if (blocked) skip();
    await preview({}).expect(400);
    await preview({ classId, all: true }).expect(400);
    await preview({ classId, sectionId: randomUUID() }).expect(400);
    await preview({ classId, minDaysOverdue: 0 }).expect(400);
    await preview({ classId, cooldownDays: 91 }).expect(400);
    await preview({ classId, minOutstanding: -1 }).expect(400);
    await preview({
      studentIds: Array.from({ length: 101 }, () => randomUUID()),
    }).expect(400);
    await preview({ classId: randomUUID() }).expect(404);
    await preview({ sectionId: randomUUID() }).expect(404);
    await send({ classId, expect: { recipients: -1, total: 1 } }).expect(400);
    await get('/reminders/fees/runs/not-a-uuid').expect(400);
    await get(`/reminders/fees/runs/${randomUUID()}`).expect(404);
  });

  it('previews the families, one message per guardian, without sending or writing anything', async ({
    skip,
  }) => {
    if (blocked) skip();
    const p = (await preview({ classId }).expect(200)).body.data;
    expect(p).toMatchObject({
      recipients: 2,
      total: 30_000,
      canSend: true,
      problems: [],
      settings: { minDaysOverdue: 1, minOutstanding: 100, cooldownDays: 7 },
    });
    expect(p.skippedSummary).toEqual({ NO_CONTACT: 1, BELOW_MINIMUM: 1 });
    expect(p.skipped).toEqual(
      expect.arrayContaining([
        { reason: 'NO_CONTACT', admissionNo: adm.s4 },
        { reason: 'BELOW_MINIMUM', admissionNo: adm.s5 },
      ]),
    );

    const [sms, mail] = p.list;
    expect(sms).toMatchObject({
      channel: 'SMS',
      to: `***${PHONE1.slice(-4)}`,
      total: 20_000,
      guardianId: guardian.g1,
    });
    expect(sms.children).toEqual([
      { admissionNo: adm.s1, firstName: `${PFX}-s1`, amount: 10_000 },
      { admissionNo: adm.s2, firstName: `${PFX}-s2`, amount: 10_000 },
    ]); // siblings in one message
    expect(mail).toMatchObject({
      channel: 'EMAIL',
      to: 'e***@test.local',
      total: 10_000,
      guardianId: guardian.g2,
    });
    expect(sms.oldestDueDateBs).toEqual(expect.any(String));
    expect(p.sample).toMatchObject({ channel: 'SMS', subject: null });
    expect(p.sample.text).toContain('NPR 20,000');
    expect(p.sample.text).toContain(`${PFX}-s1`);
    expect(p.sample.text).not.toContain(PHONE1);

    expect(fake.sent).toEqual([]);
    expect(await reminders()).toHaveLength(0);
  });

  it('follows the selection, the minimums and the empty-class rule', async ({
    skip,
  }) => {
    if (blocked) skip();
    const one = (await preview({ studentIds: [stu.s1] }).expect(200)).body.data;
    expect(one).toMatchObject({ recipients: 1, total: 10_000 }); // only the chosen child counts
    expect(one.list[0].children).toHaveLength(1);
    expect(
      (await preview({ studentIds: [stu.s6] }).expect(200)).body.data,
    ).toMatchObject({ recipients: 0, total: 0, canSend: false }); // owes nothing

    const small = (await preview({ classId, minOutstanding: 0.01 }).expect(200))
      .body.data;
    expect(small).toMatchObject({ recipients: 3, total: 30_050 }); // the family that owes 50 is now included
    expect(small.skippedSummary).toEqual({ NO_CONTACT: 1 });
    expect(
      (await preview({ classId, minDaysOverdue: 365 }).expect(200)).body.data
        .recipients,
    ).toBe(2); // these dues are years old

    const none = (await preview({ classId: emptyClass }).expect(200)).body.data;
    expect(none).toMatchObject({ recipients: 0, total: 0, list: [] }); // a class with no students never means "everyone"
    expect(
      (
        await preview({
          sectionId: (
            await prisma.section.findFirstOrThrow({
              where: { classId: emptyClass },
            })
          ).id,
        }).expect(200)
      ).body.data.recipients,
    ).toBe(0);
  });

  it('refuses to send when the figures moved since the preview', async ({
    skip,
  }) => {
    if (blocked) skip();
    const stale = await send({
      classId,
      expect: { recipients: 3, total: 40_000 },
    }).expect(409);
    expect(stale.body.error.message).toMatch(/figures changed/);
    expect(fake.sent).toEqual([]);
    expect(await reminders()).toHaveLength(0);
  });

  it('sends one SMS per family and an email where there is no phone', async ({
    skip,
  }) => {
    if (blocked) skip();
    const res = await send({
      classId,
      expect: { recipients: 2, total: 30_000 },
    }).expect(200);
    runId = res.body.data.runId;
    expect(res.body.data).toMatchObject({
      recipients: 2,
      sent: 2,
      failed: 0,
      total: 30_000,
      skippedSummary: { NO_CONTACT: 1, BELOW_MINIMUM: 1 },
    });

    expect(fake.sent).toHaveLength(2);
    const sms = fake.sent.find((m) => m.channel === 'sms');
    expect(sms?.to).toBe(PHONE1);
    for (const needle of [
      'Fee reminder',
      'NPR 20,000',
      `${PFX}-s1`,
      `${PFX}-s2`,
      'Please pay at the school office',
    ])
      expect(sms?.text).toContain(needle);
    const mail = fake.sent.find((m) => m.channel === 'email');
    expect(mail?.to).toBe(MAIL2);
    expect(mail?.subject).toMatch(/fee reminder/i);
    expect(mail?.text).toContain('NPR 10,000');
    expect(mail?.text).toContain(`${PFX}-s3`);
    expect(
      fake.sent.some((m) => m.text.includes(adm.s1) || m.text.includes('Rai')),
    ).toBe(false); // first names only

    const rows = await prisma.feeReminder.findMany({
      where: { runId },
      orderBy: { amount: 'asc' },
    });
    expect(
      rows.map((r) => [
        r.status,
        r.channel,
        r.amount.toNumber(),
        r.studentCount,
        r.error,
      ]),
    ).toEqual([
      ['SENT', 'EMAIL', 10_000, 1, null],
      ['SENT', 'SMS', 20_000, 2, null],
    ]);
  });

  it('does not message the same family twice within the cooldown', async ({
    skip,
  }) => {
    if (blocked) skip();
    const again = (await preview({ classId }).expect(200)).body.data;
    expect(again).toMatchObject({ recipients: 0, canSend: false });
    expect(again.skippedSummary).toEqual({
      NO_CONTACT: 1,
      BELOW_MINIMUM: 1,
      RECENTLY_REMINDED: 3,
    });
    const res = await send({ classId }).expect(200);
    expect(res.body.data).toMatchObject({
      runId: null,
      recipients: 0,
      sent: 0,
    });
    expect(
      (await preview({ classId, cooldownDays: 1 }).expect(200)).body.data
        .recipients,
    ).toBe(0);
    expect(fake.sent).toEqual([]);

    await prisma.feeReminder.updateMany({
      where: { guardianId: { in: [guardian.g1, guardian.g2] } },
      data: { createdAt: new Date(Date.now() - 8 * 86_400_000) },
    });
    expect((await preview({ classId }).expect(200)).body.data.recipients).toBe(
      2,
    ); // a week later, they can be reminded again
  });

  it('records failures, and a failed message can be retried straight away', async ({
    skip,
  }) => {
    if (blocked) skip();
    fake.failing = true;
    const failed = await send({ classId }).expect(200);
    expect(failed.body.data).toMatchObject({
      recipients: 2,
      sent: 0,
      failed: 2,
      total: 0,
    });
    const rows = await prisma.feeReminder.findMany({
      where: { runId: failed.body.data.runId },
    });
    expect(rows.map((r) => [r.status, r.error]).sort()).toEqual([
      ['FAILED', 'gateway down'],
      ['FAILED', 'gateway down'],
    ]);
    expect(fake.sent).toEqual([]);

    fake.failing = false;
    const retry = await send({ classId }).expect(200); // a failure does not start the cooldown
    expect(retry.body.data).toMatchObject({
      recipients: 2,
      sent: 2,
      failed: 0,
    });
    expect(fake.sent).toHaveLength(2);
  });

  it('sends exactly one message to each family when two people press send together', async ({
    skip,
  }) => {
    if (blocked) skip();
    await clearLog();
    const both = await Promise.all([
      send({ classId }),
      send({ classId }, token.acc),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(both.reduce((n, r) => n + (r.body.data.sent as number), 0)).toBe(2);
    expect(fake.sent).toHaveLength(2);
    expect(new Set(fake.sent.map((m) => m.to))).toEqual(
      new Set([PHONE1, MAIL2]),
    );
    expect((await reminders()).filter((r) => r.status === 'SENT')).toHaveLength(
      2,
    );
  });

  it('ignores an abandoned claim after a while, but respects a fresh one', async ({
    skip,
  }) => {
    if (blocked) skip();
    await clearLog();
    const run = await prisma.feeReminderRun.create({
      data: { sentById: userId.acc, minDaysOverdue: 1, cooldownDays: 7 },
    });
    const claim = await prisma.feeReminder.create({
      data: {
        runId: run.id,
        guardianId: guardian.g1,
        channel: 'SMS',
        amount: 20_000,
        studentCount: 2,
        createdAt: new Date(Date.now() - 5 * 60_000),
      },
    });
    const fresh = (await preview({ classId }).expect(200)).body.data;
    expect(fresh.recipients).toBe(1); // g1 is being messaged right now
    expect(fresh.skippedSummary.RECENTLY_REMINDED).toBe(2);
    await prisma.feeReminder.update({
      where: { id: claim.id },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) },
    });
    expect((await preview({ classId }).expect(200)).body.data.recipients).toBe(
      2,
    ); // the old claim has expired
    await clearLog();
  });

  it('lists runs and shows each message without any contact details or names', async ({
    skip,
  }) => {
    if (blocked) skip();
    const list = (await get('/reminders/fees/runs').expect(200)).body.data as {
      id: string;
      sent: number;
      failed: number;
      sentBy: string;
      total: number;
    }[];
    const ours = list.find((r) => r.id === runId);
    expect(ours).toMatchObject({
      sent: 2,
      failed: 0,
      sentBy: 'E2E acc',
      total: 30_000,
      minDaysOverdue: 1,
      cooldownDays: 7,
    });
    const detail = (await get(`/reminders/fees/runs/${runId}`).expect(200)).body
      .data;
    expect(detail.reminders).toHaveLength(2);
    expect(
      detail.reminders.every((r: { status: string }) => r.status === 'SENT'),
    ).toBe(true);
    expect(detail.reminders[0]).toEqual(
      expect.objectContaining({
        guardianId: expect.any(String),
        amount: expect.any(Number),
        studentCount: expect.any(Number),
      }),
    );
    const text = JSON.stringify([list, detail]);
    for (const secret of [PHONE1, PHONE3, MAIL2, PFX, 'Rai'])
      expect(text).not.toContain(secret);
  });

  it('writes only counts to the audit log', async ({ skip }) => {
    if (blocked) skip();
    const logs = await prisma.auditLog.findMany({
      where: { action: 'fee_reminders.sent' },
      orderBy: { occurredAt: 'asc' },
      select: { details: true },
    });
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs[0]?.details).toEqual({
      runId,
      recipients: 2,
      sent: 2,
      failed: 0,
      skipped: 0,
      total: 30_000,
    });
    const text = JSON.stringify(logs.map((l) => l.details));
    for (const secret of [PHONE1, MAIL2, PFX, 'Rai', 'NPR'])
      expect(text).not.toContain(secret);
  });
});
