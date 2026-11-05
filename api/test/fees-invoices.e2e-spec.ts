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

const PFX = 'E2E-INV';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-inv-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const seq = (number: string): number => Number(number.slice(-6));

type Who = 'admin' | 'reader' | 'plain';
type Key = 's1' | 's2' | 's3' | 's4' | 's5';

describe('Invoice generation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let createdFiscalYear = false;
  let yearPrev = '';
  let yearA = '';
  let classId = '';
  let sectionA = '';
  const head = { TUI: '', ANN: '', ADM: '', UNI: '', TRN: '' };
  let periods: { id: string; name: string; dueDate: string }[] = [];
  const enr = {} as Record<Key, string>;
  const stu = {} as Record<Key, string>;
  const adm = {} as Record<Key, string>;
  let rawCounter = 0;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.admin) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object = {}, t = token.admin) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t = token.admin) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const preview = (body: object, t = token.admin) =>
    post('/invoices/preview', body, t);
  const generate = (body: object, t = token.admin) =>
    post('/invoices/generate', body, t);
  const periodic = (index: number, extra: object = {}) => ({
    kind: 'PERIODIC',
    periodId: periods[index]?.id,
    classId,
    ...extra,
  });
  const admission = (extra: object = {}) => ({
    kind: 'ADMISSION',
    academicYearId: yearA,
    classId,
    ...extra,
  });
  const invoicesOf = (where: object) =>
    prisma.invoice.findMany({
      where,
      orderBy: { number: 'asc' },
      include: { lines: { orderBy: { id: 'asc' } } },
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
    // The only place invoices are ever deleted: a throwaway test database that has opted in.
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
        await tx.invoice.deleteMany({ where: { id: { in: ids } } });
      },
      { timeout: 60_000 },
    );

    await prisma.studentDiscount.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.studentFeeAssignmentPeriod.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.studentFeeAssignment.deleteMany({
      where: { enrollment: { academicYearId: { in: yearIds } } },
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
        "Skipped: this database is not flagged as a test database (see 'The test database needs one flag').";
      console.warn(blocked);
      return;
    }
    await purge();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-inv-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    if (
      (await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: date('2006-04-13') },
          endDate: { gte: date('2004-04-14') },
        },
      })) !== null
    ) {
      blocked =
        'Skipped: the database already has academic years between 2004 and 2006.';
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

    await makeUser('admin', [
      ['fees', 'read'],
      ['fees', 'structure-manage'],
      ['fees', 'assign'],
      ['fees', 'invoice-generate'],
    ]);
    await makeUser('reader', [['fees', 'read']]);
    await makeUser('plain', []);

    yearPrev = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-PREV`,
          startDate: date('2004-04-14'),
          endDate: date('2005-04-13'),
        },
      })
    ).id;
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
    sectionA = (await prisma.section.create({ data: { classId, name: 'A' } }))
      .id;
    const sectionB = (
      await prisma.section.create({ data: { classId, name: 'B' } })
    ).id;

    const makeHead = async (
      suffix: keyof typeof head,
      frequency: 'MONTHLY' | 'YEARLY' | 'ONE_TIME' | 'AD_HOC',
      perStudent = false,
    ): Promise<void> => {
      head[suffix] = (
        await prisma.feeHead.create({
          data: {
            code: `T${TAIL}${suffix}`,
            name: `${PFX} ${suffix}`,
            frequency,
            perStudent,
          },
        })
      ).id;
    };
    await makeHead('TUI', 'MONTHLY');
    await makeHead('ANN', 'YEARLY');
    await makeHead('ADM', 'ONE_TIME');
    await makeHead('UNI', 'AD_HOC');
    await makeHead('TRN', 'MONTHLY', true);

    periods = (
      await post(`/academic-years/${yearA}/billing-periods/generate`, {
        months: 12,
      }).expect(200)
    ).body.data;
    const all = periods.map((p) => p.id);
    await put(`/academic-years/${yearA}/classes/${classId}/fee-structure`, {
      lines: [
        { feeHeadId: head.TUI, amount: 5000, periodIds: all },
        {
          feeHeadId: head.ANN,
          amount: 3000,
          audience: 'CONTINUING',
          periodIds: [all[0]],
        },
        { feeHeadId: head.ANN, amount: 3333.33, onAdmission: true },
        { feeHeadId: head.ADM, amount: 10000, onAdmission: true },
      ],
    }).expect(200);

    const guardian = await prisma.guardian.create({
      data: { firstName: `${PFX}-G`, phone: `+97798${TAIL.slice(0, 8)}` },
    });
    const people: [Key, string, number, 'ENROLLED' | 'WITHDRAWN'][] = [
      ['s1', sectionA, 1, 'ENROLLED'],
      ['s2', sectionA, 2, 'ENROLLED'],
      ['s3', sectionB, 1, 'ENROLLED'],
      ['s4', sectionB, 2, 'ENROLLED'],
      ['s5', sectionB, 3, 'WITHDRAWN'],
    ];
    for (const [key, section, rollNo, status] of people) {
      adm[key] = `E2E-${RUN}-${key}`;
      const student = await prisma.student.create({
        data: {
          admissionNo: adm[key],
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
          guardians: {
            create: [
              {
                guardianId: guardian.id,
                relationship: 'FATHER',
                isPrimary: true,
              },
            ],
          },
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
            rollNo,
            status,
          },
        })
      ).id;
    }
    // s2 was here last year, so s2 is a continuing student; everyone else is new.
    await prisma.enrollment.create({
      data: {
        studentId: stu.s2,
        academicYearId: yearPrev,
        classId,
        sectionId: sectionA,
        rollNo: 1,
        status: 'COMPLETED',
      },
    });

    // s1 takes transport in the first three periods.
    await post(`/enrollments/${enr.s1}/fee-assignments`, {
      feeHeadId: head.TRN,
      amount: 2000,
      periodIds: all.slice(0, 3),
    }).expect(201);
    // s3 has a full tuition exemption and s4 a 10% tuition discount, both approved by someone other than the creator.
    const approved = {
      status: 'APPROVED' as const,
      createdById: userId.admin,
      lastEditedById: userId.admin,
      approvedById: userId.reader,
      approvedAt: new Date(),
    };
    await prisma.studentDiscount.create({
      data: {
        enrollmentId: enr.s3,
        academicYearId: yearA,
        category: 'MANAGEMENT',
        feeHeadId: head.TUI,
        type: 'PERCENT',
        value: 100,
        reason: 'Full management concession',
        ...approved,
      },
    });
    await prisma.studentDiscount.create({
      data: {
        enrollmentId: enr.s4,
        academicYearId: yearA,
        category: 'MERIT_SCHOLARSHIP',
        feeHeadId: head.TUI,
        type: 'PERCENT',
        value: 10,
        reason: 'Merit scholarship award',
        ...approved,
      },
    });
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-inv-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('requires the invoice permissions', async ({ skip }) => {
    if (blocked) skip();
    const body = periodic(0);
    await http().post(`${V1}/invoices/generate`).send(body).expect(401);
    for (const t of [token.plain, token.reader]) {
      await preview(body, t).expect(403);
      await generate(body, t).expect(403);
      await post(
        `/enrollments/${enr.s1}/invoices/ad-hoc`,
        {
          requestKey: randomUUID(),
          lines: [{ feeHeadId: head.UNI, amount: 100 }],
        },
        t,
      ).expect(403);
    }
    await get('/invoices', token.plain).expect(403);
    await get(`/invoices/${randomUUID()}`, token.reader).expect(404);
    await get('/invoices', token.reader).expect(200);
  });

  it('validates what a run is for', async ({ skip }) => {
    if (blocked) skip();
    const p = periods[0]?.id;
    await preview({ kind: 'PERIODIC', periodId: p }).expect(400); // nobody chosen
    await preview({ kind: 'PERIODIC', periodId: p, classId, all: true }).expect(
      400,
    ); // two ways of choosing
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      classId,
      sectionId: sectionA,
    }).expect(400);
    await preview({ kind: 'PERIODIC', classId }).expect(400); // no period
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      academicYearId: yearA,
      classId,
    }).expect(400);
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      classId,
      dueDate: today(),
    }).expect(400); // the period sets the due date
    await preview({ kind: 'ADMISSION', classId }).expect(400); // no academic year
    await preview({
      kind: 'ADMISSION',
      academicYearId: yearA,
      periodId: p,
      classId,
    }).expect(400);
    await preview({ kind: 'SOMETHING', periodId: p, classId }).expect(400);
    await preview({ kind: 'PERIODIC', periodId: randomUUID(), classId }).expect(
      404,
    );
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      classId: randomUUID(),
    }).expect(404);
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      sectionId: randomUUID(),
    }).expect(404);
    await preview({
      kind: 'ADMISSION',
      academicYearId: randomUUID(),
      classId,
    }).expect(404);
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      enrollmentIds: [enr.s1, enr.s5],
    }).expect(404); // s5 has left
    await preview({
      kind: 'PERIODIC',
      periodId: p,
      enrollmentIds: Array.from({ length: 501 }, () => randomUUID()),
    }).expect(400);
    await preview(admission({ dueDate: addDays(today(), -1) })).expect(400);
    await preview({
      ...periodic(0),
      expect: { count: -1, netTotal: 5 },
    }).expect(400);
  });

  it('previews exactly what a periodic run would create, without writing anything', async ({
    skip,
  }) => {
    if (blocked) skip();
    const counter = `invoice:${fiscalYearId}`;
    const before =
      (await prisma.sequence.findUnique({ where: { name: counter } }))?.value ??
      0;
    const res = await preview(periodic(0)).expect(200);
    const p = res.body.data;
    expect(p).toMatchObject({
      kind: 'PERIODIC',
      willCreate: 3,
      gross: 20000,
      discount: 500,
      net: 19500,
      issuedOn: today(),
      dueDate: periods[0]?.dueDate,
    });
    expect(p.fiscalYear.id).toBe(fiscalYearId);
    expect(
      p.students.map((s: { admissionNo: string }) => s.admissionNo),
    ).toEqual([adm.s1, adm.s2, adm.s4]);
    expect(p.students[0]).toMatchObject({ gross: 7000, net: 7000 }); // tuition + transport
    expect(p.students[1]).toMatchObject({ gross: 8000, net: 8000 }); // tuition + the annual fee for returning students
    expect(p.students[2]).toMatchObject({
      gross: 5000,
      discount: 500,
      net: 4500,
    });
    expect(
      p.byHead.map((h: { code: string; net: number }) => [h.code, h.net]),
    ).toEqual([
      [`T${TAIL}ANN`, 3000],
      [`T${TAIL}TRN`, 2000],
      [`T${TAIL}TUI`, 14500],
    ]);
    expect(p.skipped).toEqual([
      expect.objectContaining({
        admissionNo: adm.s3,
        reason: 'FULLY_DISCOUNTED',
      }),
    ]);
    expect(p.skippedSummary).toEqual({ FULLY_DISCOUNTED: 1 });
    expect(p.truncated).toBe(false);

    expect(
      await prisma.invoice.count({ where: { periodId: periods[0]?.id } }),
    ).toBe(0);
    expect(
      (await prisma.sequence.findUnique({ where: { name: counter } }))?.value ??
        0,
    ).toBe(before); // no numbers used
    const bySection = (
      await preview({
        kind: 'PERIODIC',
        periodId: periods[0]?.id,
        sectionId: sectionA,
      }).expect(200)
    ).body.data;
    expect(bySection).toMatchObject({ willCreate: 2, net: 15000 });
    const byIds = (
      await preview({
        kind: 'PERIODIC',
        periodId: periods[0]?.id,
        enrollmentIds: [enr.s4],
      }).expect(200)
    ).body.data;
    expect(byIds).toMatchObject({ willCreate: 1, net: 4500 });
  });

  it('creates the invoices with consecutive numbers, exact amounts and immutable lines', async ({
    skip,
  }) => {
    if (blocked) skip();
    const before =
      (
        await prisma.sequence.findUnique({
          where: { name: `invoice:${fiscalYearId}` },
        })
      )?.value ?? 0;
    const res = await generate({
      ...periodic(0),
      expect: { count: 3, netTotal: 19500 },
    }).expect(200);
    expect(res.body.data).toMatchObject({ created: 3, net: 19500, chunks: 1 });
    expect(res.body.data.skippedSummary).toEqual({ FULLY_DISCOUNTED: 1 });

    const rows = await invoicesOf({ periodId: periods[0]?.id });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => seq(r.number))).toEqual([
      before + 1,
      before + 2,
      before + 3,
    ]); // gapless, in order
    expect(res.body.data.firstNumber).toBe(rows[0]?.number);
    expect(res.body.data.lastNumber).toBe(rows[2]?.number);
    for (const r of rows) {
      expect(r).toMatchObject({
        kind: 'PERIODIC',
        revision: 1,
        fiscalYearId,
        createdById: userId.admin,
        description: periods[0]?.name,
        replacesInvoiceId: null,
        requestKey: null,
      });
      expect(r.issuedOn.toISOString().slice(0, 10)).toBe(today());
      expect(r.dueDate.toISOString().slice(0, 10)).toBe(periods[0]?.dueDate);
      const lineNet = r.lines.reduce(
        (n, l) => n + Math.round(l.netAmount.toNumber() * 100),
        0,
      );
      expect(lineNet).toBe(Math.round(r.netAmount.toNumber() * 100));
      expect(Math.round(r.netAmount.toNumber() * 100)).toBe(
        Math.round(
          (r.grossAmount.toNumber() - r.discountAmount.toNumber()) * 100,
        ),
      );
    }
    const s4 = rows.find((r) => r.studentId === stu.s4);
    expect(s4).toBeDefined();
    expect(s4?.lines).toHaveLength(1);
    expect(s4?.lines[0]).toMatchObject({
      source: 'STRUCTURE',
      descriptionEn: `${PFX} TUI`,
      feeHeadId: head.TUI,
    });
    expect(s4?.lines[0]?.grossAmount.toNumber()).toBe(5000);
    expect(s4?.lines[0]?.lineDiscount.toNumber()).toBe(500);
    expect(s4?.lines[0]?.netAmount.toNumber()).toBe(4500);
    expect(s4?.lines[0]?.lineDiscountId).toEqual(expect.any(String));
    const s1 = rows.find((r) => r.studentId === stu.s1);
    expect(
      s1?.lines.map((l) => [l.source, l.netAmount.toNumber()]).sort(),
    ).toEqual([
      ['ASSIGNMENT', 2000],
      ['STRUCTURE', 5000],
    ]);
    expect(rows.some((r) => r.studentId === stu.s3)).toBe(false); // exempt: no zero-value invoice
    expect(rows.some((r) => r.studentId === stu.s5)).toBe(false); // withdrawn
  });

  it('never creates the same invoice twice', async ({ skip }) => {
    if (blocked) skip();
    const again = await generate(periodic(0)).expect(200);
    expect(again.body.data).toMatchObject({
      created: 0,
      net: 0,
      firstNumber: null,
      lastNumber: null,
    });
    expect(again.body.data.skippedSummary).toEqual({
      ALREADY_INVOICED: 3,
      FULLY_DISCOUNTED: 1,
    });
    expect(
      await prisma.invoice.count({ where: { periodId: periods[0]?.id } }),
    ).toBe(3);

    // Two people pressing the button at the same moment still produce one invoice each.
    const both = await Promise.all([
      generate(periodic(1)),
      generate(periodic(1)),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(both.reduce((n, r) => n + (r.body.data.created as number), 0)).toBe(
      3,
    );
    const rows = await invoicesOf({ periodId: periods[1]?.id });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.number)).size).toBe(3);
    expect(new Set(rows.map((r) => r.studentId)).size).toBe(3);
  });

  it('refuses to generate when the figures changed since the preview', async ({
    skip,
  }) => {
    if (blocked) skip();
    const shown = (await preview(periodic(2)).expect(200)).body.data;
    expect(shown).toMatchObject({ willCreate: 3, net: 16500 }); // 7000 + 5000 + 4500
    // A discount is approved after the preview was looked at.
    await prisma.studentDiscount.create({
      data: {
        enrollmentId: enr.s2,
        academicYearId: yearA,
        category: 'SIBLING',
        feeHeadId: head.TUI,
        type: 'PERCENT',
        value: 10,
        reason: 'Sibling discount for the second child',
        status: 'APPROVED',
        createdById: userId.admin,
        lastEditedById: userId.admin,
        approvedById: userId.reader,
        approvedAt: new Date(),
      },
    });
    const stale = await generate({
      ...periodic(2),
      expect: { count: shown.willCreate, netTotal: shown.net },
    }).expect(409);
    expect(stale.body.error.message).toMatch(/figures changed/);
    expect(
      await prisma.invoice.count({ where: { periodId: periods[2]?.id } }),
    ).toBe(0); // nothing was written

    const fresh = (await preview(periodic(2)).expect(200)).body.data;
    expect(fresh).toMatchObject({ willCreate: 3, net: 16000 });
    const done = await generate({
      ...periodic(2),
      expect: { count: 3, netTotal: 16000 },
    }).expect(200);
    expect(done.body.data.created).toBe(3);
  });

  it('creates admission invoices for new students only, after a preview', async ({
    skip,
  }) => {
    if (blocked) skip();
    const p = (await preview(admission()).expect(200)).body.data;
    expect(p).toMatchObject({
      kind: 'ADMISSION',
      period: null,
      willCreate: 3,
      gross: 39999.99,
      discount: 0,
      net: 39999.99,
      dueDate: today(),
    });
    expect(
      p.students.map((s: { admissionNo: string }) => s.admissionNo),
    ).toEqual([adm.s1, adm.s3, adm.s4]); // s2 returned this year
    expect(p.skippedSummary).toEqual({ NOT_A_NEW_STUDENT: 1 });
    expect(
      p.students[0].lines.map((l: { code: string; net: number }) => [
        l.code,
        l.net,
      ]),
    ).toEqual(
      [
        [`T${TAIL}ADM`, 10000],
        [`T${TAIL}ANN`, 3333.33],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );

    const later = addDays(today(), 14);
    const res = await generate({
      ...admission({ dueDate: later }),
      expect: { count: 3, netTotal: 39999.99 },
    }).expect(200);
    expect(res.body.data).toMatchObject({ created: 3, net: 39999.99 });
    const rows = await invoicesOf({ kind: 'ADMISSION' });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toMatchObject({
        periodId: null,
        description: 'Admission',
        revision: 1,
      });
      expect(r.dueDate.toISOString().slice(0, 10)).toBe(later);
      expect(r.netAmount.toNumber()).toBe(13333.33);
      expect(r.lines).toHaveLength(2);
    }
    const again = await generate(admission()).expect(200);
    expect(again.body.data.skippedSummary).toEqual({
      ALREADY_INVOICED: 3,
      NOT_A_NEW_STUDENT: 1,
    });
    expect(
      await prisma.invoice.count({
        where: { kind: 'ADMISSION', studentId: { in: Object.values(stu) } },
      }),
    ).toBe(3);
  });

  it('creates ad-hoc invoices, safely when a form is sent twice', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = `/enrollments/${enr.s2}/invoices/ad-hoc`;
    const body = (extra: object = {}) => ({
      requestKey: randomUUID(),
      lines: [
        { feeHeadId: head.UNI, amount: 1200, description: 'Shirt, size M' },
        { feeHeadId: head.UNI, amount: 450.5, description: 'Diary' },
      ],
      ...extra,
    });
    await post(url, { ...body(), requestKey: 'not-a-uuid' }).expect(400);
    await post(url, body({ lines: [] })).expect(400);
    await post(
      url,
      body({ lines: [{ feeHeadId: head.TUI, amount: 100 }] }),
    ).expect(400); // regular fees are not ad hoc
    await post(
      url,
      body({ lines: [{ feeHeadId: randomUUID(), amount: 100 }] }),
    ).expect(400);
    await post(
      url,
      body({ lines: [{ feeHeadId: head.UNI, amount: 0 }] }),
    ).expect(400);
    await post(
      url,
      body({ lines: [{ feeHeadId: head.UNI, amount: 10.123 }] }),
    ).expect(400);
    await post(url, body({ dueDate: addDays(today(), -1) })).expect(400);
    await post(`/enrollments/${randomUUID()}/invoices/ad-hoc`, body()).expect(
      404,
    );
    await post(`/enrollments/${enr.s5}/invoices/ad-hoc`, body()).expect(409); // the student left

    const key = randomUUID();
    const first = await post(
      url,
      body({ requestKey: key, description: 'Uniform set' }),
    ).expect(201);
    expect(first.body.data).toMatchObject({ duplicate: false, net: 1650.5 });
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: first.body.data.id },
      include: { lines: true },
    });
    expect(invoice).toMatchObject({
      kind: 'AD_HOC',
      periodId: null,
      description: 'Uniform set',
      requestKey: key,
      enrollmentId: enr.s2,
    });
    expect(invoice.dueDate.toISOString().slice(0, 10)).toBe(today());
    expect(invoice.netAmount.toNumber()).toBe(1650.5);
    expect(
      invoice.lines
        .map((l) => [l.source, l.descriptionEn, l.netAmount.toNumber()])
        .sort(),
    ).toEqual([
      ['MANUAL', 'Diary', 450.5],
      ['MANUAL', 'Shirt, size M', 1200],
    ]);

    const second = await post(url, body({ requestKey: key })).expect(201); // the same form again
    expect(second.body.data).toMatchObject({
      duplicate: true,
      id: first.body.data.id,
      number: first.body.data.number,
    });
    await post(
      `/enrollments/${enr.s1}/invoices/ad-hoc`,
      body({ requestKey: key }),
    ).expect(409); // that key belongs to another student
    const keyTwo = randomUUID();
    const race = await Promise.all([
      post(url, body({ requestKey: keyTwo })),
      post(url, body({ requestKey: keyTwo })),
    ]);
    expect(race.map((r) => r.status)).toEqual([201, 201]);
    expect(new Set(race.map((r) => r.body.data.id)).size).toBe(1);
    expect(race.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
    expect(
      await prisma.invoice.count({
        where: { requestKey: { in: [key, keyTwo] } },
      }),
    ).toBe(2);
  });

  it('lists and shows invoices with their balances', async ({ skip }) => {
    if (blocked) skip();
    const page = await get(
      `/invoices?periodId=${periods[0]?.id}&pageSize=2`,
    ).expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    const all = (
      await get(`/invoices?periodId=${periods[0]?.id}`, token.reader).expect(
        200,
      )
    ).body.data as {
      id: string;
      number: string;
      net: number;
      outstanding: number;
      paid: number;
      adjusted: number;
      status: string;
      overdue: boolean;
      student: { admissionNo: string };
      period: { name: string };
    }[];
    expect(all.map((i) => i.net).sort((a, b) => a - b)).toEqual([
      4500, 7000, 8000,
    ]);
    for (const i of all) {
      expect(i).toMatchObject({
        outstanding: i.net,
        paid: 0,
        adjusted: 0,
        status: 'OPEN',
      });
      expect(i.period.name).toBe(periods[0]?.name);
    }
    expect(all.find((i) => i.student.admissionNo === adm.s4)?.overdue).toBe(
      today() > (periods[0]?.dueDate ?? ''),
    );

    expect(
      (await get(`/invoices?search=${adm.s1}&kind=PERIODIC`).expect(200)).body
        .meta.total,
    ).toBe(3); // s1: periods 1, 2 and 3
    expect(
      (await get(`/invoices?classId=${classId}&kind=ADMISSION`).expect(200))
        .body.meta.total,
    ).toBe(3);
    expect(
      (await get(`/invoices?studentId=${stu.s2}&kind=AD_HOC`).expect(200)).body
        .meta.total,
    ).toBe(2);
    expect(
      (
        await get(
          `/invoices?fiscalYearId=${fiscalYearId}&voided=true&studentId=${stu.s1}`,
        ).expect(200)
      ).body.meta.total,
    ).toBe(0);
    await get('/invoices?kind=WRONG').expect(400);
    await get('/invoices?pageSize=1000').expect(400);

    const detail = (
      await get(
        `/invoices/${all.find((i) => i.student.admissionNo === adm.s1)?.id}`,
      ).expect(200)
    ).body.data;
    expect(detail).toMatchObject({
      kind: 'PERIODIC',
      net: 7000,
      outstanding: 7000,
      void: null,
      adjustments: [],
      replacedBy: null,
      replacesInvoiceId: null,
    });
    expect(
      detail.lines
        .map((l: { net: number }) => l.net)
        .sort((a: number, b: number) => a - b),
    ).toEqual([2000, 5000]);
    expect(detail.issuedOnBs).toEqual(expect.any(String));

    const mine = (await get(`/enrollments/${enr.s2}/invoices`).expect(200)).body
      .data as { kind: string }[];
    expect(mine.map((i) => i.kind).sort()).toEqual([
      'AD_HOC',
      'AD_HOC',
      'PERIODIC',
      'PERIODIC',
      'PERIODIC',
    ]);
    await get(`/enrollments/${randomUUID()}/invoices`).expect(404);
  });

  it('is protected by the database even when the application is bypassed', async ({
    skip,
  }) => {
    if (blocked) skip();
    const line = (net: number) => ({
      feeHeadId: head.UNI,
      descriptionEn: 'x',
      source: 'MANUAL' as const,
      grossAmount: net,
      lineDiscount: 0,
      invoiceDiscountShare: 0,
      netAmount: net,
    });
    const base = (over: object = {}) => ({
      number: `RAW-${RUN}-${++rawCounter}`,
      fiscalYearId,
      kind: 'AD_HOC' as const,
      enrollmentId: enr.s2,
      studentId: stu.s2,
      academicYearId: yearA,
      issuedOn: date(today()),
      dueDate: date(today()),
      grossAmount: 100,
      discountAmount: 0,
      netAmount: 100,
      createdById: userId.admin,
      ...over,
    });

    const ok = await prisma.invoice.create({
      data: { ...base(), lines: { create: [line(100)] } },
    }); // a consistent invoice is accepted
    await expect(
      prisma.invoice.update({
        where: { id: ok.id },
        data: { description: 'changed' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.invoice.delete({ where: { id: ok.id } }),
    ).rejects.toThrow(/append-only/);
    const lineRow = await prisma.invoiceLine.findFirstOrThrow({
      where: { invoiceId: ok.id },
    });
    await expect(
      prisma.invoiceLine.update({
        where: { id: lineRow.id },
        data: { netAmount: 1 },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.invoiceLine.delete({ where: { id: lineRow.id } }),
    ).rejects.toThrow(/append-only/);

    await expect(
      prisma.invoice.create({
        data: { ...base(), lines: { create: [line(90)] } },
      }),
    ).rejects.toThrow(/does not match/); // totals must equal the lines
    await expect(prisma.invoice.create({ data: base() })).rejects.toThrow(); // an invoice must have lines
    await expect(
      prisma.invoice.create({
        data: {
          ...base({ discountAmount: 10 }),
          lines: { create: [line(100)] },
        },
      }),
    ).rejects.toThrow(); // net = gross - discount
    await expect(
      prisma.invoice.create({
        data: {
          ...base({ grossAmount: 0, netAmount: 0 }),
          lines: { create: [] },
        },
      }),
    ).rejects.toThrow(); // no zero-value invoices
    await expect(
      prisma.invoice.create({
        data: {
          ...base({
            number: `RAW-${RUN}-dup`,
            kind: 'PERIODIC',
            periodId: periods[0]?.id,
            enrollmentId: enr.s1,
            studentId: stu.s1,
          }),
          lines: { create: [line(100)] },
        },
      }),
    ).rejects.toThrow(); // already invoiced for that period
    await expect(
      prisma.invoice.create({
        data: {
          ...base({
            kind: 'ADMISSION',
            enrollmentId: enr.s1,
            studentId: stu.s1,
          }),
          lines: { create: [line(100)] },
        },
      }),
    ).rejects.toThrow(); // one admission invoice per student
    await expect(
      prisma.invoice.create({
        data: { ...base({ kind: 'PERIODIC' }), lines: { create: [line(100)] } },
      }),
    ).rejects.toThrow(); // a periodic invoice needs its period
    await expect(
      prisma.invoice.create({
        data: {
          ...base({
            number: (
              await prisma.invoice.findFirstOrThrow({
                where: { periodId: periods[0]?.id },
              })
            ).number,
          }),
          lines: { create: [line(100)] },
        },
      }),
    ).rejects.toThrow(); // numbers are unique
  });

  it('records each run in the audit log with counts only', async ({ skip }) => {
    if (blocked) skip();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'invoice.run', entityId: fiscalYearId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.details).toMatchObject({
      kind: 'PERIODIC',
      created: 3,
      net: 19500,
    });
    expect(JSON.stringify(audit.details)).not.toContain(PFX);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'invoice.created', entityType: 'invoice' },
      }),
    ).not.toBeNull();
  });

  it('refuses to invoice when the fiscal year or the academic year is closed', async ({
    skip,
  }) => {
    if (blocked) skip();
    if (createdFiscalYear) {
      await prisma.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      const refused = await generate(periodic(5)).expect(409);
      expect(refused.body.error.message).toMatch(/closed/);
      await post(`/enrollments/${enr.s1}/invoices/ad-hoc`, {
        requestKey: randomUUID(),
        lines: [{ feeHeadId: head.UNI, amount: 100 }],
      }).expect(409);
      await prisma.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { status: 'OPEN', closedAt: null },
      });
      await expect(
        prisma.fiscalYear.delete({ where: { id: fiscalYearId } }),
      ).rejects.toThrow(); // it has invoices, so it cannot be removed
    }
    await prisma.academicYear.update({
      where: { id: yearA },
      data: { status: 'CLOSED' },
    });
    await generate(periodic(5)).expect(409);
    await preview(admission()).expect(409);
    await post(`/enrollments/${enr.s1}/invoices/ad-hoc`, {
      requestKey: randomUUID(),
      lines: [{ feeHeadId: head.UNI, amount: 100 }],
    }).expect(409);
    await get('/invoices').expect(200); // still readable
    await prisma.academicYear.update({
      where: { id: yearA },
      data: { status: 'PLANNED' },
    });
    expect((await generate(periodic(5)).expect(200)).body.data.created).toBe(2); // s1 has no transport after period 3
  });
});
