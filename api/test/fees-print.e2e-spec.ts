import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

class FakeStorage {
  files = new Map<string, Buffer>();
  put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
    return Promise.resolve();
  }
  get(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

const PFX = 'E2E-PRT';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-prt-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const LABEL = `${PFX}-${RUN}-Acct`;
const SLOT = `OTHER:${LABEL.toLowerCase()}`;

type Who = 'setup' | 'cashier' | 'signer' | 'principal' | 'reader' | 'plain';
type S = 's1' | 's2' | 's3' | 's4';
const STUDENTS: S[] = ['s1', 's2', 's3', 's4'];

describe('Printing fee documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const storage = new FakeStorage();
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let fiscalYearId = '';
  let yearA = '';
  let classId = '';
  let section = '';
  let emptyClass = '';
  let periods: { id: string }[] = [];
  const stu = {} as Record<S, string>;
  const adm = {} as Record<S, string>;
  const inv = {} as Record<S, string[]>;
  let p1 = '';
  let p2 = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (url: string, body: object, t: string) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const print = (kind: string, body: object, t = token.cashier) =>
    post(`/print/${kind}`, { slots: [SLOT], ...body }, t);

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
        where: { email: { startsWith: 'e2e-prt-' } },
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
        await tx.invoiceVoid.deleteMany({ where: { invoiceId: { in: ids } } });
        await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
        await tx.invoice.deleteMany({ where: { id: { in: ids } } });
      },
      { timeout: 60_000 },
    );
    await prisma.signatory.deleteMany({
      where: { roleLabel: { startsWith: PFX } },
    });
    await prisma.storedFile.deleteMany({
      where: { uploadedById: { in: users } },
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
      .overrideProvider(StorageService)
      .useValue(storage)
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
      where: { email: { startsWith: 'e2e-prt-' } },
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
      ['fees', 'print'],
    ]);
    await makeUser('signer', [
      ['fees', 'read'],
      ['fees', 'print'],
      ['fees', 'print-signed'],
    ]);
    await makeUser('principal', [
      ['fees', 'read'],
      ['fees', 'invoice-void'],
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
    section = (await prisma.section.create({ data: { classId, name: 'A' } }))
      .id;
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
            periodIds: periods.slice(0, 3).map((p) => p.id),
          },
        ],
      },
      token.setup,
    ).expect(200);

    const guardian = await prisma.guardian.create({
      data: {
        firstName: `${PFX}-G`,
        lastName: 'Rai',
        phone: `+97798${TAIL.slice(0, 8)}`,
      },
    });
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
          ...(key === 's1' || key === 's2'
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
    // s4 is enrolled after the invoices exist, so s4 owes nothing.
    await prisma.enrollment.updateMany({
      where: { studentId: stu.s4 },
      data: { status: 'WITHDRAWN', statusChangedOn: date('2005-04-20') },
    });
    for (const p of periods.slice(0, 3))
      await post(
        '/invoices/generate',
        { kind: 'PERIODIC', periodId: p.id, classId },
        token.cashier,
      ).expect(200);
    await prisma.enrollment.updateMany({
      where: { studentId: stu.s4 },
      data: { status: 'ENROLLED', statusChangedOn: null },
    });
    for (const key of STUDENTS)
      inv[key] = (
        await prisma.invoice.findMany({
          where: { studentId: stu[key] },
          orderBy: { dueDate: 'asc' },
        })
      ).map((r) => r.id);

    p1 = (
      await post(
        '/payments',
        {
          idempotencyKey: randomUUID(),
          amount: 6000,
          method: 'CASH',
          autoAllocate: { studentIds: [stu.s1] },
        },
        token.cashier,
      ).expect(201)
    ).body.data.id;
    p2 = (
      await post(
        '/payments',
        {
          idempotencyKey: randomUUID(),
          amount: 2000,
          method: 'BANK_TRANSFER',
          reference: `TXN-${RUN}-P`,
          autoAllocate: { studentIds: [stu.s2] },
        },
        token.cashier,
      ).expect(201)
    ).body.data.id;
    await post(
      `/invoices/${inv.s3[2]}/void`,
      { reason: 'Issued twice by mistake, see ledger' },
      token.principal,
    ).expect(200);

    // The accountant's signature, held by a unique role so it cannot clash with a real one.
    const image = await sharp({
      create: {
        width: 200,
        height: 80,
        channels: 4,
        background: { r: 0, g: 0, b: 90, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const objectKey = `school/signature/${randomUUID()}.png`;
    await storage.put(objectKey, image);
    const file = await prisma.storedFile.create({
      data: {
        kind: 'SIGNATURE',
        objectKey,
        contentType: 'image/png',
        sizeBytes: image.length,
        width: 200,
        height: 80,
        sha256: 'a'.repeat(64),
        uploadedById: userId.signer,
      },
    });
    await prisma.signatory.create({
      data: {
        role: 'OTHER',
        roleLabel: LABEL,
        slot: SLOT,
        fullNameEn: `${PFX} Accountant`,
        designationEn: 'Accountant',
        mode: 'DIGITAL',
        signatureFileId: file.id,
        validFrom: date('2000-01-01'),
      },
    });
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-prt-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('needs the print permission for every document', async ({ skip }) => {
    if (blocked) skip();
    await http()
      .post(`${V1}/print/receipts`)
      .send({ paymentIds: [p1] })
      .expect(401);
    for (const t of [token.plain, token.reader]) {
      await print('receipts', { paymentIds: [p1] }, t).expect(403);
      await print('invoices', { invoiceIds: [inv.s1[0]] }, t).expect(403);
      await print('statements', { studentIds: [stu.s1] }, t).expect(403);
      await print('fee-vouchers', { studentIds: [stu.s1] }, t).expect(403);
    }
  });

  it('validates what is asked for', async ({ skip }) => {
    if (blocked) skip();
    await print('receipts', { paymentIds: [] }).expect(400);
    await print('receipts', {
      paymentIds: Array.from({ length: 51 }, () => randomUUID()),
    }).expect(400);
    await print('receipts', { paymentIds: [p1, p1] }).expect(400);
    await print('receipts', { paymentIds: ['nope'] }).expect(400);
    await print('receipts', { paymentIds: [randomUUID()] }).expect(404);
    await print('receipts', { paymentIds: [p1], slots: ['KING'] }).expect(400);
    await print('receipts', { paymentIds: [p1], signatures: 'maybe' }).expect(
      400,
    );
    await print('invoices', { invoiceIds: [randomUUID()] }).expect(404);
    await print('invoices', {
      invoiceIds: Array.from({ length: 101 }, () => randomUUID()),
    }).expect(400);
    await print('statements', {
      studentIds: Array.from({ length: 21 }, () => randomUUID()),
    }).expect(400);
    await print('statements', {
      studentIds: [stu.s1],
      from: '2026-13-40',
    }).expect(400);
    await print('statements', { studentIds: [randomUUID()] }).expect(404);
    await print('fee-vouchers', {}).expect(400); // no selector
    await print('fee-vouchers', { classId, all: true }).expect(400); // two selectors
    await print('fee-vouchers', {
      classId: randomUUID(),
      academicYearId: yearA,
    }).expect(404);
    await print('fee-vouchers', { classId, minOutstanding: -1 }).expect(400);
    await print('fee-vouchers', { classId, order: 'RANDOM' }).expect(400);
  });

  it('prints receipts with the school header, marking the first print original and the rest duplicate', async ({
    skip,
  }) => {
    if (blocked) skip();
    const first = await print('receipts', { paymentIds: [p1, p2] }).expect(200);
    expect(first.headers['cache-control']).toContain('no-store');
    const b = first.body.data;
    expect(b).toMatchObject({
      kind: 'RECEIPT',
      schemaVersion: 1,
      issuedOn: { ad: today() },
      skipped: [],
    });
    expect(b.school.nameEn).toEqual(expect.any(String));
    expect(b.language).toMatchObject({ mode: expect.any(String) });
    expect(
      b.documents.map((d: { total: number; method: string }) => [
        d.total,
        d.method,
      ]),
    ).toEqual([
      [6000, 'CASH'],
      [2000, 'BANK_TRANSFER'],
    ]);
    expect(
      b.documents.map((d: { copy: { kind: string } }) => d.copy.kind),
    ).toEqual(['ORIGINAL', 'ORIGINAL']);
    expect(b.documents[0]).toMatchObject({
      amountInWords: 'Rupees Six Thousand Only',
      status: 'ACTIVE',
    });
    expect(b.documents[0]).not.toHaveProperty('note'); // internal notes are never printed

    const again = (await print('receipts', { paymentIds: [p1] }).expect(200))
      .body.data;
    expect(again.documents[0].copy).toEqual({ kind: 'DUPLICATE', number: 2 });
  });

  it('shows the signature image only to people allowed to print signed documents', async ({
    skip,
  }) => {
    if (blocked) skip();
    const unsigned = (await print('receipts', { paymentIds: [p2] }).expect(200))
      .body.data;
    expect(unsigned.signatories).toEqual([
      expect.objectContaining({ slot: SLOT, mode: 'LINE', assetKey: null }),
    ]);
    expect(
      Object.keys(unsigned.assets).filter((k) => k.startsWith('sig:')),
    ).toEqual([]);
    expect(unsigned.warnings.join(' ')).toMatch(
      /Digital signatures are only included/,
    );

    const signed = (
      await print('receipts', { paymentIds: [p2] }, token.signer).expect(200)
    ).body.data;
    expect(signed.signatories[0]).toMatchObject({
      slot: SLOT,
      mode: 'DIGITAL',
      assetKey: `sig:${SLOT}`,
      nameEn: `${PFX} Accountant`,
      designationEn: 'Accountant',
    });
    expect(signed.assets[`sig:${SLOT}`]).toMatch(/^data:image\/png;base64,/);

    const forced = (
      await print(
        'receipts',
        { paymentIds: [p2], signatures: 'line' },
        token.signer,
      ).expect(200)
    ).body.data;
    expect(forced.signatories[0]).toMatchObject({
      mode: 'LINE',
      assetKey: null,
    });
    expect(forced.warnings.join(' ')).not.toMatch(
      /Digital signatures are only included/,
    );
  });

  it('prints invoices with their balance, void and duplicate marks', async ({
    skip,
  }) => {
    if (blocked) skip();
    const b = (
      await print('invoices', {
        invoiceIds: [inv.s1[0], inv.s1[1], inv.s3[2]],
      }).expect(200)
    ).body.data;
    expect(b).toMatchObject({ kind: 'INVOICE', issuedOn: { ad: today() } });
    const [paid, partial, voided] = b.documents;
    expect(paid).toMatchObject({
      status: 'PAID',
      net: 5000,
      copy: { kind: 'ORIGINAL', number: 1 },
      replaces: null,
      kind: 'PERIODIC',
      className: `${PFX}-${RUN}-C`,
      sectionName: 'A',
      rollNo: 1,
    });
    expect(paid.balance).toMatchObject({
      paid: 5000,
      adjusted: 0,
      outstanding: 0,
      asOf: today(),
    });
    expect(paid.lines).toEqual([
      expect.objectContaining({ gross: 5000, discount: 0, net: 5000 }),
    ]);
    expect(partial).toMatchObject({ status: 'PARTIAL', overdue: true });
    expect(partial.balance).toMatchObject({ paid: 1000, outstanding: 4000 });
    expect(voided).toMatchObject({
      status: 'VOID',
      balance: { outstanding: 0 },
    });
    expect(paid.issuedOn.bs).toEqual(expect.any(String));
    expect(paid.student).toMatchObject({ admissionNo: adm.s1 });

    const again = (
      await print('invoices', { invoiceIds: [inv.s1[0]] }).expect(200)
    ).body.data;
    expect(again.documents[0].copy).toEqual({ kind: 'DUPLICATE', number: 2 });
    const race = await Promise.all([
      print('invoices', { invoiceIds: [inv.s2[0]] }),
      print('invoices', { invoiceIds: [inv.s2[0]] }),
    ]);
    expect(race.map((r) => r.body.data.documents[0].copy.kind).sort()).toEqual([
      'DUPLICATE',
      'ORIGINAL',
    ]); // two clicks, one original
  });

  it('prints statements with a running balance', async ({ skip }) => {
    if (blocked) skip();
    const b = (
      await print('statements', {
        studentIds: [stu.s2, stu.s1],
        from: today(),
        to: today(),
      }).expect(200)
    ).body.data;
    expect(b).toMatchObject({ kind: 'STATEMENT' });
    expect(
      b.documents.map(
        (d: { student: { admissionNo: string } }) => d.student.admissionNo,
      ),
    ).toEqual([adm.s2, adm.s1]); // in the order asked
    expect(b.documents[0]).toMatchObject({
      openingBalance: 0,
      closingBalance: 13_000,
      totals: { invoiced: 15_000, payments: 2000 },
    });
    expect(b.documents[1].closingBalance).toBe(9000);
    expect(b.documents[0].entries.at(-1).balance).toBe(13_000);
  });

  it('prints dues notices for a class, with ageing, and never leaks other students', async ({
    skip,
  }) => {
    if (blocked) skip();
    const res = (
      await print('fee-vouchers', { classId, academicYearId: yearA }).expect(
        200,
      )
    ).body.data;
    expect(res.kind).toBe('FEE_VOUCHER');
    expect(
      res.documents.map(
        (d: {
          student: { admissionNo: string };
          totals: { outstanding: number };
        }) => [d.student.admissionNo, d.totals.outstanding],
      ),
    ).toEqual([
      [adm.s1, 9000],
      [adm.s2, 13_000],
      [adm.s3, 10_000],
    ]); // roll order; s4 owes nothing
    expect(res.warnings.join(' ')).toMatch(/1 student\(s\) owe nothing/);
    const s1 = res.documents[0];
    expect(s1).toMatchObject({
      rollNo: 1,
      className: `${PFX}-${RUN}-C`,
      sectionName: 'A',
      guardianName: `${PFX}-G Rai`,
      credit: 0,
      totals: { outstanding: 9000, overdue: 9000, notYetDue: 0 },
    });
    expect(
      s1.invoices.map(
        (i: { net: number; paid: number; outstanding: number }) => [
          i.net,
          i.paid,
          i.outstanding,
        ],
      ),
    ).toEqual([
      [5000, 1000, 4000],
      [5000, 0, 5000],
    ]);
    expect(s1.buckets).toMatchObject({ CURRENT: 0, D90_PLUS: 9000 }); // the 2005 due dates are long past
    expect(s1.invoices[0].dueDateBs).toEqual(expect.any(String));
    expect(res.documents[2].guardianName).toBeNull();
    expect(res.documents[2].invoices).toHaveLength(2); // the voided invoice is not listed

    const biggest = (
      await print('fee-vouchers', {
        classId,
        academicYearId: yearA,
        order: 'AMOUNT',
      }).expect(200)
    ).body.data;
    expect(
      biggest.documents.map(
        (d: { student: { admissionNo: string } }) => d.student.admissionNo,
      ),
    ).toEqual([adm.s2, adm.s3, adm.s1]);
    const big = (
      await print('fee-vouchers', {
        classId,
        academicYearId: yearA,
        minOutstanding: 10_000,
      }).expect(200)
    ).body.data;
    expect(
      big.documents.map(
        (d: { student: { admissionNo: string } }) => d.student.admissionNo,
      ),
    ).toEqual([adm.s2, adm.s3]);
    const none = (
      await print('fee-vouchers', {
        classId,
        academicYearId: yearA,
        onlyOverdue: true,
        minOutstanding: 99_999,
      }).expect(200)
    ).body.data;
    expect(none.documents).toEqual([]);

    const bySection = (
      await print('fee-vouchers', {
        sectionId: section,
        academicYearId: yearA,
      }).expect(200)
    ).body.data;
    expect(bySection.documents).toHaveLength(3);
    const byIds = (
      await print('fee-vouchers', { studentIds: [stu.s2] }).expect(200)
    ).body.data;
    expect(byIds.documents).toHaveLength(1);
    const everyone = (await print('fee-vouchers', { all: true }).expect(200))
      .body.data;
    expect(everyone.documents.length).toBeGreaterThanOrEqual(3);
  });

  it('prints nothing for a class with no students, instead of everyone', async ({
    skip,
  }) => {
    if (blocked) skip();
    const res = (
      await print('fee-vouchers', {
        classId: emptyClass,
        academicYearId: yearA,
      }).expect(200)
    ).body.data;
    expect(res.documents).toEqual([]);
    expect(
      (await print('fee-vouchers', { studentIds: [stu.s4] }).expect(200)).body
        .documents,
    ).toEqual([]); // s4 owes nothing
  });

  it('records what was printed without names or amounts', async ({ skip }) => {
    if (blocked) skip();
    const batches = await prisma.auditLog.findMany({
      where: { action: 'fees.documents_printed' },
      select: { details: true },
    });
    expect(batches.map((b) => (b.details as { kind: string }).kind)).toEqual(
      expect.arrayContaining(['STATEMENT', 'FEE_VOUCHER']),
    );
    const copies = await prisma.auditLog.findMany({
      where: { action: 'invoice.printed', entityId: inv.s1[0] },
      orderBy: { occurredAt: 'asc' },
      select: { details: true },
    });
    expect(copies.map((c) => c.details)).toEqual([{ copy: 1 }, { copy: 2 }]);
    const text = JSON.stringify([
      batches.map((b) => b.details),
      copies.map((c) => c.details),
    ]);
    for (const secret of [PFX, 'Rai', `TXN-${RUN}`])
      expect(text).not.toContain(secret);
  });
});
