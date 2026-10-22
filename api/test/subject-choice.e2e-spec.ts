import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { adToBsString } from '../src/common/utils/bs-date.js';
import { hashPassword } from '../src/common/utils/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PFX = 'E2E-CHO';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const BS_YEAR = adToBsString('2010-05-05')?.slice(0, 4) ?? '';
const email = (n: string): string => `e2e-cho-${RUN}-${n}@test.local`;
const phoneRaw = (n: number): string =>
  `98${String(RUN).slice(-6)}${String(n).padStart(2, '0')}`;

describe('Optional-subject choices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken = '';
  let plainToken = '';
  let strangerToken = '';
  let hasRealActiveYear = false;
  let phoneCounter = 0;
  let yearId = '';
  let c1 = '';
  let c2 = '';
  let s1 = '';
  let s2 = '';
  let t1 = '';
  let mathId = '';
  let o1 = '';
  let o2 = '';
  let xId = '';
  let st1 = '';
  let st2 = '';
  let st3 = '';
  let en1 = '';
  let en2 = '';
  let en3 = '';

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = managerToken) =>
    http().get(`${V1}${url}`).set(auth(token));
  const post = (url: string, body: object = {}, token = managerToken) =>
    http().post(`${V1}${url}`).set(auth(token)).send(body);
  const put = (url: string, body: object, token = managerToken) =>
    http().put(`${V1}${url}`).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = managerToken) =>
    http().patch(`${V1}${url}`).set(auth(token)).send(body);

  const choose = (
    enrollmentId: string,
    subjectIds: string[],
    token = managerToken,
  ) =>
    put(
      `/enrollments/${enrollmentId}/optional-subjects`,
      { subjectIds },
      token,
    );
  const rosterUrl = (sectionId: string, subjectId: string) =>
    `/academic-years/${yearId}/sections/${sectionId}/subjects/${subjectId}/students`;
  const rosterIds = async (
    sectionId: string,
    subjectId: string,
  ): Promise<string[]> =>
    (
      (await get(rosterUrl(sectionId, subjectId)).expect(200)).body.data
        .students as { studentId: string }[]
    )
      .map((s) => s.studentId)
      .sort();
  const curriculumUrl = (): string =>
    `/academic-years/${yearId}/classes/${c1}/subjects`;

  const admit = async (
    label: string,
    sectionId: string,
  ): Promise<{ studentId: string; enrollmentId: string }> => {
    const res = await post('/students', {
      firstName: `${PFX}-${label}`,
      lastName: 'Rai',
      gender: 'FEMALE',
      dateOfBirth: '2004-04-04',
      admissionDate: '2010-05-05',
      guardians: [
        {
          firstName: `${PFX}-G`,
          phone: phoneRaw(++phoneCounter),
          relationship: 'MOTHER',
          createLogin: false,
        },
      ],
      placement: { academicYearId: yearId, sectionId },
    }).expect(201);
    const studentId = res.body.data.student.id as string;
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId, academicYearId: yearId },
    });
    return { studentId, enrollmentId: enrollment.id };
  };

  async function cleanup(): Promise<void> {
    const students = await prisma.student.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.enrollment.deleteMany({
      where: {
        OR: [
          { studentId: { in: studentIds } },
          { academicYearId: { in: yearIds } },
        ],
      },
    });
    await prisma.classTeacherAssignment.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.classSubject.deleteMany({
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
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.guardian.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    await prisma.staff.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    await prisma.sequence.deleteMany({
      where: { name: `admission:${BS_YEAR}` },
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

    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-cho-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    hasRealActiveYear =
      (await prisma.academicYear.findFirst({
        where: { status: 'ACTIVE', NOT: { name: { startsWith: PFX } } },
      })) !== null;

    managerToken = await makeUser('manager', [
      ['students', 'create'],
      ['students', 'read-all'],
      ['students', 'change-status'],
      ['enrollments', 'read'],
      ['enrollments', 'manage'],
      ['subjects', 'manage'],
    ]);
    plainToken = await makeUser('plain', []);
    strangerToken = await makeUser('stranger', [['students', 'read']]);

    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y`,
          startDate: new Date('2093-04-01T00:00:00Z'),
          endDate: new Date('2094-03-31T00:00:00Z'),
        },
      })
    ).id;
    c1 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C1`, sortOrder: 5 },
      })
    ).id;
    c2 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C2`, sortOrder: 6 },
      })
    ).id;
    s1 = (await prisma.section.create({ data: { classId: c1, name: 'S1' } }))
      .id;
    s2 = (await prisma.section.create({ data: { classId: c1, name: 'S2' } }))
      .id;
    t1 = (await prisma.section.create({ data: { classId: c2, name: 'T1' } }))
      .id;
    const subject = async (letter: string, label: string): Promise<string> =>
      (
        await prisma.subject.create({
          data: { code: `S${TAIL}${letter}`, name: `${PFX}-${RUN}-${label}` },
        })
      ).id;
    mathId = await subject('M', 'Maths');
    o1 = await subject('A', 'Computer');
    o2 = await subject('B', 'Account');
    xId = await subject('X', 'Music');
    await prisma.classSubject.createMany({
      data: [
        {
          academicYearId: yearId,
          classId: c1,
          subjectId: mathId,
          isCompulsory: true,
        },
        {
          academicYearId: yearId,
          classId: c1,
          subjectId: o1,
          isCompulsory: false,
        },
        {
          academicYearId: yearId,
          classId: c1,
          subjectId: o2,
          isCompulsory: false,
        },
        {
          academicYearId: yearId,
          classId: c2,
          subjectId: xId,
          isCompulsory: false,
        },
      ],
    });
    ({ studentId: st1, enrollmentId: en1 } = await admit('One', s1));
    ({ studentId: st2, enrollmentId: en2 } = await admit('Two', s1));
    ({ studentId: st3, enrollmentId: en3 } = await admit('Three', s2));
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-cho-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires permissions and section access', async () => {
    await choose(en1, [o1], plainToken).expect(403);
    await get(`/enrollments/${en1}/optional-subjects`, plainToken).expect(403);
    await get(`/enrollments/${en1}/optional-subjects`, strangerToken).expect(
      403,
    ); // not assigned to the section
    await get(rosterUrl(s1, o1), strangerToken).expect(403);
    await get(`/enrollments/${randomUUID()}/optional-subjects`).expect(404);
  });

  it('records choices and shows what each student can choose', async () => {
    const first = await choose(en1, [o1]).expect(200);
    expect(
      first.body.data.compulsory.map((s: { subjectId: string }) => s.subjectId),
    ).toEqual([mathId]);
    expect(
      first.body.data.optional.map(
        (s: { subjectId: string; chosen: boolean }) => [s.subjectId, s.chosen],
      ),
    ).toEqual([
      [o1, true],
      [o2, false],
    ]);

    const both = await choose(en1, [o1, o2]).expect(200);
    expect(
      both.body.data.optional.every((s: { chosen: boolean }) => s.chosen),
    ).toBe(true);
    await choose(en2, [o2]).expect(200);
    expect(
      (await get(`/enrollments/${en2}/optional-subjects`).expect(200)).body.data
        .optional[0].chosen,
    ).toBe(false);
  });

  it('rejects subjects the student cannot choose', async () => {
    await choose(en1, [randomUUID()]).expect(400); // unknown
    await choose(en1, [xId]).expect(400); // belongs to another class's curriculum
    await choose(en1, [mathId]).expect(400); // compulsory
    await choose(en1, [o1, o1]).expect(400); // duplicate
    await choose(en1, ['not-a-uuid']).expect(400);
    expect(
      (
        await get(`/enrollments/${en1}/optional-subjects`).expect(200)
      ).body.data.optional.every((s: { chosen: boolean }) => s.chosen),
    ).toBe(true); // nothing changed
  });

  it('lists who studies a subject in a section', async () => {
    expect(await rosterIds(s1, o1)).toEqual([st1]);
    expect(await rosterIds(s1, o2)).toEqual([st1, st2].sort());
    expect(await rosterIds(s1, mathId)).toEqual([st1, st2].sort()); // compulsory: everyone enrolled
    expect(await rosterIds(s2, mathId)).toEqual([st3]);
    await get(rosterUrl(s1, xId)).expect(404); // not in this class's curriculum
    expect((await get(rosterUrl(s1, o2)).expect(200)).body.data.count).toBe(2);
  });

  it('keeps choices when a student moves to another section of the class', async () => {
    await patch(`/enrollments/${en1}/section`, { sectionId: s2 }).expect(200);
    expect(await rosterIds(s2, o1)).toEqual([st1]);
    expect(await rosterIds(s1, o1)).toEqual([]);
    expect(await rosterIds(s1, o2)).toEqual([st2]);
  });

  it('blocks curriculum changes that would orphan or invalidate choices', async () => {
    const original = [
      { subjectId: mathId },
      { subjectId: o1, isCompulsory: false },
      { subjectId: o2, isCompulsory: false },
    ];

    await put(curriculumUrl(), {
      subjects: [{ subjectId: mathId }, { subjectId: o2, isCompulsory: false }],
    }).expect(409); // removes o1
    await put(curriculumUrl(), {
      subjects: [
        { subjectId: mathId },
        { subjectId: o1, isCompulsory: false },
        { subjectId: o2 },
      ],
    }).expect(409); // o2 -> compulsory

    await choose(en1, []).expect(200);
    await choose(en2, []).expect(200);
    await put(curriculumUrl(), {
      subjects: [{ subjectId: mathId }, { subjectId: o2, isCompulsory: false }],
    }).expect(200); // now allowed
    await put(curriculumUrl(), { subjects: original }).expect(200);
  });

  it('drops choices when a returning student is enrolled into a different class', async () => {
    await choose(en3, [o2]).expect(200);
    const statusUrl = `/students/${st3}/status`;
    await post(statusUrl, {
      status: 'WITHDRAWN',
      effectiveOn: '2012-06-01',
      reason: 'Moved to another city',
    }).expect(200);
    await choose(en3, []).expect(409); // only a current enrollment can be changed
    expect(
      await prisma.studentSubjectChoice.count({ where: { enrollmentId: en3 } }),
    ).toBe(1); // history kept

    await post(`/students/${st3}/reactivate`).expect(200);
    const back = await post(`/students/${st3}/enrollments`, {
      academicYearId: yearId,
      sectionId: t1,
    }).expect(201);
    expect(back.body.data.id).toBe(en3); // same row
    expect(back.body.data.classId).toBe(c2);
    expect(
      await prisma.studentSubjectChoice.count({ where: { enrollmentId: en3 } }),
    ).toBe(0);
    await choose(en3, [xId]).expect(200); // now chooses from the new class's subjects
  });

  it('applies the teacher scope to rosters', async ({ skip }) => {
    if (hasRealActiveYear) skip(); // a real active year exists; run this against a clean test database

    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'ACTIVE' },
    });
    const teacherToken = await makeUser('teacher', [['students', 'read']]);
    const user = await prisma.user.findFirstOrThrow({
      where: { email: email('teacher') },
    });
    const staff = await prisma.staff.create({
      data: {
        staffNo: `E2E-${RUN}`,
        firstName: `${PFX}-staff`,
        lastName: 'Teacher',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: new Date('2020-01-01T00:00:00Z'),
        userId: user.id,
      },
    });
    await prisma.classTeacherAssignment.create({
      data: { academicYearId: yearId, sectionId: s1, staffId: staff.id },
    });

    await get(rosterUrl(s1, o2), teacherToken).expect(200);
    await get(rosterUrl(s2, o1), teacherToken).expect(403); // a section they do not teach
    await get(`/enrollments/${en2}/optional-subjects`, teacherToken).expect(
      200,
    ); // en2 is in s1
    await get(`/enrollments/${en1}/optional-subjects`, teacherToken).expect(
      403,
    ); // en1 moved to s2
    await choose(en2, [o1], teacherToken).expect(403); // teachers can read but not write
  });

  it('keeps closed years read-only', async () => {
    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'CLOSED' },
    });
    await choose(en2, [o1]).expect(409);
    await get(`/enrollments/${en2}/optional-subjects`).expect(200);
    await get(rosterUrl(s1, o1)).expect(200);
  });
});
