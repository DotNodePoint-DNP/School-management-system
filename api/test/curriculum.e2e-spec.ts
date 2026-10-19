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

const PFX = 'E2E-CURR';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const name = (n: string): string => `${PFX}-${RUN}-${n}`;
const email = (n: string): string => `e2e-curr-${RUN}-${n}@test.local`;
const code = (n: string): string => `T${String(RUN).slice(-8)}${n}`; // e.g. T12345678A

describe('Classes, subjects and curriculum (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken: string;
  let plainToken: string;
  let hasRealActiveYear = false;
  let c1 = '';
  let c2 = '';
  let s1 = '';
  let s2 = '';
  let s3 = '';
  let p1 = '';
  let p2 = '';

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const V1 = '/api/v1';
  const get = (url: string, token = managerToken) =>
    http().get(`${V1}${url}`).set(auth(token));
  const post = (url: string, body: object = {}, token = managerToken) =>
    http().post(`${V1}${url}`).set(auth(token)).send(body);
  const put = (url: string, body: object, token = managerToken) =>
    http().put(`${V1}${url}`).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = managerToken) =>
    http().patch(`${V1}${url}`).set(auth(token)).send(body);
  const del = (url: string, token = managerToken) =>
    http().delete(`${V1}${url}`).set(auth(token));
  const curriculum = (year: string, cls: string) =>
    `/academic-years/${year}/classes/${cls}/subjects`;

  async function cleanup(): Promise<void> {
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.classSubject.deleteMany({
      where: {
        OR: [
          { academicYearId: { in: yearIds } },
          { schoolClass: { name: { startsWith: PFX } } },
          { subject: { name: { startsWith: PFX } } },
        ],
      },
    });
    await prisma.term.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.section.deleteMany({
      where: { schoolClass: { name: { startsWith: PFX } } },
    });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.subject.deleteMany({ where: { name: { startsWith: PFX } } });
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
    const res = await http()
      .post(`${V1}/auth/login`)
      .send({ identifier: address, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
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
    hasRealActiveYear =
      (await prisma.academicYear.findFirst({
        where: { status: 'ACTIVE', NOT: { name: { startsWith: PFX } } },
      })) !== null;

    const wanted = [
      ['classes', 'read'],
      ['classes', 'manage'],
      ['subjects', 'read'],
      ['subjects', 'manage'],
      ['academic-years', 'read'],
      ['academic-years', 'manage'],
    ].map(([module, action]) => ({
      module: module as string,
      action: action as string,
    }));
    const perms = await prisma.permission.findMany({ where: { OR: wanted } });
    if (perms.length !== wanted.length)
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');
    const role = await prisma.role.create({
      data: {
        name: name('MANAGER'),
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
    });
    await createUser('manager', [role.id]);
    await createUser('plain', []);
    managerToken = await login(email('manager'));
    plainToken = await login(email('plain'));
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: `e2e-curr-${RUN}` } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-${RUN}` } },
    });
    await app.close();
  });

  it('requires the right permissions', async () => {
    await get('/classes', plainToken).expect(403);
    await get('/subjects', plainToken).expect(403);
    await post(
      '/classes',
      { name: name('x'), sortOrder: 1 },
      plainToken,
    ).expect(403);
    await get('/classes').expect(200);
  });

  it('creates classes; sortOrder need not be unique; names are unique ignoring case', async () => {
    c1 = (
      await post('/classes', { name: name('Sci'), sortOrder: 11 }).expect(201)
    ).body.data.id as string;
    c2 = (
      await post('/classes', { name: name('Mgmt'), sortOrder: 11 }).expect(201)
    ).body.data.id as string;
    await post('/classes', {
      name: name('sci').toLowerCase(),
      sortOrder: 12,
    }).expect(409);
    await post('/classes', { name: name('Bad'), sortOrder: 0 }).expect(400);
    await post('/classes', { name: name('Bad'), sortOrder: 1.5 }).expect(400);
  });

  it('lists classes ordered by sortOrder then name', async () => {
    await post('/classes', { name: name('Low'), sortOrder: 1 }).expect(201);
    const res = await get('/classes').expect(200);
    const mine = (
      res.body.data as { name: string; sortOrder: number }[]
    ).filter((c) => c.name.startsWith(`${PFX}-${RUN}`));
    expect(mine.map((c) => c.sortOrder)).toEqual([1, 11, 11]);
    expect(mine.map((c) => c.name.split('-').pop())).toEqual([
      'Low',
      'Mgmt',
      'Sci',
    ]);
  });

  it('manages sections', async () => {
    const created = await post(`/classes/${c1}/sections`, {
      name: 'A',
      capacity: 40,
    }).expect(201);
    expect(created.body.data).toMatchObject({
      name: 'A',
      capacity: 40,
      isActive: true,
    });
    await post(`/classes/${c1}/sections`, { name: 'a' }).expect(409);
    await post(`/classes/${c1}/sections`, { name: 'B', capacity: 0 }).expect(
      400,
    );
    await post(`/classes/${randomUUID()}/sections`, { name: 'A' }).expect(404);
  });

  it('enforces active/inactive rules for classes and sections', async () => {
    const sectionId = (await get(`/classes/${c1}`).expect(200)).body.data
      .sections[0].id as string;

    await patch(`/classes/${c1}`, { isActive: false }).expect(409); // still has an active section
    await patch(`/classes/${c1}/sections/${sectionId}`, {
      isActive: false,
    }).expect(200);
    await patch(`/classes/${c1}`, { isActive: false }).expect(200);
    await post(`/classes/${c1}/sections`, { name: 'B' }).expect(409); // inactive class
    await patch(`/classes/${c1}/sections/${sectionId}`, {
      isActive: true,
    }).expect(409);
    await patch(`/classes/${c1}`, { isActive: true }).expect(200);
    await patch(`/classes/${c1}/sections/${sectionId}`, {
      isActive: true,
    }).expect(200);
  });

  it('deletes only unused classes', async () => {
    await del(`/classes/${c1}`).expect(409); // has a section
    const empty = (
      await post('/classes', { name: name('Empty'), sortOrder: 5 }).expect(201)
    ).body.data.id as string;
    await del(`/classes/${empty}`).expect(200);
    await get(`/classes/${empty}`).expect(404);
  });

  it('creates subjects with normalised codes', async () => {
    const res = await post('/subjects', {
      code: code('a').toLowerCase(),
      name: name('Maths'),
    }).expect(201);
    s1 = res.body.data.id as string;
    expect(res.body.data.code).toBe(code('A'));
    await post('/subjects', { code: code('a'), name: name('Dup') }).expect(409);
    await post('/subjects', { code: '!', name: name('Bad') }).expect(400);
    s2 = (
      await post('/subjects', {
        code: code('B'),
        name: name('Science'),
      }).expect(201)
    ).body.data.id as string;
    s3 = (
      await post('/subjects', { code: code('C'), name: name('Art') }).expect(
        201,
      )
    ).body.data.id as string;

    const found = await get('/subjects')
      .query({ search: code('B') })
      .expect(200);
    expect(found.body.data.map((s: { id: string }) => s.id)).toEqual([s2]);
  });

  it('maintains a per-year curriculum', async () => {
    p1 = (
      await post('/academic-years', {
        name: name('P1'),
        startDate: '2071-04-01',
        endDate: '2072-03-31',
      }).expect(201)
    ).body.data.id as string;
    p2 = (
      await post('/academic-years', {
        name: name('P2'),
        startDate: '2072-04-01',
        endDate: '2073-03-31',
      }).expect(201)
    ).body.data.id as string;

    const first = await put(curriculum(p1, c1), {
      subjects: [{ subjectId: s1 }, { subjectId: s2, isCompulsory: false }],
    }).expect(200);
    expect(
      first.body.data.subjects.map(
        (s: { code: string; isCompulsory: boolean }) => [
          s.code,
          s.isCompulsory,
        ],
      ),
    ).toEqual([
      [code('A'), true],
      [code('B'), false],
    ]);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'curriculum.updated', entityId: `${p1}:${c1}` },
      }),
    ).not.toBeNull();

    const second = await put(curriculum(p1, c1), {
      subjects: [
        { subjectId: s1, isCompulsory: false },
        { subjectId: s2, isCompulsory: false },
        { subjectId: s3 },
      ],
    }).expect(200);
    expect(second.body.data.subjects).toHaveLength(3);
    expect(second.body.data.subjects[0].isCompulsory).toBe(false);

    const third = await put(curriculum(p1, c1), {
      subjects: [
        { subjectId: s1, isCompulsory: false },
        { subjectId: s2, isCompulsory: false },
      ],
    }).expect(200);
    expect(third.body.data.subjects).toHaveLength(2);
    await get(curriculum(p2, c1)).expect(200); // other years are independent
  });

  it('validates curriculum input and references', async () => {
    await put(curriculum(p1, c1), {
      subjects: [{ subjectId: randomUUID() }],
    }).expect(400); // unknown subject
    await put(curriculum(p1, c1), {
      subjects: [{ subjectId: s1 }, { subjectId: s1 }],
    }).expect(400); // duplicate
    await put(curriculum(p1, c1), {
      subjects: [{ subjectId: 'not-a-uuid' }],
    }).expect(400);
    await put(curriculum(p1, randomUUID()), { subjects: [] }).expect(404);
    await put(curriculum(randomUUID(), c1), { subjects: [] }).expect(404);
    await put(curriculum(p1, c1), { subjects: [] }, plainToken).expect(403);
  });

  it('refuses inactive subjects and classes for new mappings', async () => {
    await patch(`/subjects/${s3}`, { isActive: false }).expect(200); // s3 is not mapped any more
    await put(curriculum(p1, c1), {
      subjects: [
        { subjectId: s1, isCompulsory: false },
        { subjectId: s2, isCompulsory: false },
        { subjectId: s3 },
      ],
    }).expect(409);

    await patch(`/classes/${c2}`, { isActive: false }).expect(200);
    await put(curriculum(p1, c2), { subjects: [{ subjectId: s1 }] }).expect(
      409,
    );
  });

  it('blocks retiring or deleting things that are in use', async () => {
    await patch(`/subjects/${s1}`, { isActive: false }).expect(409); // mapped in a planned year
    await del(`/subjects/${s1}`).expect(409);

    const c4 = (
      await post('/classes', { name: name('C4'), sortOrder: 4 }).expect(201)
    ).body.data.id as string;
    await put(curriculum(p1, c4), { subjects: [{ subjectId: s1 }] }).expect(
      200,
    );
    await del(`/classes/${c4}`).expect(409);
    await put(curriculum(p1, c4), { subjects: [] }).expect(200);
    await del(`/classes/${c4}`).expect(200);
  });

  it('copies curriculum between years', async () => {
    const first = await post(
      `/academic-years/${p2}/copy-subjects-from/${p1}`,
    ).expect(200);
    expect(first.body.data).toEqual({
      copied: 2,
      alreadyPresent: 0,
      skippedInactive: 0,
    });
    const again = await post(
      `/academic-years/${p2}/copy-subjects-from/${p1}`,
    ).expect(200);
    expect(again.body.data).toEqual({
      copied: 0,
      alreadyPresent: 2,
      skippedInactive: 0,
    });

    await post(`/academic-years/${p2}/copy-subjects-from/${p2}`).expect(400);
    await post(
      `/academic-years/${p2}/copy-subjects-from/${randomUUID()}`,
    ).expect(404);
    await post(`/academic-years/${p2}/copy-subjects-from/${p1}`, {
      classIds: [c2],
    }).expect(200);
    expect(
      (await get(curriculum(p2, c1)).expect(200)).body.data.subjects,
    ).toHaveLength(2);
  });

  it('keeps closed years read-only but usable as a copy source', async ({
    skip,
  }) => {
    if (hasRealActiveYear) skip(); // a real active year exists; run this against a clean test database

    await put(curriculum(p2, c1), {
      subjects: [{ subjectId: s1, isCompulsory: false }],
    }).expect(200); // drop s2 from year 2
    await post(`/academic-years/${p1}/activate`).expect(200);
    await post(`/academic-years/${p1}/close`).expect(200);

    // s2 is now mapped only in a closed year, so it may be retired.
    await patch(`/subjects/${s2}`, { isActive: false }).expect(200);

    await put(curriculum(p1, c1), { subjects: [] }).expect(409);
    await post(`/academic-years/${p1}/copy-subjects-from/${p2}`).expect(409);

    const result = await post(
      `/academic-years/${p2}/copy-subjects-from/${p1}`,
    ).expect(200);
    expect(result.body.data).toEqual({
      copied: 0,
      alreadyPresent: 1,
      skippedInactive: 1,
    });

    const readable = await get(curriculum(p1, c1)).expect(200);
    expect(readable.body.data.subjects).toHaveLength(2);
  });
});
