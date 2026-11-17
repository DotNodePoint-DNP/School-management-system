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

const PFX = 'E2E-POR';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-por-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const NOT_FOUND = 'Child not found';
const WHY = 'The exam board asked us to hold the results for a week';

type Who = 'admin' | 'limited' | 'staff' | 'parent1' | 'parent2' | 'unlinked';
type C = 'c1' | 'c2' | 'c3';
const PHONE_G1B = `+97796${TAIL}`;

describe('Parent portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = '';
  const token = {} as Record<Who, string>;
  const userId = {} as Record<Who, string>;
  let yearOld = '';
  let yearA = '';
  let classId = '';
  let sectionId = '';
  const exam = { ET: '', EF: '', ED: '', EO: '' };
  const stu = {} as Record<C, string>;
  const enrA = {} as Record<C, string>;
  let enrOldC1 = '';
  let enrOldC2 = '';
  const guardian = { g1: '', g1b: '', g2: '' };

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t: string) =>
    http().get(`${V1}${url}`).set(auth(t));
  const put = (url: string, body: object, t: string) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const release = (examKey: keyof typeof exam, body: object, t = token.admin) =>
    put(`/exams/${exam[examKey]}/release`, body, t);
  const portal = async (url: string, t = token.parent1) =>
    (await get(`/portal${url}`, t).expect(200)).body.data;
  const results = (c: C, t = token.parent1) =>
    portal(`/children/${stu[c]}/results`, t) as Promise<any[]>;

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
    await prisma.attendanceRecord.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.calendarEntry.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.exam.deleteMany({
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

  /** A published result written directly. The exam pipeline has its own tests. */
  async function publishRun(opts: {
    year: string;
    scope: string;
    examId?: string;
    version?: number;
    rows: {
      enrollmentId: string;
      percentage: number;
      rank: number;
      status?: 'PASS' | 'FAIL';
    }[];
  }): Promise<void> {
    await prisma.resultRun.create({
      data: {
        academicYearId: opts.year,
        classId,
        scopeKey: opts.scope,
        examId: opts.examId ?? null,
        version: opts.version ?? 1,
        createdById: userId.admin,
        gradeScale: { id: 'x', name: 'x', bands: [] },
        components: [],
        warnings: [],
        rows: {
          create: opts.rows.map((r) => ({
            enrollmentId: r.enrollmentId,
            sectionId,
            status: r.status ?? ('PASS' as const),
            percentage: r.percentage,
            classRank: r.rank,
            sectionRank: r.rank,
            payload: {
              subjects: [],
              missing: [],
              failedSubjects: [],
              creditBasis: 'EQUAL',
            },
          })),
        },
      },
    });
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

    await purge();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-por-' } },
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

    await makeUser('admin', [
      ['exams', 'release'],
      ['students', 'update'],
      ['guardians', 'manage'],
    ]);
    await makeUser('limited', [['students', 'update']]);
    await makeUser('staff', [['fees', 'read']]);
    await makeUser('parent1', [['portal', 'access']]);
    await makeUser('parent2', [['portal', 'access']]);
    await makeUser('unlinked', [['portal', 'access']]);

    yearOld = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-OLD`,
          startDate: date('2004-04-14'),
          endDate: date('2005-04-13'),
          status: 'CLOSED',
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
    sectionId = (await prisma.section.create({ data: { classId, name: 'A' } }))
      .id;

    const makeExam = async (
      key: keyof typeof exam,
      year: string,
      name: string,
      sequence: number,
      extra: object,
    ): Promise<void> => {
      exam[key] = (
        await prisma.exam.create({
          data: {
            academicYearId: year,
            name: `${PFX}-${RUN}-${name}`,
            sequence,
            ...extra,
          },
        })
      ).id;
    };
    await makeExam('ET', yearA, 'Terminal', 1, { status: 'PUBLISHED' });
    await makeExam('EF', yearA, 'Final', 2, {
      status: 'PUBLISHED',
      isFinal: true,
    });
    await makeExam('ED', yearA, 'Draft', 3, { status: 'DRAFT' });
    await makeExam('EO', yearOld, 'OldFinal', 1, {
      status: 'PUBLISHED',
      isFinal: true,
      parentReleaseOn: date('2005-03-01'),
    }); // released long ago

    const student = async (key: C, status: 'ACTIVE' | 'GRADUATED' = 'ACTIVE') =>
      prisma.student.create({
        data: {
          admissionNo: `E2E-${RUN}-${key}`,
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
          status,
          ...(status === 'GRADUATED'
            ? { statusChangedOn: date('2005-04-13') }
            : {}),
        },
      });
    const [s1, s2, s3] = [
      await student('c1'),
      await student('c2', 'GRADUATED'),
      await student('c3'),
    ];
    stu.c1 = s1.id;
    stu.c2 = s2.id;
    stu.c3 = s3.id;
    const enroll = async (
      studentId: string,
      year: string,
      rollNo: number,
      status: 'ENROLLED' | 'COMPLETED',
    ) =>
      (
        await prisma.enrollment.create({
          data: {
            studentId,
            academicYearId: year,
            classId,
            sectionId,
            rollNo,
            status,
            ...(status === 'COMPLETED'
              ? { statusChangedOn: date('2005-04-13') }
              : {}),
          },
        })
      ).id;
    enrOldC1 = await enroll(stu.c1, yearOld, 1, 'COMPLETED');
    enrOldC2 = await enroll(stu.c2, yearOld, 2, 'COMPLETED');
    enrA.c1 = await enroll(stu.c1, yearA, 1, 'ENROLLED');
    enrA.c3 = await enroll(stu.c3, yearA, 2, 'ENROLLED');

    guardian.g1 = (
      await prisma.guardian.create({
        data: {
          firstName: `${PFX}-G1`,
          lastName: 'Rai',
          phone: `+97798${TAIL}`,
          userId: userId.parent1,
        },
      })
    ).id;
    guardian.g1b = (
      await prisma.guardian.create({
        data: {
          firstName: `${PFX}-G1b`,
          lastName: 'Rai',
          phone: PHONE_G1B,
          email: `e2e-por-${RUN}-g1b@test.local`,
        },
      })
    ).id;
    guardian.g2 = (
      await prisma.guardian.create({
        data: {
          firstName: `${PFX}-G2`,
          lastName: 'Shrestha',
          phone: `+97797${TAIL}`,
          userId: userId.parent2,
        },
      })
    ).id;
    const link = (
      studentId: string,
      guardianId: string,
      relationship: 'FATHER' | 'MOTHER',
      isPrimary: boolean,
    ) =>
      prisma.studentGuardian.create({
        data: { studentId, guardianId, relationship, isPrimary },
      });
    await link(stu.c1, guardian.g1, 'FATHER', true);
    await link(stu.c1, guardian.g1b, 'MOTHER', false);
    await link(stu.c2, guardian.g1, 'FATHER', true);
    await link(stu.c3, guardian.g2, 'MOTHER', true);

    // Results: a terminal and a combined result this year, and a combined result last year.
    await publishRun({
      year: yearA,
      scope: `EXAM:${exam.ET}`,
      examId: exam.ET,
      rows: [
        { enrollmentId: enrA.c1, percentage: 80, rank: 1 },
        { enrollmentId: enrA.c3, percentage: 70, rank: 2 },
      ],
    });
    await publishRun({
      year: yearA,
      scope: 'POLICY',
      rows: [
        { enrollmentId: enrA.c1, percentage: 85, rank: 1 },
        { enrollmentId: enrA.c3, percentage: 75, rank: 2 },
      ],
    });
    await publishRun({
      year: yearOld,
      scope: 'POLICY',
      rows: [
        { enrollmentId: enrOldC2, percentage: 90, rank: 1 },
        { enrollmentId: enrOldC1, percentage: 60, rank: 2 },
      ],
    });

    // c1 has four days of attendance, one of them with a private teacher note, and a holiday follows.
    const session = async (day: string) =>
      (
        await prisma.attendanceSession.create({
          data: {
            academicYearId: yearA,
            sectionId,
            date: date(day),
            takenById: userId.admin,
          },
        })
      ).id;
    const mark = async (
      day: string,
      status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE',
      note?: string,
    ) =>
      prisma.attendanceRecord.create({
        data: {
          sessionId: await session(day),
          date: date(day),
          academicYearId: yearA,
          enrollmentId: enrA.c1,
          status,
          ...(note ? { note } : {}),
        },
      });
    await mark('2005-05-02', 'PRESENT');
    await mark('2005-05-03', 'LATE');
    await mark(
      '2005-05-04',
      'ABSENT',
      'Teacher private note: spoke to the family',
    );
    await mark('2005-05-05', 'LEAVE');
    await prisma.calendarEntry.create({
      data: {
        academicYearId: yearA,
        date: date('2005-05-06'),
        kind: 'HOLIDAY',
        name: 'Test Holiday',
      },
    });
  });

  afterAll(async () => {
    if (!blocked) {
      await purge();
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-por-' } },
      });
      await prisma.role.deleteMany({
        where: { name: { startsWith: `${PFX}-` } },
      });
    }
    await app.close();
  });

  it('needs a login, the portal permission, and a guardian record', async ({
    skip,
  }) => {
    if (blocked) skip();
    for (const path of [
      '/portal/me',
      '/portal/home',
      `/portal/children/${stu.c1}`,
    ])
      await http().get(`${V1}${path}`).expect(401);
    for (const path of [
      '/me',
      '/home',
      `/children/${stu.c1}`,
      `/children/${stu.c1}/attendance`,
      `/children/${stu.c1}/results`,
      `/children/${stu.c1}/report-card`,
    ]) {
      await get(`/portal${path}`, token.staff).expect(403); // a staff login is not a parent login
      await get(`/portal${path}`, token.admin).expect(403);
    }
    const unlinked = await get('/portal/me', token.unlinked).expect(403);
    expect(unlinked.body.error.message).toMatch(/not linked to a guardian/);
    await get('/portal/home', token.unlinked).expect(403);
    await get(`/portal/children/${stu.c1}`, token.unlinked).expect(404); // permitted, but linked to nobody
  });

  it('keeps parents out of staff endpoints', async ({ skip }) => {
    if (blocked) skip();
    await get('/students', token.parent1).expect(403);
    await get(`/students/${stu.c1}`, token.parent1).expect(403);
    await get(`/academic-years/${yearA}/exam-releases`, token.parent1).expect(
      403,
    );
    await put(
      `/exams/${exam.ET}/release`,
      { releaseOn: today() },
      token.parent1,
    ).expect(403);
    await put(
      `/students/${stu.c1}/guardians`,
      {
        guardians: [
          { guardianId: guardian.g1, relationship: 'FATHER', isPrimary: true },
        ],
      },
      token.parent1,
    ).expect(403);
  });

  it('shows each parent only their own children', async ({ skip }) => {
    if (blocked) skip();
    const me = await portal('/me');
    expect(me.guardian).toMatchObject({
      id: guardian.g1,
      name: `${PFX}-G1 Rai`,
    });
    expect(me.children.map((c: { id: string }) => c.id)).toEqual([
      stu.c1,
      stu.c2,
    ]);
    expect(me.children[0]).toMatchObject({
      admissionNo: `E2E-${RUN}-c1`,
      relationship: 'FATHER',
      isPrimary: true,
      status: 'ACTIVE',
      current: {
        enrollmentId: enrA.c1,
        enrollmentStatus: 'ENROLLED',
        className: `${PFX}-${RUN}-C`,
        sectionName: 'A',
        rollNo: 1,
      },
    });
    expect(me.children[1]).toMatchObject({
      status: 'GRADUATED',
      current: { enrollmentId: enrOldC2, enrollmentStatus: 'COMPLETED' },
    }); // a former student stays visible
    const other = await portal('/me', token.parent2);
    expect(other.children.map((c: { id: string }) => c.id)).toEqual([stu.c3]);
    expect(JSON.stringify(me)).not.toContain(PHONE_G1B);
    const res = await get('/portal/me', token.parent1).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('answers "not found" for every child that is not the parent\'s, however the question is asked', async ({
    skip,
  }) => {
    if (blocked) skip();
    const paths = (id: string) => [
      `/portal/children/${id}`,
      `/portal/children/${id}/attendance`,
      `/portal/children/${id}/results`,
      `/portal/children/${id}/report-card`,
    ];
    for (const id of [stu.c3, randomUUID()]) {
      for (const path of paths(id)) {
        const res = await get(path, token.parent1).expect(404);
        expect(res.body.error.message).toBe(NOT_FOUND); // the same answer for another family's child and for an id that does not exist
      }
    }
    for (const path of paths(stu.c1))
      await get(path, token.parent2).expect(404);
    for (const path of paths(stu.c2))
      await get(path, token.parent2).expect(404);
    // Another child's enrollment id cannot be smuggled in under one of the parent's own children.
    await get(
      `/portal/children/${stu.c1}/attendance?enrollmentId=${enrA.c3}`,
      token.parent1,
    ).expect(404);
    await get(
      `/portal/children/${stu.c1}/report-card?enrollmentId=${enrA.c3}`,
      token.parent1,
    ).expect(404);
    await get(`/portal/children/not-a-uuid`, token.parent1).expect(400);
  });

  it("shows the child's profile with other guardians' names only", async ({
    skip,
  }) => {
    if (blocked) skip();
    const p = await portal(`/children/${stu.c1}`);
    expect(p).toMatchObject({
      admissionNo: `E2E-${RUN}-c1`,
      name: `${PFX}-c1 Rai`,
      gender: 'MALE',
      dateOfBirth: '1995-04-04',
      status: 'ACTIVE',
      statusChangedOn: null,
    });
    expect(p.dateOfBirthBs).toEqual(expect.any(String));
    expect(
      p.enrollments.map(
        (e: { academicYear: { id: string } }) => e.academicYear.id,
      ),
    ).toEqual([yearA, yearOld]);
    expect(p.guardians).toEqual([
      { name: `${PFX}-G1 Rai`, relationship: 'FATHER', isPrimary: true },
      { name: `${PFX}-G1b Rai`, relationship: 'MOTHER', isPrimary: false },
    ]);
    const text = JSON.stringify(p);
    for (const secret of [PHONE_G1B, 'g1b@test.local', 'phone', 'email'])
      expect(text).not.toContain(secret);

    const former = await portal(`/children/${stu.c2}`);
    expect(former).toMatchObject({
      status: 'GRADUATED',
      statusChangedOn: '2005-04-13',
    });
  });

  it('shows attendance as statuses and a summary, without teacher notes', async ({
    skip,
  }) => {
    if (blocked) skip();
    const a = await portal(
      `/children/${stu.c1}/attendance?from=2005-05-01&to=2005-05-10`,
    );
    expect(a.academicYear).toMatchObject({ id: yearA });
    expect(a.range).toEqual({ from: '2005-05-01', to: '2005-05-10' });
    expect(a.summary).toEqual({
      totalDays: 4,
      present: 2,
      absent: 2,
      late: 1,
      leave: 1,
      percentage: 50,
    });
    expect(
      a.days.map((d: { date: string; status: string }) => [d.date, d.status]),
    ).toEqual([
      ['2005-05-02', 'PRESENT'],
      ['2005-05-03', 'LATE'],
      ['2005-05-04', 'ABSENT'],
      ['2005-05-05', 'LEAVE'],
    ]);
    expect(a.days[0].dateBs).toEqual(expect.any(String));
    expect(a.holidays).toEqual([
      { date: '2005-05-06', dateBs: expect.any(String), name: 'Test Holiday' },
    ]);
    expect(a.weeklyOffDays).toEqual([0, 6]);
    const text = JSON.stringify(a);
    for (const secret of [
      'Teacher private note',
      'spoke to the family',
      'note',
      'source',
    ])
      expect(text).not.toContain(secret);

    const old = await portal(
      `/children/${stu.c1}/attendance?enrollmentId=${enrOldC1}`,
    );
    expect(old.academicYear.id).toBe(yearOld);
    expect(old.summary).toMatchObject({ totalDays: 0, percentage: null });
    expect((await portal(`/children/${stu.c1}/attendance`)).range.to).toBe(
      '2006-04-13',
    ); // the end of the latest year, since that year is over
    await get(
      `/portal/children/${stu.c1}/attendance?from=2005-05-10&to=2005-05-01`,
      token.parent1,
    ).expect(400);
    await get(
      `/portal/children/${stu.c1}/attendance?to=2999-01-01`,
      token.parent1,
    ).expect(400);
    await get(
      `/portal/children/${stu.c1}/attendance?from=2004-01-01&to=2005-05-01`,
      token.parent1,
    ).expect(400); // more than a year
    await get(
      `/portal/children/${stu.c1}/attendance?from=2026-13-40`,
      token.parent1,
    ).expect(400);
  });

  it('keeps results hidden until staff publish them and set a release date', async ({
    skip,
  }) => {
    if (blocked) skip();
    // Published inside the school, but not released: parents see only last year's, which was released long ago.
    expect(
      (await results('c1')).map((r) => [r.scope, r.academicYear.id]),
    ).toEqual([['FINAL', yearOld]]);
    expect(await results('c3', token.parent2)).toEqual([]);
    for (const q of [
      `?examId=${exam.ET}`,
      `?examId=${exam.EF}`,
      `?examId=${exam.ED}`,
      '',
    ])
      await get(
        `/portal/children/${stu.c1}/report-card${q}`,
        token.parent1,
      ).expect(404);
    expect((await portal('/home')).children[0].latestResult).toMatchObject({
      scope: 'FINAL',
      academicYear: { id: yearOld },
    });
  });

  it('lets only people with the release permission schedule a release, and only for a published exam', async ({
    skip,
  }) => {
    if (blocked) skip();
    const tomorrow = addDays(today(), 1);
    await release('ET', { releaseOn: tomorrow }, token.limited).expect(403);
    await release('ED', { releaseOn: tomorrow }).expect(409); // a draft exam cannot be released
    await release('ET', {}).expect(400);
    await release('ET', { clear: true, releaseOn: tomorrow }).expect(400);
    await release('ET', { releaseOn: addDays(today(), -1) }).expect(400); // never in the past
    await release('ET', {
      releaseOn: tomorrow,
      releaseOnBs: '2083-01-01',
    }).expect(400);
    await release('ET', { releaseOn: '2026-13-40' }).expect(400);
    await release('ET', { clear: true }).expect(400); // nothing is scheduled yet
    await put(
      `/exams/${randomUUID()}/release`,
      { releaseOn: tomorrow },
      token.admin,
    ).expect(404);

    const scheduled = await release('ET', { releaseOn: tomorrow }).expect(200);
    expect(scheduled.body.data).toMatchObject({
      status: 'PUBLISHED',
      releaseOn: tomorrow,
      visibleToParents: false,
    });
    expect(scheduled.body.data.releaseOnBs).toEqual(expect.any(String));
    expect((await results('c1')).some((r) => r.scope === 'EXAM')).toBe(false); // a future date shows nothing
    await release('ET', { releaseOn: tomorrow }).expect(400); // no change
    const list = (
      await get(`/academic-years/${yearA}/exam-releases`, token.admin).expect(
        200,
      )
    ).body.data as {
      id: string;
      visibleToParents: boolean;
      releaseOn: string | null;
    }[];
    expect(list.map((e) => [e.id, e.releaseOn, e.visibleToParents])).toEqual([
      [exam.ET, tomorrow, false],
      [exam.EF, null, false],
      [exam.ED, null, false],
    ]);
    await get(
      `/academic-years/${randomUUID()}/exam-releases`,
      token.admin,
    ).expect(404);
  });

  it('shows a released exam to its own parents only, then withdraws it with a recorded reason', async ({
    skip,
  }) => {
    if (blocked) skip();
    await release('ET', { releaseOn: today() }).expect(200); // release now
    const c1 = await results('c1');
    expect(
      c1.map((r) => [r.scope, r.academicYear.id, r.percentage, r.classRank]),
    ).toEqual([
      ['EXAM', yearA, 80, 1],
      ['FINAL', yearOld, 60, 2],
    ]);
    expect(c1[0]).toMatchObject({
      exam: { id: exam.ET },
      status: 'PASS',
      version: 1,
      revised: false,
      enrollmentId: enrA.c1,
    });
    expect(
      (await results('c3', token.parent2)).map((r) => [r.scope, r.percentage]),
    ).toEqual([['EXAM', 70]]);
    expect((await results('c2')).map((r) => [r.scope, r.percentage])).toEqual([
      ['FINAL', 90],
    ]);

    const card = await portal(
      `/children/${stu.c1}/report-card?examId=${exam.ET}`,
    );
    expect(card).toMatchObject({
      student: { admissionNo: `E2E-${RUN}-c1` },
      exam: { id: exam.ET },
      result: { status: 'PASS', percentage: 80, classRank: 1 },
      enrollmentId: enrA.c1,
    });
    await get(`/portal/children/${stu.c1}/report-card`, token.parent1).expect(
      404,
    ); // the combined result needs every exam in its policy released
    await get(
      `/portal/children/${stu.c1}/report-card?examId=${exam.EF}`,
      token.parent1,
    ).expect(404);
    await get(
      `/portal/children/${stu.c1}/report-card?examId=${exam.ET}&enrollmentId=${enrOldC1}`,
      token.parent1,
    ).expect(404); // that exam belongs to another year
    await get(
      `/portal/children/${stu.c3}/report-card?examId=${exam.ET}`,
      token.parent1,
    ).expect(404); // same released exam, another family's child

    const missingReason = await release('ET', { clear: true }).expect(400);
    expect(missingReason.body.error.message).toMatch(/needs a reason/);
    await release('ET', { clear: true, reason: 'short' }).expect(400);
    await release('ET', { clear: true, reason: WHY }).expect(200);
    expect((await results('c1')).some((r) => r.scope === 'EXAM')).toBe(false);
    await get(
      `/portal/children/${stu.c1}/report-card?examId=${exam.ET}`,
      token.parent1,
    ).expect(404);
    await release('ET', { releaseOn: today() }).expect(200);
    expect((await results('c1')).some((r) => r.scope === 'EXAM')).toBe(true);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'exam.release_set', entityId: exam.ET },
      orderBy: { occurredAt: 'asc' },
      select: { details: true },
    });
    expect(audits.map((a) => a.details)).toEqual([
      { releaseOn: addDays(today(), 1), recalled: false },
      { releaseOn: today(), recalled: false },
      { releaseOn: null, recalled: true, reason: WHY },
      { releaseOn: today(), recalled: false },
    ]);
  });

  it('shows the combined result only once every exam in the policy has been released', async ({
    skip,
  }) => {
    if (blocked) skip();
    await release('EF', { releaseOn: today() }).expect(200);
    const c1 = await results('c1');
    expect(
      c1.map((r) => [r.scope, r.academicYear.id, r.percentage, r.classRank]),
    ).toEqual([
      ['FINAL', yearA, 85, 1],
      ['EXAM', yearA, 80, 1],
      ['FINAL', yearOld, 60, 2],
    ]);
    const card = await portal(`/children/${stu.c1}/report-card`);
    expect(card).toMatchObject({
      exam: null,
      run: { scope: 'POLICY', version: 1 },
      result: { percentage: 85, classRank: 1 },
      attendance: { totalDays: expect.any(Number) },
    });
    expect(card).toHaveProperty('remark');
    const old = await portal(
      `/children/${stu.c1}/report-card?enrollmentId=${enrOldC1}`,
    );
    expect(old.result.percentage).toBe(60);
    await get(`/portal/children/${stu.c3}/report-card`, token.parent1).expect(
      404,
    );
    expect(
      (await portal(`/children/${stu.c3}/report-card`, token.parent2)).result
        .percentage,
    ).toBe(75);
  });

  it('shows the latest version of a result after a correction', async ({
    skip,
  }) => {
    if (blocked) skip();
    await publishRun({
      year: yearA,
      scope: `EXAM:${exam.ET}`,
      examId: exam.ET,
      version: 2,
      rows: [
        { enrollmentId: enrA.c1, percentage: 82, rank: 1 },
        { enrollmentId: enrA.c3, percentage: 70, rank: 2 },
      ],
    });
    const c1 = (await results('c1')).find((r) => r.scope === 'EXAM');
    expect(c1).toMatchObject({ version: 2, revised: true, percentage: 82 });
    expect(
      (await portal(`/children/${stu.c1}/report-card?examId=${exam.ET}`)).result
        .percentage,
    ).toBe(82);
  });

  it('puts the whole family on one screen', async ({ skip }) => {
    if (blocked) skip();
    const home = await portal('/home');
    expect(home).toMatchObject({
      guardian: { id: guardian.g1 },
      asOf: today(),
    });
    expect(home.children.map((c: { id: string }) => c.id)).toEqual([
      stu.c1,
      stu.c2,
    ]);
    expect(home.children[0]).toMatchObject({
      latestResult: {
        scope: 'FINAL',
        status: 'PASS',
        percentage: 85,
        academicYear: { id: yearA },
      },
    });
    expect(home.children[0].attendance).toMatchObject({
      from: addDays(today(), -29),
      to: today(),
      totalDays: 0,
      percentage: null,
    }); // the sample data is from 2005
    expect(home.children[1].latestResult).toMatchObject({
      scope: 'FINAL',
      percentage: 90,
    });
    expect(JSON.stringify(await portal('/home', token.parent2))).not.toContain(
      stu.c1,
    );
  });

  it("lets only people who manage guardians switch a child's portal access off, and applies it at once", async ({
    skip,
  }) => {
    if (blocked) skip();
    const linkOf = (guardianId: string, flag?: boolean) => ({
      guardianId,
      relationship: 'FATHER',
      isPrimary: true,
      ...(flag === undefined ? {} : { portalAccess: flag }),
    });
    await put(
      `/students/${stu.c2}/guardians`,
      { guardians: [linkOf(guardian.g1, false)] },
      token.limited,
    ).expect(403); // may edit students, not switch access
    expect((await portal('/me')).children).toHaveLength(2);

    const off = await put(
      `/students/${stu.c2}/guardians`,
      { guardians: [linkOf(guardian.g1, false)] },
      token.admin,
    ).expect(200);
    expect(off.body.data.guardians[0]).toMatchObject({ portalAccess: false });
    expect(
      (await portal('/me')).children.map((c: { id: string }) => c.id),
    ).toEqual([stu.c1]);
    for (const path of ['', '/attendance', '/results', '/report-card'])
      await get(`/portal/children/${stu.c2}${path}`, token.parent1).expect(404);
    expect(
      (await portal('/home')).children.map((c: { id: string }) => c.id),
    ).toEqual([stu.c1]);
    await get(`/portal/children/${stu.c1}`, token.parent1).expect(200); // other children are unaffected

    await put(
      `/students/${stu.c2}/guardians`,
      { guardians: [linkOf(guardian.g1)] },
      token.limited,
    ).expect(200); // editing without the flag leaves it off
    expect((await portal('/me')).children).toHaveLength(1);

    await put(
      `/students/${stu.c2}/guardians`,
      { guardians: [linkOf(guardian.g1, true)] },
      token.admin,
    ).expect(200);
    expect((await portal('/me')).children).toHaveLength(2);
    const audits = await prisma.auditLog.findMany({
      where: { action: 'guardian.portal_access_changed', entityId: stu.c2 },
      orderBy: { occurredAt: 'asc' },
      select: { details: true },
    });
    expect(audits.map((a) => a.details)).toEqual([
      { guardianId: guardian.g1, portalAccess: false },
      { guardianId: guardian.g1, portalAccess: true },
    ]);
    expect(JSON.stringify(audits)).not.toContain(PFX);
  });
});
