import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PFX = 'E2E-ACAD';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const name = (n: string): string => `${PFX}-${RUN}-${n}`;
const email = (n: string): string => `e2e-acad-${RUN}-${n}@test.local`;
const API = '/api/v1/academic-years';

describe('Academic years and terms (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken: string;
  let plainToken: string;
  let hasRealActiveYear = false;
  let yearA = '';
  let yearB = '';
  let term1 = '';

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const asManager = () => bearer(managerToken);

  async function cleanup(): Promise<void> {
    const years = await prisma.academicYear.findMany({ where: { name: { startsWith: PFX } }, select: { id: true } });
    const ids = years.map((y) => y.id);
    await prisma.classSubject.deleteMany({ where: { academicYearId: { in: ids } } });
    await prisma.term.deleteMany({ where: { academicYearId: { in: ids } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: ids } } });
  }

  async function createUser(label: string, roleIds: string[]): Promise<void> {
    await prisma.user.create({
      data: {
        email: email(label),
        fullName: `E2E ${label}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });
  }

  async function login(address: string): Promise<string> {
    const res = await http().post('/api/v1/auth/login').send({ identifier: address, password: PASSWORD }).expect(200);
    return res.body.data.accessToken as string;
  }

  const createYear = (label: string, startDate: string, endDate: string) =>
    http().post(API).set(asManager()).send({ name: name(label), startDate, endDate });

  const createTerm = (yearId: string, label: string, sequence: number, startDate: string, endDate: string) =>
    http().post(`${API}/${yearId}/terms`).set(asManager()).send({ name: label, sequence, startDate, endDate });

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
    hasRealActiveYear =
      (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE', NOT: { name: { startsWith: PFX } } } })) !== null;

    const wanted = ['read', 'manage', 'adjust-dates'].map((action) => ({ module: 'academic-years', action }));
    const perms = await prisma.permission.findMany({ where: { OR: wanted } });
    if (perms.length !== wanted.length) throw new Error('Permissions missing: run `pnpm prisma db seed` first');
    const role = await prisma.role.create({
      data: { name: name('MANAGER'), permissions: { create: perms.map((p) => ({ permissionId: p.id })) } },
    });
    await createUser('manager', [role.id]);
    await createUser('plain', []);
    managerToken = await login(email('manager'));
    plainToken = await login(email('plain'));
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { email: { startsWith: `e2e-acad-${RUN}` } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: `${PFX}-${RUN}` } } });
    await app.close();
  });

  it('requires the academic-years permissions', async () => {
    await http().get(API).set(bearer(plainToken)).expect(403);
    await http().get(API).set(asManager()).expect(200);
    await http()
      .post(API)
      .set(bearer(plainToken))
      .send({ name: name('x'), startDate: '2061-04-01', endDate: '2062-03-31' })
      .expect(403);
  });

  it('creates a year from AD dates and validates the input', async () => {
    const res = await createYear('A', '2061-04-01', '2062-03-31').expect(201);
    yearA = res.body.data.id as string;
    expect(res.body.data).toMatchObject({
      status: 'PLANNED',
      startDate: '2061-04-01',
      endDate: '2062-03-31',
      startDateBs: null, // beyond the supported BS range
      terms: [],
    });

    await http()
      .post(API)
      .set(asManager())
      .send({ name: name('bad1'), startDate: '2061-04-01', startDateBs: '2010-01-01', endDate: '2062-03-31' })
      .expect(400);
    await createYear('bad2', '2062-03-31', '2062-03-31').expect(400);
    await createYear('bad3', '2063-02-30', '2063-12-31').expect(400);
    await createYear('bad4', '2063/04/01', '2063-12-31').expect(400);
    await http().post(API).set(asManager()).send({ name: name('bad5'), startDate: '2063-04-01' }).expect(400);
  });

  it('accepts Bikram Sambat input and returns both calendars', async () => {
    const res = await http()
      .post(API)
      .set(asManager())
      .send({ name: name('BS'), startDateBs: '2010-01-01', endDateBs: '2010-06-15' })
      .expect(201);
    expect(res.body.data.startDateBs).toBe('2010-01-01');
    expect(res.body.data.endDateBs).toBe('2010-06-15');
    expect(res.body.data.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects overlapping years, including sharing a boundary day', async () => {
    await createYear('overlap1', '2061-12-01', '2062-06-30').expect(409);
    await createYear('overlap2', '2062-03-31', '2063-03-31').expect(409);
    const res = await createYear('B', '2062-04-01', '2063-03-31').expect(201);
    yearB = res.body.data.id as string;
  });

  it('lets only one of two simultaneous overlapping creates succeed', async () => {
    const results = await Promise.all([
      createYear('race1', '2065-04-01', '2066-03-31'),
      createYear('race2', '2065-09-01', '2066-08-31'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('manages terms: bounds, overlap, uniqueness and concurrency', async () => {
    const first = await createTerm(yearA, 'First', 1, '2061-04-01', '2061-07-31').expect(201);
    term1 = first.body.data.id as string;
    await createTerm(yearA, 'Second', 2, '2061-08-01', '2061-11-30').expect(201);

    await createTerm(yearA, 'Early', 3, '2061-03-01', '2061-03-31').expect(400); // before the year starts
    await createTerm(yearA, 'Clash', 3, '2061-07-15', '2061-08-15').expect(409); // overlaps terms
    await createTerm(yearA, 'First', 3, '2061-12-01', '2061-12-31').expect(409); // duplicate name
    await createTerm(yearA, 'Third', 2, '2061-12-01', '2061-12-31').expect(409); // duplicate sequence

    const results = await Promise.all([
      createTerm(yearA, 'Race1', 5, '2062-01-01', '2062-01-31'),
      createTerm(yearA, 'Race2', 6, '2062-01-20', '2062-02-28'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('is protected by database constraints even when the service is bypassed', async () => {
    await expect(
      prisma.academicYear.create({
        data: { name: name('raw'), startDate: new Date('2061-05-01T00:00:00Z'), endDate: new Date('2061-06-01T00:00:00Z') },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.term.create({
        data: {
          academicYearId: yearA,
          name: 'raw',
          sequence: 99,
          startDate: new Date('2061-05-01T00:00:00Z'),
          endDate: new Date('2061-05-31T00:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps an active year frozen except through adjust-dates, and audits the adjustment', async ({ skip }) => {
    if (hasRealActiveYear) skip(); // a real active year exists; run this against a clean test database

    await http().post(`${API}/${yearA}/activate`).set(asManager()).expect(200);
    await http().post(`${API}/${yearB}/activate`).set(asManager()).expect(409); // one active at a time
    await http().patch(`${API}/${yearA}`).set(asManager()).send({ startDate: '2061-03-15' }).expect(409);
    await http().patch(`${API}/${yearA}`).set(asManager()).send({ name: name('A-renamed') }).expect(200);
    await http().delete(`${API}/${yearA}`).set(asManager()).expect(409);

    await http().post(`${API}/${yearA}/adjust-dates`).set(asManager()).send({ startDate: '2061-03-15' }).expect(400); // no reason
    await http().post(`${API}/${yearA}/adjust-dates`).set(bearer(plainToken)).send({ startDate: '2061-03-15', reason: 'Extended by the board' }).expect(403);

    const reason = 'Session started two weeks early by decision of the board';
    const res = await http()
      .post(`${API}/${yearA}/adjust-dates`)
      .set(asManager())
      .send({ startDate: '2061-03-15', reason })
      .expect(200);
    expect(res.body.data.startDate).toBe('2061-03-15');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'academic-year.dates_adjusted', entityId: yearA },
    });
    expect(audit?.details).toMatchObject({ reason, before: { startDate: '2061-04-01' }, after: { startDate: '2061-03-15' } });

    await http().post(`${API}/${yearA}/adjust-dates`).set(asManager()).send({ startDate: '2061-05-01', reason }).expect(409); // would strand a term
    await http().post(`${API}/${yearA}/adjust-dates`).set(asManager()).send({ endDate: '2062-04-15', reason }).expect(409); // overlaps year B
  });

  it('blocks every write path on a closed year', async ({ skip }) => {
    if (hasRealActiveYear) skip();

    await http().post(`${API}/${yearA}/close`).set(asManager()).expect(200);
    await http().post(`${API}/${yearA}/close`).set(asManager()).expect(409);
    await http().post(`${API}/${yearA}/activate`).set(asManager()).expect(409);

    await http().patch(`${API}/${yearA}`).set(asManager()).send({ name: name('nope') }).expect(409);
    await http().post(`${API}/${yearA}/adjust-dates`).set(asManager()).send({ endDate: '2062-03-30', reason: 'Trying to edit a closed year' }).expect(409);
    await createTerm(yearA, 'Late', 9, '2062-02-01', '2062-02-15').expect(409);
    await http().patch(`${API}/${yearA}/terms/${term1}`).set(asManager()).send({ name: 'Renamed' }).expect(409);
    await http().delete(`${API}/${yearA}/terms/${term1}`).set(asManager()).expect(409);
    await http().delete(`${API}/${yearA}`).set(asManager()).expect(409);

    // A closed year stays readable, and the next year can now be activated.
    await http().get(`${API}/${yearA}`).set(asManager()).expect(200);
    await http().post(`${API}/${yearB}/activate`).set(asManager()).expect(200);
  });
});