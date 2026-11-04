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

const PFX = 'E2E-FEE';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-fee-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const code = (suffix: string): string => `T${TAIL}${suffix}`;

describe('Fee foundations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = false;
  const token = { admin: '', reader: '', plain: '' };
  let yearA = '';
  let yearB = '';
  let shortYear = '';
  let c1 = '';
  let c2 = '';
  const head: Record<'TUI' | 'ANN' | 'ADM' | 'UNI' | 'TRN', string> = {
    TUI: '',
    ANN: '',
    ADM: '',
    UNI: '',
    TRN: '',
  };
  let periodsA: {
    id: string;
    sequence: number;
    name: string;
    startDate: string;
    endDate: string;
    dueDate: string;
    dueDateBs: string;
  }[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.admin) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object = {}, t = token.admin) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, body: object, t = token.admin) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, body: object, t = token.admin) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const del = (url: string, t = token.admin) =>
    http().delete(`${V1}${url}`).set(auth(t));
  const structureUrl = (year: string, cls: string): string =>
    `/academic-years/${year}/classes/${cls}/fee-structure`;

  async function cleanup(): Promise<void> {
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.feeStructureLinePeriod.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.feeStructureLine.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.billingPeriod.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.feeHead.deleteMany({
      where: { code: { startsWith: `T${TAIL}` } },
    });
    await prisma.fiscalYear.deleteMany({
      where: { label: { startsWith: PFX } },
    });
  }

  async function makeUser(
    label: keyof typeof token,
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
    await prisma.user.create({
      data: {
        email: email(label),
        fullName: `E2E ${label}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: [{ roleId: role.id }] },
      },
    });
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

    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-fee-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await makeUser('admin', [
      ['fees', 'read'],
      ['fees', 'structure-manage'],
      ['fees', 'fiscal-manage'],
    ]);
    await makeUser('reader', [['fees', 'read']]);
    await makeUser('plain', []);

    blocked =
      (await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: date('2007-12-31') },
          endDate: { gte: date('2005-01-01') },
        },
      })) !== null;
    if (blocked) return;
    const makeYear = async (
      key: 'A' | 'B' | 'S',
      start: string,
      end: string,
    ): Promise<string> =>
      (
        await prisma.academicYear.create({
          data: {
            name: `${PFX}-${RUN}-${key}`,
            startDate: date(start),
            endDate: date(end),
          },
        })
      ).id;
    yearA = await makeYear('A', '2005-04-14', '2006-04-13'); // a BS year starting on Baisakh 1
    yearB = await makeYear('B', '2006-04-14', '2007-04-13');
    shortYear = await makeYear('S', '2007-04-14', '2007-06-30');
    c1 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C1`, sortOrder: 3 },
      })
    ).id;
    c2 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C2`, sortOrder: 4 },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-fee-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires the fee permissions', async () => {
    await get('/fiscal-years', token.plain).expect(403);
    await get('/fee-heads', token.plain).expect(403);
    await post(
      '/fiscal-years',
      { label: 'x', startDate: '2005-07-17', endDate: '2006-07-16' },
      token.reader,
    ).expect(403);
    await post(
      '/fee-heads',
      { code: 'XX', name: 'x', frequency: 'MONTHLY' },
      token.reader,
    ).expect(403);
    await get('/fiscal-years', token.reader).expect(200);
  });

  it('manages fiscal years: exact dates, no overlaps, and BS input', async () => {
    const create = (label: string, body: object, t = token.admin) =>
      post('/fiscal-years', { label: `${PFX}-${label}`, ...body }, t);
    const fy1 = await create('FY1', {
      startDate: '2005-07-17',
      endDate: '2006-07-16',
    }).expect(201);
    expect(fy1.body.data).toMatchObject({
      status: 'OPEN',
      startDate: '2005-07-17',
      endDate: '2006-07-16',
      isCurrent: false,
    });
    expect(fy1.body.data.startDateBs).toEqual(expect.any(String));

    await create('FY1', {
      startDate: '2008-07-17',
      endDate: '2009-07-16',
    }).expect(409); // duplicate label
    await create('Short', {
      startDate: '2009-07-17',
      endDate: '2009-10-16',
    }).expect(400); // not about a year
    await create('Long', {
      startDate: '2009-07-17',
      endDate: '2011-07-16',
    }).expect(400);
    await create('Back', {
      startDate: '2009-07-17',
      endDate: '2009-07-16',
    }).expect(400);
    await create('Both', {
      startDate: '2008-07-17',
      startDateBs: '2065-04-01',
      endDate: '2009-07-16',
    }).expect(400);
    await create('Overlap', {
      startDate: '2006-01-01',
      endDate: '2006-12-31',
    }).expect(409);
    await create('Boundary', {
      startDate: '2006-07-16',
      endDate: '2007-07-15',
    }).expect(409); // sharing the last day
    await create('FY2', {
      startDate: '2006-07-17',
      endDate: '2007-07-16',
    }).expect(201); // the next day is fine
    await create(
      'NoPerm',
      { startDate: '2020-07-17', endDate: '2021-07-16' },
      token.reader,
    ).expect(403);

    const bs = await create('BS', {
      startDateBs: '2064-04-01',
      endDateBs: '2065-03-31',
    }).expect(201); // Shrawan 1 to Chaitra end, in BS
    expect(bs.body.data).toMatchObject({
      startDateBs: '2064-04-01',
      endDateBs: '2065-03-31',
    });
    expect(bs.body.data.startDate).toMatch(/^2007-07-/);

    const race = await Promise.all([
      create('Race1', { startDate: '2010-07-17', endDate: '2011-07-16' }),
      create('Race2', { startDate: '2010-12-01', endDate: '2011-11-30' }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]); // overlapping creations: only one wins
    await expect(
      prisma.fiscalYear.create({
        data: {
          label: `${PFX}-raw`,
          startDate: date('2005-08-01'),
          endDate: date('2006-07-31'),
        },
      }),
    ).rejects.toThrow(); // and the database refuses it even if the service is bypassed

    const list = (await get('/fiscal-years').expect(200)).body.data as {
      label: string;
    }[];
    expect(
      list.filter((f) => f.label.startsWith(PFX)).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('edits open fiscal years and closes them only after they end', async () => {
    const list = (await get('/fiscal-years').expect(200)).body.data as {
      id: string;
      label: string;
    }[];
    const fy1 = list.find((f) => f.label === `${PFX}-FY1`)?.id as string;
    await patch(`/fiscal-years/${fy1}`, {}).expect(400);
    await patch(`/fiscal-years/${fy1}`, { label: `${PFX}-FY1-renamed` }).expect(
      200,
    );
    await patch(`/fiscal-years/${fy1}`, { endDate: '2006-12-31' }).expect(400); // no longer about a year
    await patch(`/fiscal-years/${fy1}`, { endDate: '2006-07-20' }).expect(409); // would overlap FY2
    await patch(`/fiscal-years/${randomUUID()}`, { label: 'x1x' }).expect(404);

    const future = await post('/fiscal-years', {
      label: `${PFX}-Future`,
      startDate: '2100-07-17',
      endDate: '2101-07-16',
    }).expect(201);
    await post(`/fiscal-years/${future.body.data.id}/close`).expect(409); // not over yet
    await post(`/fiscal-years/${fy1}/close`, {}, token.reader).expect(403);
    const closed = await post(`/fiscal-years/${fy1}/close`).expect(200);
    expect(closed.body.data).toMatchObject({ status: 'CLOSED' });
    expect(closed.body.data.closedAt).toEqual(expect.any(String));
    await post(`/fiscal-years/${fy1}/close`).expect(409);
    await patch(`/fiscal-years/${fy1}`, { label: `${PFX}-FY1-again` }).expect(
      409,
    ); // closed years are frozen
  });

  it('ships the starting fee heads and lets the accountant add custom ones', async () => {
    const heads = (await get('/fee-heads').expect(200)).body.data as {
      code: string;
      frequency: string;
      perStudent: boolean;
    }[];
    const seeded = [
      'ADM',
      'REG',
      'TUI',
      'ANN',
      'EXM',
      'LAB',
      'LIB',
      'SPT',
      'TRN',
      'HST',
      'UNI',
      'OTH',
    ];
    for (const c of seeded)
      expect(
        heads.some((h) => h.code === c),
        `missing ${c}: run \`pnpm prisma db seed\``,
      ).toBe(true);
    expect(heads.find((h) => h.code === 'TRN')).toMatchObject({
      perStudent: true,
      frequency: 'MONTHLY',
    });
    expect(heads.find((h) => h.code === 'UNI')).toMatchObject({
      frequency: 'AD_HOC',
    });

    const make = (suffix: string, extra: object = {}) =>
      post('/fee-heads', {
        code: code(suffix).toLowerCase(),
        name: `${PFX} ${suffix}`,
        ...extra,
      });
    head.TUI = (await make('TUI', { frequency: 'MONTHLY' }).expect(201)).body
      .data.id as string;
    head.ANN = (await make('ANN', { frequency: 'YEARLY' }).expect(201)).body
      .data.id as string;
    head.ADM = (await make('ADM', { frequency: 'ONE_TIME' }).expect(201)).body
      .data.id as string;
    head.UNI = (await make('UNI', { frequency: 'AD_HOC' }).expect(201)).body
      .data.id as string;
    head.TRN = (
      await make('TRN', { frequency: 'MONTHLY', perStudent: true }).expect(201)
    ).body.data.id as string;
    expect(
      (await get('/fee-heads').expect(200)).body.data.find(
        (h: { id: string }) => h.id === head.TUI,
      ).code,
    ).toBe(code('TUI')); // stored in capitals

    await make('TUI', { frequency: 'MONTHLY' }).expect(409); // duplicate code
    await make('BAD', { frequency: 'WEEKLY' }).expect(400);
    await make('B A D', { frequency: 'MONTHLY' }).expect(400);
    await make('AH', { frequency: 'AD_HOC', perStudent: true }).expect(400);
    await post('/fee-heads', {
      code: code('X'),
      name: 'x',
      frequency: 'MONTHLY',
    }).expect(400); // name too short
    await patch(`/fee-heads/${head.TUI}`, { code: 'CHANGED' }).expect(400); // the code is fixed
    await patch(`/fee-heads/${head.TUI}`, {
      nameNp: 'मासिक शुल्क',
      sortOrder: 5,
    }).expect(200);
    await patch(`/fee-heads/${head.UNI}`, { perStudent: true }).expect(400);
    await patch(`/fee-heads/${randomUUID()}`, { name: 'xx' }).expect(404);
  });

  it('generates billing periods from BS months, for 10, 11 or 12 months', async ({
    skip,
  }) => {
    if (blocked) skip();
    const base = (year: string): string =>
      `/academic-years/${year}/billing-periods`;
    await post(`${base(yearA)}/generate`, { months: 9 }).expect(400);
    await post(`${base(yearA)}/generate`, { months: 13 }).expect(400);
    await post(`${base(yearA)}/generate`, { months: 12, dueDay: 29 }).expect(
      400,
    );
    await post(`${base(yearA)}/generate`, { months: 12 }, token.reader).expect(
      403,
    );
    await post(`${base(shortYear)}/generate`, { months: 10 }).expect(400); // 2.5 months is too short

    const res = await post(`${base(yearA)}/generate`, {
      months: 12,
      dueDay: 10,
    }).expect(200);
    periodsA = res.body.data;
    expect(periodsA).toHaveLength(12);
    expect(periodsA.map((p) => p.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(periodsA[0]).toMatchObject({ startDate: '2005-04-14' }); // starts on the academic year's first day
    expect(periodsA[0]?.name).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(periodsA[0]).toHaveProperty('nameNp');
    expect(new Set(periodsA.map((p) => p.name)).size).toBe(12);
    for (let i = 1; i < periodsA.length; i++) {
      const prev = periodsA[i - 1] as (typeof periodsA)[number];
      const cur = periodsA[i] as (typeof periodsA)[number];
      expect(
        new Date(`${cur.startDate}T00:00:00Z`).getTime() -
          new Date(`${prev.endDate}T00:00:00Z`).getTime(),
      ).toBe(86_400_000); // back to back
    }
    for (const p of periodsA) {
      expect(p.dueDate >= p.startDate).toBe(true);
      expect(p.endDate <= '2006-04-13').toBe(true);
    }
    expect(
      periodsA[0]?.dueDateBs.endsWith('-10'),
    ).toBe(true);
    await post(`${base(yearA)}/generate`, { months: 12 }).expect(409); // only into an empty year

    const eleven = await post(`${base(yearB)}/generate`, {
      months: 11,
      skipBsMonths: [9],
    }).expect(200); // skip Poush
    expect(eleven.body.data).toHaveLength(11);
    expect(
      (eleven.body.data as { name: string }[]).some((p) =>
        p.name.startsWith('Poush'),
      ),
    ).toBe(false);
    expect(
      (await get(base(yearB), token.reader).expect(200)).body.data,
    ).toHaveLength(11);
    await get(base(randomUUID())).expect(404);
  });

  it('adds, edits and deletes periods by hand without overlaps or gaps in numbering', async ({
    skip,
  }) => {
    if (blocked) skip();
    const base = `/academic-years/${shortYear}/billing-periods`;
    await post(base, {
      name: 'Late',
      startDate: '2007-05-01',
      endDate: '2007-05-31',
      dueDate: '2007-05-10',
    }).expect(201);
    const early = await post(base, {
      name: 'Early',
      startDate: '2007-04-14',
      endDate: '2007-04-30',
      dueDate: '2007-04-20',
    }).expect(201);
    expect(
      (await get(base).expect(200)).body.data.map(
        (p: { name: string; sequence: number }) => [p.name, p.sequence],
      ),
    ).toEqual([
      ['Early', 1],
      ['Late', 2],
    ]); // numbered by date

    await post(base, {
      name: 'Clash',
      startDate: '2007-05-15',
      endDate: '2007-06-15',
      dueDate: '2007-05-20',
    }).expect(409);
    await post(base, {
      name: 'Early',
      startDate: '2007-06-01',
      endDate: '2007-06-30',
      dueDate: '2007-06-10',
    }).expect(409); // duplicate name
    await post(base, {
      name: 'Outside',
      startDate: '2007-07-01',
      endDate: '2007-07-31',
      dueDate: '2007-07-10',
    }).expect(400);
    await post(base, {
      name: 'BadDue',
      startDate: '2007-06-01',
      endDate: '2007-06-30',
      dueDate: '2007-05-30',
    }).expect(400);
    await post(base, {
      name: 'Backwards',
      startDate: '2007-06-30',
      endDate: '2007-06-01',
      dueDate: '2007-06-30',
    }).expect(400);
    await post(base, {
      name: 'Mix',
      startDate: '2007-06-01',
      startDateBs: '2064-02-18',
      endDate: '2007-06-30',
      dueDate: '2007-06-10',
    }).expect(400);
    const june = await post(base, {
      name: 'June',
      startDate: '2007-06-01',
      endDate: '2007-06-30',
      dueDateBs: '2064-02-27',
    }).expect(201);
    expect(june.body.data.dueDate).toMatch(/^2007-06-/);

    await patch(`${base}/${june.body.data.id}`, {}).expect(400);
    await patch(`${base}/${june.body.data.id}`, {
      name: 'June-renamed',
      dueDate: '2007-06-12',
    }).expect(200);
    await patch(`${base}/${june.body.data.id}`, {
      startDate: '2007-05-20',
    }).expect(409); // would overlap Late
    await del(`${base}/${early.body.data.id}`).expect(200);
    expect(
      (await get(base).expect(200)).body.data.map(
        (p: { sequence: number }) => p.sequence,
      ),
    ).toEqual([1, 2]); // renumbered
    await del(`${base}/${randomUUID()}`).expect(404);
    await expect(
      prisma.billingPeriod.create({
        data: {
          academicYearId: shortYear,
          sequence: 77,
          name: 'raw',
          startDate: date('2007-05-10'),
          endDate: date('2007-05-12'),
          dueDate: date('2007-05-11'),
        },
      }),
    ).rejects.toThrow(); // database-level overlap protection
  });

  it('builds a class fee structure and checks every rule', async ({ skip }) => {
    if (blocked) skip();
    const all = periodsA.map((p) => p.id);
    const line = (feeHeadId: string, amount: number, extra: object = {}) => ({
      feeHeadId,
      amount,
      ...extra,
    });
    const setLines = (
      lines: object[],
      t = token.admin,
      cls = c1,
      year = yearA,
    ) => put(structureUrl(year, cls), { lines }, t);

    await setLines(
      [line(head.TUI, 5000, { periodIds: all })],
      token.reader,
    ).expect(403);
    await setLines([line(head.UNI, 500, { periodIds: all })]).expect(400); // ad hoc heads are charged on demand
    await setLines([line(head.TRN, 2000, { periodIds: all })]).expect(400); // per-student heads are assigned, not structured
    await setLines([line(head.TUI, 5000)]).expect(400); // no periods
    await setLines([
      line(head.ADM, 10000, { onAdmission: true, periodIds: all }),
    ]).expect(400); // admission fees have no periods
    await setLines([
      line(head.ADM, 10000, { onAdmission: true, audience: 'CONTINUING' }),
    ]).expect(400);
    await setLines([line(head.TUI, 0, { periodIds: all })]).expect(400);
    await setLines([line(head.TUI, 5000.123, { periodIds: all })]).expect(400);
    await setLines([line(head.TUI, 99_999_999, { periodIds: all })]).expect(
      400,
    );
    await setLines([line(randomUUID(), 5000, { periodIds: all })]).expect(400);
    await setLines([
      line(head.TUI, 5000, { periodIds: [randomUUID()] }),
    ]).expect(400);
    await setLines([
      line(head.TUI, 5000, {
        periodIds: [
          (await get(`/academic-years/${yearB}/billing-periods`).expect(200))
            .body.data[0].id,
        ],
      }),
    ]).expect(400); // a period of another year
    await setLines([
      line(head.TUI, 5000, { periodIds: all }),
      line(head.TUI, 5500, { periodIds: all }),
    ]).expect(400); // same head and audience twice
    await setLines([
      line(head.ANN, 3000, { periodIds: [all[0]] }),
      line(head.ANN, 5000, { onAdmission: true }),
    ]).expect(400); // ALL plus NEW
    await setLines(
      [line(head.TUI, 5000, { periodIds: all })],
      token.admin,
      randomUUID(),
    ).expect(404);
    await setLines(
      [line(head.TUI, 5000, { periodIds: all })],
      token.admin,
      c1,
      randomUUID(),
    ).expect(404);

    const set = await setLines([
      line(head.TUI, 5000, { periodIds: all }), // every month, for everyone
      line(head.ANN, 3000, { audience: 'CONTINUING', periodIds: [all[0]] }), // returning students pay it in the first period
      line(head.ANN, 3333.33, { onAdmission: true }), // new students pay it on admission
      line(head.ADM, 10000, { onAdmission: true }),
    ]).expect(200);
    const data = set.body.data;
    expect(data.lines).toHaveLength(4);
    expect(data.admissionTotal).toBe(13333.33); // exact to the paisa
    expect(data.byPeriod).toHaveLength(12);
    expect(data.byPeriod[0]).toMatchObject({
      sequence: 1,
      forContinuing: 8000,
      forNew: 5000,
    });
    expect(data.byPeriod[5]).toMatchObject({
      forContinuing: 5000,
      forNew: 5000,
    });
    expect(
      data.lines.find(
        (l: { feeHead: { id: string }; audience: string }) =>
          l.feeHead.id === head.ANN && l.audience === 'NEW',
      ),
    ).toMatchObject({ onAdmission: true, periods: [] });
    expect(
      data.lines.find(
        (l: { feeHead: { id: string }; audience: string }) =>
          l.feeHead.id === head.TUI,
      ).periods,
    ).toHaveLength(12);

    // Replacing is complete: nothing from the earlier version lingers.
    await setLines([
      line(head.TUI, 4000, { periodIds: [all[0], all[1]] }),
    ]).expect(200);
    const replaced = (
      await get(structureUrl(yearA, c1), token.reader).expect(200)
    ).body.data;
    expect(replaced.lines).toHaveLength(1);
    expect(replaced.byPeriod.map((p: { forNew: number }) => p.forNew)).toEqual([
      4000, 4000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(
      await prisma.feeStructureLinePeriod.count({
        where: { academicYearId: yearA },
      }),
    ).toBe(2);

    await setLines([
      line(head.TUI, 5000, { periodIds: all }),
      line(head.ANN, 3000, { audience: 'CONTINUING', periodIds: [all[0]] }),
      line(head.ANN, 3333.33, { onAdmission: true }),
      line(head.ADM, 10000, { onAdmission: true }),
    ]).expect(200);
    await setLines(
      [line(head.TUI, 6000, { periodIds: all })],
      token.admin,
      c2,
    ).expect(200); // other classes are independent
    expect(
      (await get(structureUrl(yearA, c1)).expect(200)).body.data.lines,
    ).toHaveLength(4);
    await get(structureUrl(yearA, randomUUID())).expect(404);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'fee_structure.updated', entityId: `${yearA}:${c1}` },
      }),
    ).not.toBeNull();
  });

  it('protects heads and periods that a structure uses', async ({ skip }) => {
    if (blocked) skip();
    await del(`/fee-heads/${head.TUI}`).expect(409);
    await patch(`/fee-heads/${head.TUI}`, { isActive: false }).expect(409);
    await patch(`/fee-heads/${head.TUI}`, { frequency: 'AD_HOC' }).expect(409);
    await patch(`/fee-heads/${head.TUI}`, { perStudent: true }).expect(409);
    await del(
      `/academic-years/${yearA}/billing-periods/${periodsA[0]?.id}`,
    ).expect(409); // used by fee lines
    await del(`/fee-heads/${head.UNI}`).expect(200); // never used: can be deleted
    await del(`/fee-heads/${head.UNI}`).expect(404);
  });

  it('copies a structure into the next year, matching periods by number and raising amounts', async ({
    skip,
  }) => {
    if (blocked) skip();
    const copy = (
      body: object = {},
      dest = yearB,
      source = yearA,
      t = token.admin,
    ) =>
      post(
        `/academic-years/${dest}/fee-structure/copy-from/${source}`,
        body,
        t,
      );
    await copy({}, yearB, yearA, token.reader).expect(403);
    await copy({}, yearA, yearA).expect(400);
    await copy({ adjustPercent: 150 }).expect(400);
    await copy({ adjustPercent: -60 }).expect(400);
    await copy({}, yearB, randomUUID()).expect(404);

    const res = await copy({ classIds: [c1], adjustPercent: 10 }).expect(200);
    // Next year has 11 periods (Poush skipped), so the 12th period of source lines has no counterpart.
    expect(res.body.data).toMatchObject({
      classesCopied: 1,
      classesSkipped: 0,
      lines: 4,
      droppedLines: 0,
    });
    expect(res.body.data.droppedPeriods).toBeGreaterThanOrEqual(1);

    const copied = (await get(structureUrl(yearB, c1)).expect(200)).body.data;
    const amountOf = (headId: string, audience: string): number =>
      copied.lines.find(
        (l: { feeHead: { id: string }; audience: string }) =>
          l.feeHead.id === headId && l.audience === audience,
      ).amount;
    expect(amountOf(head.TUI, 'ALL')).toBe(5500); // +10%
    expect(amountOf(head.ANN, 'CONTINUING')).toBe(3300);
    expect(amountOf(head.ANN, 'NEW')).toBe(3666.66); // 3333.33 x 1.1 = 3666.663, rounded to the paisa
    expect(amountOf(head.ADM, 'NEW')).toBe(11000);
    expect(
      copied.lines.find(
        (l: { feeHead: { id: string } }) => l.feeHead.id === head.TUI,
      ).periods,
    ).toHaveLength(11);
    expect(copied.admissionTotal).toBe(14666.66);

    const again = await copy({ classIds: [c1] }).expect(200);
    expect(again.body.data).toMatchObject({
      classesCopied: 0,
      classesSkipped: 1,
      lines: 0,
    }); // never overwrites an existing structure
    expect((await copy().expect(200)).body.data).toMatchObject({
      classesCopied: 1,
      classesSkipped: 1,
    }); // class 2 had none yet
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'fee_structure.copied', entityId: yearB },
      }),
    ).not.toBeNull();
  });

  it('is read-only once the academic year is closed', async ({ skip }) => {
    if (blocked) skip();
    await prisma.academicYear.update({
      where: { id: yearB },
      data: { status: 'CLOSED' },
    });
    await put(structureUrl(yearB, c1), { lines: [] }).expect(409);
    await post(`/academic-years/${yearB}/billing-periods`, {
      name: 'Late',
      startDate: '2007-04-01',
      endDate: '2007-04-13',
      dueDate: '2007-04-05',
    }).expect(409);
    await patch(`/academic-years/${yearB}/billing-periods/${randomUUID()}`, {
      name: 'xx',
    }).expect(409);
    await post(`/academic-years/${yearA}/fee-structure/copy-from/${yearB}`, {
      classIds: [c2],
    }).expect(200); // a closed year can still be a copy source
    await post(
      `/academic-years/${yearB}/fee-structure/copy-from/${yearA}`,
    ).expect(409);
    await get(structureUrl(yearB, c1)).expect(200);
  });
});
