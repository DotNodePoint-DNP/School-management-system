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

const PFX = 'E2E-EXS';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-exs-${RUN}-${n}@test.local`;

const BANDS = [
  {
    grade: 'A',
    minPercent: 80,
    gradePoint: 4,
    description: 'Excellent',
    isPass: true,
  },
  {
    grade: 'B',
    minPercent: 50,
    gradePoint: 3,
    description: 'Good',
    isPass: true,
  },
  {
    grade: 'C',
    minPercent: 35,
    gradePoint: 2,
    description: 'Basic',
    isPass: true,
  },
  {
    grade: 'NG',
    minPercent: 0,
    gradePoint: 0,
    description: 'Not graded',
    isPass: false,
  },
];

describe('Exam setup (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken = '';
  let plainToken = '';
  let hasRealActiveYear = false;
  let originalDefaultId: string | null = null;
  let yearId = '';
  let otherYearId = '';
  let termId = '';
  let otherTermId = '';
  let classId = '';
  let subjMaths = '';
  let subjElective = '';
  let subjOutside = '';
  let scaleA = '';
  let e1 = '';
  let e2 = '';
  let e3 = '';

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = adminToken) =>
    http().get(`${V1}${url}`).set(auth(token));
  const post = (url: string, body: object = {}, token = adminToken) =>
    http().post(`${V1}${url}`).set(auth(token)).send(body);
  const put = (url: string, body: object, token = adminToken) =>
    http().put(`${V1}${url}`).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = adminToken) =>
    http().patch(`${V1}${url}`).set(auth(token)).send(body);
  const del = (url: string, token = adminToken) =>
    http().delete(`${V1}${url}`).set(auth(token));

  const setupUrl = (exam: string): string =>
    `/exams/${exam}/classes/${classId}/subjects`;
  const policyUrl = (year = yearId): string =>
    `/academic-years/${year}/classes/${classId}/result-policy`;
  const curriculumUrl = (): string =>
    `/academic-years/${yearId}/classes/${classId}/subjects`;
  const newExam = (
    label: string,
    sequence: number,
    extra: object = {},
    year = yearId,
  ) =>
    post(`/academic-years/${year}/exams`, {
      name: `${PFX}-${RUN}-${label}`,
      sequence,
      ...extra,
    });

  async function cleanup(): Promise<void> {
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.resultComponent.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.resultPolicy.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.examSubject.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.exam.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.classSubject.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.term.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.subject.deleteMany({ where: { name: { startsWith: PFX } } });
    // Put the default back before removing test scales, so a default always exists.
    if (originalDefaultId) {
      await prisma.gradeScale.updateMany({
        where: { isDefault: true, id: { not: originalDefaultId } },
        data: { isDefault: false },
      });
      await prisma.gradeScale.update({
        where: { id: originalDefaultId },
        data: { isDefault: true },
      });
    }
    await prisma.gradeScale.deleteMany({
      where: { name: { startsWith: PFX } },
    });
  }

  async function makeUser(
    label: string,
    permissions: [string, string][],
  ): Promise<string> {
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

    originalDefaultId =
      (
        await prisma.gradeScale.findFirst({
          where: { isDefault: true },
          select: { id: true },
        })
      )?.id ?? null;
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-exs-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    hasRealActiveYear =
      (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' } })) !==
      null;

    adminToken = await makeUser('admin', [
      ['exams', 'read'],
      ['exams', 'manage'],
      ['subjects', 'manage'],
    ]);
    plainToken = await makeUser('plain', []);

    const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y1`,
          startDate: date('2101-04-01'),
          endDate: date('2102-03-31'),
        },
      })
    ).id;
    otherYearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y2`,
          startDate: date('2103-04-01'),
          endDate: date('2104-03-31'),
        },
      })
    ).id;
    termId = (
      await prisma.term.create({
        data: {
          academicYearId: yearId,
          name: 'First',
          sequence: 1,
          startDate: date('2101-04-01'),
          endDate: date('2101-07-31'),
        },
      })
    ).id;
    otherTermId = (
      await prisma.term.create({
        data: {
          academicYearId: otherYearId,
          name: 'First',
          sequence: 1,
          startDate: date('2103-04-01'),
          endDate: date('2103-07-31'),
        },
      })
    ).id;
    classId = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C`, sortOrder: 9 },
      })
    ).id;
    const subject = async (letter: string, label: string): Promise<string> =>
      (
        await prisma.subject.create({
          data: { code: `X${TAIL}${letter}`, name: `${PFX}-${RUN}-${label}` },
        })
      ).id;
    subjMaths = await subject('M', 'Maths');
    subjElective = await subject('P', 'Computer');
    subjOutside = await subject('X', 'Music');
    await prisma.classSubject.createMany({
      data: [
        {
          academicYearId: yearId,
          classId,
          subjectId: subjMaths,
          isCompulsory: true,
        },
        {
          academicYearId: yearId,
          classId,
          subjectId: subjElective,
          isCompulsory: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-exs-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires the exams permissions', async () => {
    await get('/grade-scales', plainToken).expect(403);
    await get(`/academic-years/${yearId}/exams`, plainToken).expect(403);
    await post(
      `/academic-years/${yearId}/exams`,
      { name: 'x', sequence: 1 },
      plainToken,
    ).expect(403);
    await get('/grade-scales').expect(200);
  });

  it('ships a default grade scale with the 8-band table', async () => {
    const scales = (await get('/grade-scales').expect(200)).body.data as {
      isDefault: boolean;
      bands: {
        grade: string;
        minPercent: number;
        gradePoint: number;
        isPass: boolean;
      }[];
    }[];
    const standard = scales.find((s) => s.isDefault);
    expect(
      standard,
      'no default grade scale: run `pnpm prisma db seed`',
    ).toBeDefined();
    expect(
      standard?.bands.map((b) => [b.grade, b.minPercent, b.gradePoint]),
    ).toEqual([
      ['A+', 90, 4],
      ['A', 80, 3.6],
      ['B+', 70, 3.2],
      ['B', 60, 2.8],
      ['C+', 50, 2.4],
      ['C', 40, 2],
      ['D', 35, 1.6],
      ['NG', 0, 0],
    ]);
    expect(standard?.bands.at(-1)?.isPass).toBe(false);
  });

  it('validates grade scales', async () => {
    const create = (bands: object[], name = `${PFX}-${RUN}-bad`) =>
      post('/grade-scales', { name, bands });
    await create(BANDS.slice(0, 3)).expect(400); // nothing starts at 0%
    await create([
      ...BANDS,
      {
        grade: 'A',
        minPercent: 90,
        gradePoint: 4,
        description: 'Dup letter',
        isPass: true,
      },
    ]).expect(400);
    await create([
      ...BANDS,
      {
        grade: 'X',
        minPercent: 80,
        gradePoint: 4,
        description: 'Dup start',
        isPass: true,
      },
    ]).expect(400);
    await create(
      BANDS.map((b) => (b.grade === 'A' ? { ...b, gradePoint: 1 } : b)),
    ).expect(400); // better marks, fewer points
    await create(
      BANDS.map((b) =>
        b.grade === 'NG'
          ? { ...b, isPass: true }
          : b.grade === 'C'
            ? { ...b, isPass: false }
            : b,
      ),
    ).expect(400);
    await create(
      BANDS.map((b) => (b.grade === 'B' ? { ...b, minPercent: 50.123 } : b)),
    ).expect(400);
    await create(
      BANDS.map((b) => (b.grade === 'A' ? { ...b, minPercent: 101 } : b)),
    ).expect(400);
    await create([BANDS[3]]).expect(400); // needs at least two bands
    await create(BANDS, 'x').expect(400);
  });

  it('creates, reads, replaces, copies and deletes grade scales', async () => {
    const created = await post('/grade-scales', {
      name: `${PFX}-${RUN}-A`,
      bands: BANDS,
    }).expect(201);
    scaleA = created.body.data.id as string;
    expect(created.body.data.isDefault).toBe(false);
    expect(
      created.body.data.bands.map(
        (b: { grade: string; belowPercent: number | null }) => [
          b.grade,
          b.belowPercent,
        ],
      ),
    ).toEqual([
      ['A', null],
      ['B', 80],
      ['C', 50],
      ['NG', 35],
    ]);
    await post('/grade-scales', {
      name: `${PFX}-${RUN}-A`,
      bands: BANDS,
    }).expect(409);
    await get(`/grade-scales/${randomUUID()}`).expect(404);

    const replaced = await put(`/grade-scales/${scaleA}`, {
      name: `${PFX}-${RUN}-A2`,
      bands: BANDS.map((b) => (b.grade === 'C' ? { ...b, minPercent: 40 } : b)),
    }).expect(200);
    expect(replaced.body.data.name).toBe(`${PFX}-${RUN}-A2`);
    expect(
      replaced.body.data.bands.find((b: { grade: string }) => b.grade === 'C')
        .minPercent,
    ).toBe(40);

    const copy = await post(`/grade-scales/${scaleA}/copy`, {
      name: `${PFX}-${RUN}-Copy`,
    }).expect(201);
    expect(copy.body.data.bands).toHaveLength(4);
    await post(`/grade-scales/${scaleA}/copy`, {
      name: `${PFX}-${RUN}-Copy`,
    }).expect(409);
    await del(`/grade-scales/${copy.body.data.id}`).expect(200);
    await del(`/grade-scales/${copy.body.data.id}`).expect(404);
  });

  it('keeps exactly one default grade scale', async () => {
    const defaults = async (): Promise<string[]> =>
      (
        (await get('/grade-scales').expect(200)).body.data as {
          id: string;
          isDefault: boolean;
        }[]
      )
        .filter((s) => s.isDefault)
        .map((s) => s.id);
    try {
      await post(`/grade-scales/${scaleA}/set-default`).expect(200);
      expect(await defaults()).toEqual([scaleA]);
      await del(`/grade-scales/${scaleA}`).expect(409); // the default cannot be deleted
    } finally {
      if (originalDefaultId)
        await post(`/grade-scales/${originalDefaultId}/set-default`).expect(
          200,
        );
    }
    if (originalDefaultId)
      expect(await defaults()).toEqual([originalDefaultId]);
  });

  it('creates exams with unique names, sequences and a single final exam', async () => {
    const first = await newExam('E1', 1, { termId }).expect(201);
    e1 = first.body.data.id as string;
    expect(first.body.data).toMatchObject({
      status: 'DRAFT',
      isFinal: false,
      term: { id: termId },
      subjectSetupCount: 0,
    });

    await newExam('E1', 9).expect(409); // duplicate name
    await newExam('Dup', 1).expect(409); // duplicate sequence
    await newExam('BadTerm', 8, { termId: otherTermId }).expect(400); // a term of another year
    await newExam('E2', 2).then((r) => {
      e2 = r.body.data.id as string;
    });
    e3 = (await newExam('Final', 3, { isFinal: true }).expect(201)).body.data
      .id as string;
    await newExam('Final2', 4, { isFinal: true }).expect(409); // one final exam per year
    await post(`/academic-years/${randomUUID()}/exams`, {
      name: 'x',
      sequence: 1,
    }).expect(404);

    const race = await Promise.all([
      newExam('R1', 1, { isFinal: true }, otherYearId),
      newExam('R2', 2, { isFinal: true }, otherYearId),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);

    const list = await get(`/academic-years/${yearId}/exams`).expect(200);
    expect(list.body.data.map((e: { sequence: number }) => e.sequence)).toEqual(
      [1, 2, 3],
    );
  });

  it('edits and deletes draft exams', async () => {
    expect(
      (await patch(`/exams/${e2}`, { name: `${PFX}-${RUN}-E2b` }).expect(200))
        .body.data.name,
    ).toBe(`${PFX}-${RUN}-E2b`);
    await patch(`/exams/${e2}`, { isFinal: true }).expect(409); // the final exam already exists
    expect(
      (await patch(`/exams/${e1}`, { termId: null }).expect(200)).body.data
        .term,
    ).toBeNull();
    await patch(`/exams/${e1}`, { termId: otherTermId }).expect(400);

    const temp = (await newExam('Temp', 7).expect(201)).body.data.id as string;
    await del(`/exams/${temp}`, plainToken).expect(403);
    await del(`/exams/${temp}`).expect(200);
    await get(`/exams/${temp}`).expect(404);
  });

  it('sets up subjects per class with default pass marks, and validates the input', async () => {
    const res = await put(setupUrl(e1), {
      subjects: [
        { subjectId: subjMaths, fullTheory: 75, fullPractical: 25 },
        {
          subjectId: subjElective,
          fullTheory: 100,
          passTheory: 40,
          examDate: '2101-05-05',
        },
      ],
    }).expect(200);
    const rows = res.body.data.subjects as {
      code: string;
      passTheory: number;
      fullPractical: number | null;
      passPractical: number | null;
      totalFull: number;
      isCompulsory: boolean;
      creditHours: number | null;
    }[];
    expect(rows[0]).toMatchObject({
      passTheory: 26.25,
      fullPractical: 25,
      passPractical: 10,
      totalFull: 100,
      isCompulsory: true,
      creditHours: null,
    });
    expect(rows[1]).toMatchObject({
      passTheory: 40,
      fullPractical: null,
      passPractical: null,
      totalFull: 100,
      isCompulsory: false,
    });
    expect(res.body.data.subjects[1].examDate).toBe('2101-05-05');

    const bad = (subjects: object[]) => put(setupUrl(e1), { subjects });
    await bad([
      { subjectId: subjMaths, fullTheory: 75, passTheory: 80 },
    ]).expect(400); // pass above full
    await bad([
      { subjectId: subjMaths, fullTheory: 75, passPractical: 10 },
    ]).expect(400); // practical pass without full
    await bad([
      {
        subjectId: subjMaths,
        fullTheory: 75,
        fullPractical: 25,
        passPractical: 30,
      },
    ]).expect(400);
    await bad([{ subjectId: subjMaths, fullTheory: 0 }]).expect(400);
    await bad([{ subjectId: subjMaths, fullTheory: 75.123 }]).expect(400);
    await bad([{ subjectId: subjOutside, fullTheory: 50 }]).expect(400); // not in this class's curriculum
    await bad([
      { subjectId: subjMaths, fullTheory: 75 },
      { subjectId: subjMaths, fullTheory: 50 },
    ]).expect(400);
    await bad([
      { subjectId: subjMaths, fullTheory: 75, examDate: '2101-02-30' },
    ]).expect(400);
    await put(`/exams/${e1}/classes/${randomUUID()}/subjects`, {
      subjects: [],
    }).expect(404);
    await put(setupUrl(e1), { subjects: [] }, plainToken).expect(403);
    expect(
      (await get(setupUrl(e1)).expect(200)).body.data.subjects,
    ).toHaveLength(2); // nothing was lost
  });

  it('copies setup between exams without overwriting', async () => {
    const first = await post(`/exams/${e2}/copy-setup-from/${e1}`).expect(200);
    expect(first.body.data).toEqual({
      copied: 2,
      alreadyPresent: 0,
      skipped: 0,
    });
    const again = await post(`/exams/${e2}/copy-setup-from/${e1}`).expect(200);
    expect(again.body.data).toEqual({
      copied: 0,
      alreadyPresent: 2,
      skipped: 0,
    });
    await post(`/exams/${e2}/copy-setup-from/${e2}`).expect(400);
    await post(`/exams/${e2}/copy-setup-from/${randomUUID()}`).expect(404);
  });

  it('records credit hours on the curriculum and protects subjects that exams use', async () => {
    const url = `${curriculumUrl()}/${subjMaths}`;
    const set = await patch(url, { creditHours: 4 }).expect(200);
    expect(
      set.body.data.subjects.find(
        (s: { subjectId: string }) => s.subjectId === subjMaths,
      ).creditHours,
    ).toBe(4);
    expect(
      (await get(setupUrl(e1)).expect(200)).body.data.subjects[0].creditHours,
    ).toBe(4);
    await patch(url, { creditHours: 0 }).expect(400);
    await patch(url, {}).expect(400);
    await patch(`${curriculumUrl()}/${subjOutside}`, { creditHours: 3 }).expect(
      404,
    );
    await patch(url, { creditHours: 4 }, plainToken).expect(403);

    // The exam setup uses these subjects, so the curriculum cannot drop them.
    await put(curriculumUrl(), {
      subjects: [{ subjectId: subjElective, isCompulsory: false }],
    }).expect(409);
    expect(
      (await patch(url, { creditHours: null }).expect(200)).body.data
        .subjects[0].creditHours,
    ).toBeNull();
  });

  it('uses the final exam at 100% by default, and accepts weighted policies that add up to 100', async () => {
    const standard = (await get('/grade-scales').expect(200)).body.data.find(
      (s: { isDefault: boolean }) => s.isDefault,
    ) as { id: string } | undefined;
    const fallback = (await get(policyUrl()).expect(200)).body.data;
    expect(fallback).toMatchObject({
      source: 'DEFAULT',
      components: [{ examId: e3, weightPercent: 100 }],
    });
    if (standard) expect(fallback.gradeScale.id).toBe(standard.id);
    await get(policyUrl(otherYearId)).expect(200); // the race test above left a final exam in that year
    await get(policyUrl(randomUUID())).expect(404);

    const body = (weights: number[], extra: object = {}) => ({
      gradeScaleId: scaleA,
      components: [e1, e2, e3]
        .slice(0, weights.length)
        .map((examId, i) => ({ examId, weightPercent: weights[i] })),
      ...extra,
    });
    await put(policyUrl(), body([20, 20, 50])).expect(400); // adds up to 90
    await put(policyUrl(), body([20, 20, 70])).expect(400); // adds up to 110
    await put(policyUrl(), body([0, 40, 60])).expect(400);
    await put(policyUrl(), {
      gradeScaleId: scaleA,
      components: [
        { examId: e1, weightPercent: 50 },
        { examId: e1, weightPercent: 50 },
      ],
    }).expect(400);
    await put(
      policyUrl(),
      body([20, 20, 60], { gradeScaleId: randomUUID() }),
    ).expect(400);
    await put(policyUrl(), {
      gradeScaleId: scaleA,
      components: [{ examId: randomUUID(), weightPercent: 100 }],
    }).expect(400);
    await put(policyUrl(), body([20, 20, 60]), plainToken).expect(403);

    const set = await put(policyUrl(), body([20, 20, 60])).expect(200);
    expect(set.body.data).toMatchObject({
      source: 'EXPLICIT',
      gradeScale: { id: scaleA },
    });
    expect(
      set.body.data.components.map(
        (c: { weightPercent: number }) => c.weightPercent,
      ),
    ).toEqual([20, 20, 60]);
    expect(
      (await get(`/academic-years/${yearId}/result-policies`).expect(200)).body
        .data,
    ).toHaveLength(1);

    await del(`/grade-scales/${scaleA}`).expect(409); // used by a policy
    await del(`/exams/${e3}`).expect(409); // part of a policy
    await put(policyUrl(), body([10, 30, 60])).expect(200); // editable until results are published
    await del(policyUrl()).expect(200);
    expect((await get(policyUrl()).expect(200)).body.data.source).toBe(
      'DEFAULT',
    );
    await del(policyUrl()).expect(404);
  });

  it('opens an exam only in the active year, and freezes its setup afterwards', async ({
    skip,
  }) => {
    if (hasRealActiveYear) skip(); // a real active year exists; run this against a clean test database

    await post(`/exams/${e1}/open`).expect(409); // the year is still planned
    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'ACTIVE' },
    });
    await post(`/exams/${e3}/open`).expect(409); // no subject setup yet
    await post(`/exams/${e1}/open`, {}, plainToken).expect(403);

    const opened = await post(`/exams/${e1}/open`).expect(200);
    expect(opened.body.data).toMatchObject({
      status: 'OPEN',
      subjectSetupCount: 2,
    });
    await post(`/exams/${e1}/open`).expect(409);
    await patch(`/exams/${e1}`, { name: 'renamed' }).expect(409);
    await put(setupUrl(e1), { subjects: [] }).expect(409);
    await post(`/exams/${e1}/copy-setup-from/${e2}`).expect(409);
    await del(`/exams/${e1}`).expect(409);
    await patch(`/exams/${e2}`, { name: `${PFX}-${RUN}-E2c` }).expect(200); // other draft exams are unaffected
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'exam.opened', entityId: e1 },
      }),
    ).not.toBeNull();
  });

  it('is read-only once the academic year is closed', async () => {
    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'CLOSED' },
    });
    await newExam('Late', 15).expect(409);
    await patch(`/exams/${e2}`, { name: 'nope' }).expect(409);
    await put(setupUrl(e2), { subjects: [] }).expect(409);
    await put(policyUrl(), {
      gradeScaleId: scaleA,
      components: [{ examId: e3, weightPercent: 100 }],
    }).expect(409);
    await patch(`${curriculumUrl()}/${subjMaths}`, { creditHours: 3 }).expect(
      409,
    );
    await get(`/academic-years/${yearId}/exams`).expect(200);
    await get(setupUrl(e2)).expect(200);
  });
});
