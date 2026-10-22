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

const PFX = 'E2E-ENR';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const BS_YEAR = adToBsString('2010-05-05')?.slice(0, 4) ?? '';
const email = (n: string): string => `e2e-enr-${RUN}-${n}@test.local`;
const phoneRaw = (n: number): string =>
  `98${String(RUN).slice(-6)}${String(n).padStart(2, '0')}`;

type RollItem = {
  enrollmentId: string;
  studentId: string;
  name: string;
  rollNo: number | null;
};

describe('Enrollment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken = '';
  let plainToken = '';
  let strangerToken = '';
  let phoneCounter = 0;
  let yearId = '';
  let classA = '';
  let classB = '';
  const sec: Record<'A1' | 'A2' | 'A3' | 'B1' | 'B2', string> = {
    A1: '',
    A2: '',
    A3: '',
    B1: '',
    B2: '',
  };

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
  const del = (url: string, token = managerToken) =>
    http().delete(`${V1}${url}`).set(auth(token));

  const admit = (label: string, placement?: object) =>
    post('/students', {
      firstName: `${PFX}-${label}`,
      lastName: 'Rai',
      gender: 'MALE',
      dateOfBirth: '2004-04-04',
      admissionDate: '2010-05-05',
      guardians: [
        {
          firstName: `${PFX}-G`,
          phone: phoneRaw(++phoneCounter),
          relationship: 'FATHER',
          createLogin: false,
        },
      ],
      ...(placement
        ? { placement: { academicYearId: yearId, ...placement } }
        : {}),
    });
  const studentIdOf = (res: {
    body: { data: { student: { id: string } } };
  }): string => res.body.data.student.id;
  const enrollInto = (
    studentId: string,
    sectionId: string,
    extra: object = {},
  ) =>
    post(`/students/${studentId}/enrollments`, {
      academicYearId: yearId,
      sectionId,
      ...extra,
    });
  const rollList = async (sectionId: string): Promise<RollItem[]> =>
    (
      await get(
        `/academic-years/${yearId}/sections/${sectionId}/enrollments`,
      ).expect(200)
    ).body.data as RollItem[];
  const rollOf = async (
    sectionId: string,
    studentId: string,
  ): Promise<number | null> =>
    (await rollList(sectionId)).find((r) => r.studentId === studentId)
      ?.rollNo ?? null;
  const enrolledCount = async (sectionId: string): Promise<number> =>
    (
      (await get(`/academic-years/${yearId}/occupancy`).expect(200)).body
        .data as { sectionId: string; enrolled: number }[]
    ).find((o) => o.sectionId === sectionId)?.enrolled ?? -1;

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
      where: { email: { startsWith: 'e2e-enr-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });

    managerToken = await makeUser('manager', [
      ['students', 'create'],
      ['students', 'read-all'],
      ['students', 'change-status'],
      ['enrollments', 'read'],
      ['enrollments', 'manage'],
      ['classes', 'manage'],
    ]);
    plainToken = await makeUser('plain', []);
    strangerToken = await makeUser('stranger', [['students', 'read']]);

    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y`,
          startDate: new Date('2096-04-01T00:00:00Z'),
          endDate: new Date('2097-03-31T00:00:00Z'),
        },
      })
    ).id;
    classA = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-A`, sortOrder: 6 },
      })
    ).id;
    classB = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-B`, sortOrder: 7 },
      })
    ).id;
    sec.A1 = (
      await prisma.section.create({
        data: { classId: classA, name: 'A1', capacity: 2 },
      })
    ).id;
    sec.A2 = (
      await prisma.section.create({ data: { classId: classA, name: 'A2' } })
    ).id;
    sec.A3 = (
      await prisma.section.create({
        data: { classId: classA, name: 'A3', capacity: 1 },
      })
    ).id;
    sec.B1 = (
      await prisma.section.create({
        data: { classId: classB, name: 'B1', capacity: 1 },
      })
    ).id;
    sec.B2 = (
      await prisma.section.create({ data: { classId: classB, name: 'B2' } })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-enr-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires the right permissions', async () => {
    const someone = studentIdOf(await admit('Perm').expect(201));
    await post(
      `/students/${someone}/enrollments`,
      { academicYearId: yearId, sectionId: sec.A2 },
      plainToken,
    ).expect(403);
    await patch(
      `/enrollments/${randomUUID()}/section`,
      { sectionId: sec.A2 },
      plainToken,
    ).expect(403);
    await get(
      `/academic-years/${yearId}/sections/${sec.A2}/enrollments`,
      plainToken,
    ).expect(403);
    await get(
      `/academic-years/${yearId}/sections/${sec.A2}/enrollments`,
      strangerToken,
    ).expect(403); // not assigned to the section
    await get(`/academic-years/${yearId}/occupancy`, strangerToken).expect(403);
    await post(
      '/students',
      {
        firstName: `${PFX}-NoPerm`,
        lastName: 'Rai',
        gender: 'MALE',
        dateOfBirth: '2004-04-04',
        admissionDate: '2010-05-05',
        guardians: [
          {
            firstName: `${PFX}-G`,
            phone: phoneRaw(++phoneCounter),
            relationship: 'FATHER',
            createLogin: false,
          },
        ],
        placement: { academicYearId: yearId, sectionId: sec.A2 },
      },
      await makeUser('clerk', [['students', 'create']]),
    ).expect(403);
  });

  it('admits with a placement, numbers students last, and stops at capacity without leaving a student behind', async () => {
    const first = studentIdOf(
      await admit('A1a', { sectionId: sec.A1 }).expect(201),
    );
    const second = studentIdOf(
      await admit('A1b', { sectionId: sec.A1 }).expect(201),
    );
    expect(await rollOf(sec.A1, first)).toBe(1);
    expect(await rollOf(sec.A1, second)).toBe(2);

    const full = await admit('A1c', { sectionId: sec.A1 }).expect(409);
    expect(full.body.error.message).toMatch(/full/);
    expect(
      await prisma.student.count({ where: { firstName: `${PFX}-A1c` } }),
    ).toBe(0); // admission rolled back
    expect(await enrolledCount(sec.A1)).toBe(2);
  });

  it('never over-fills a section when admissions race', async () => {
    const results = await Promise.all(
      [0, 1, 2].map((i) => admit(`Race${i}`, { sectionId: sec.A3 })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(
      await prisma.student.count({
        where: { firstName: { startsWith: `${PFX}-Race` } },
      }),
    ).toBe(1);
    expect(await enrolledCount(sec.A3)).toBe(1);
  });

  it('assigns roll numbers: new admissions last, manual numbers must be free, numbers are not reused', async () => {
    const x1 = studentIdOf(
      await admit('X1', { sectionId: sec.A2 }).expect(201),
    );
    const x2 = studentIdOf(
      await admit('X2', { sectionId: sec.A2 }).expect(201),
    );
    studentIdOf(await admit('X3', { sectionId: sec.A2 }).expect(201));
    const x1Enrollment = (await rollList(sec.A2)).find(
      (r) => r.studentId === x1,
    )?.enrollmentId as string;

    await patch(`/enrollments/${x1Enrollment}/roll-number`, {
      rollNo: 2,
    }).expect(409); // taken by X2
    await patch(`/enrollments/${x1Enrollment}/roll-number`, {
      rollNo: 10,
    }).expect(200);
    expect(await rollOf(sec.A2, x1)).toBe(10);

    const x4 = studentIdOf(
      await admit('X4', { sectionId: sec.A2 }).expect(201),
    );
    expect(await rollOf(sec.A2, x4)).toBe(11); // last + 1

    await post(`/students/${x4}/status`, {
      status: 'WITHDRAWN',
      effectiveOn: '2012-06-01',
      reason: 'Family moved abroad',
    }).expect(200);
    const x5 = studentIdOf(
      await admit('X5', { sectionId: sec.A2 }).expect(201),
    );
    expect(await rollOf(sec.A2, x5)).toBe(12); // 11 stays with the student who left

    const manual = studentIdOf(
      await admit('X6', { sectionId: sec.A2, rollNo: 30 }).expect(201),
    );
    expect(await rollOf(sec.A2, manual)).toBe(30);
    await admit('X7', { sectionId: sec.A2, rollNo: 30 }).expect(409);
    expect(
      await prisma.student.count({ where: { firstName: `${PFX}-X7` } }),
    ).toBe(0);
    expect(await rollOf(sec.A2, x2)).toBe(2);
  });

  it('enrolls existing students and validates the placement', async () => {
    const e1 = studentIdOf(await admit('E1').expect(201));
    const bad = (sectionId: string) => enrollInto(e1, sectionId);

    await bad(randomUUID()).expect(404);
    await enrollInto(randomUUID(), sec.A2).expect(404);

    await prisma.section.update({
      where: { id: sec.A2 },
      data: { isActive: false },
    });
    await bad(sec.A2).expect(409);
    await prisma.section.update({
      where: { id: sec.A2 },
      data: { isActive: true },
    });

    await prisma.schoolClass.update({
      where: { id: classA },
      data: { isActive: false },
    });
    await bad(sec.A2).expect(409);
    await prisma.schoolClass.update({
      where: { id: classA },
      data: { isActive: true },
    });

    await bad(sec.A2).expect(201);
    await bad(sec.A2).expect(409); // already enrolled this year

    const closedYear = await prisma.academicYear.create({
      data: {
        name: `${PFX}-${RUN}-CLOSED`,
        startDate: new Date('2098-04-01T00:00:00Z'),
        endDate: new Date('2099-03-31T00:00:00Z'),
        status: 'CLOSED',
      },
    });
    await post(`/students/${e1}/enrollments`, {
      academicYearId: closedYear.id,
      sectionId: sec.A2,
    }).expect(409);
    await post(`/students/${e1}/enrollments`, { sectionId: sec.A2 }).expect(
      400,
    ); // no active year to default to... or a real one exists
  });

  it('moves students between sections of the same class', async () => {
    const m1 = studentIdOf(
      await admit('M1', { sectionId: sec.B1 }).expect(201),
    );
    const m2 = studentIdOf(
      await admit('M2', { sectionId: sec.B2 }).expect(201),
    );
    studentIdOf(await admit('M3', { sectionId: sec.B2 }).expect(201));
    const enrollmentOf = async (sectionId: string, studentId: string) =>
      (await rollList(sectionId)).find((r) => r.studentId === studentId)
        ?.enrollmentId as string;

    await patch(`/enrollments/${await enrollmentOf(sec.B2, m2)}/section`, {
      sectionId: sec.B1,
    }).expect(409); // B1 is full

    const moved = await patch(
      `/enrollments/${await enrollmentOf(sec.B1, m1)}/section`,
      { sectionId: sec.B2 },
    ).expect(200);
    expect(moved.body.data).toMatchObject({ sectionName: 'B2', rollNo: 3 }); // last in the destination
    expect(await enrolledCount(sec.B1)).toBe(0);

    const back = await patch(
      `/enrollments/${await enrollmentOf(sec.B2, m2)}/section`,
      { sectionId: sec.B1 },
    ).expect(200);
    expect(back.body.data.rollNo).toBe(1);
    await patch(`/enrollments/${back.body.data.id}/section`, {
      sectionId: sec.B1,
    }).expect(400); // already there
    await patch(`/enrollments/${back.body.data.id}/section`, {
      sectionId: sec.A2,
    }).expect(400); // another class
    await patch(`/enrollments/${randomUUID()}/section`, {
      sectionId: sec.B1,
    }).expect(404);
  });

  it('reassigns roll numbers from an ordered list, including swaps', async () => {
    const [first, second] = await rollList(sec.B2); // two current students
    expect(first && second).toBeTruthy();
    const url = `/academic-years/${yearId}/sections/${sec.B2}/roll-numbers`;
    const ids = [
      (first as RollItem).enrollmentId,
      (second as RollItem).enrollmentId,
    ];

    await put(url, { order: [ids[1], ids[0]] }).expect(200);
    expect(
      (await rollList(sec.B2)).map((r) => [r.enrollmentId, r.rollNo]),
    ).toEqual([
      [ids[1], 1],
      [ids[0], 2],
    ]);
    await put(url, { order: [ids[0], ids[1]] }).expect(200); // and back: a swap must not collide
    expect((await rollList(sec.B2)).map((r) => r.rollNo)).toEqual([1, 2]);

    await put(url, { order: [ids[0]] }).expect(400); // incomplete
    await put(url, { order: [ids[0], ids[1], randomUUID()] }).expect(400); // unknown
    await put(url, { order: [ids[0], ids[0]] }).expect(400); // duplicate
    await put(url, { order: [ids[0], ids[1]] }, plainToken).expect(403);
  });

  it('closes enrollments on withdrawal or graduation, and re-enrolls a returning student into the same row', async () => {
    const list = await rollList(sec.B2);
    const [stayer, leaver] = [list[0] as RollItem, list[1] as RollItem];
    const url = `/students/${leaver.studentId}/status`;

    await post(url, {
      status: 'WITHDRAWN',
      effectiveOn: '2999-01-01',
      reason: 'A reason long enough',
    }).expect(400); // future
    await post(url, {
      status: 'WITHDRAWN',
      effectiveOn: '2005-01-01',
      reason: 'A reason long enough',
    }).expect(400); // before admission
    await post(url, {
      status: 'WITHDRAWN',
      effectiveOn: '2012-06-01',
      reason: 'short',
    }).expect(400);
    await post(
      url,
      {
        status: 'WITHDRAWN',
        effectiveOn: '2012-06-01',
        reason: 'A reason long enough',
      },
      plainToken,
    ).expect(403);

    const before = await enrolledCount(sec.B2);
    const res = await post(url, {
      status: 'WITHDRAWN',
      effectiveOn: '2012-06-01',
      reason: 'Moved to another city',
    }).expect(200);
    expect(res.body.data).toMatchObject({
      status: 'WITHDRAWN',
      enrollmentsClosed: 1,
    });
    await post(url, {
      status: 'WITHDRAWN',
      effectiveOn: '2012-06-01',
      reason: 'Moved to another city',
    }).expect(409);

    const closed = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: leaver.studentId },
    });
    expect(closed).toMatchObject({ status: 'WITHDRAWN' });
    expect(closed.rollNo).not.toBeNull(); // history keeps the number
    expect(await enrolledCount(sec.B2)).toBe(before - 1);
    expect(
      (await get(`/students/${leaver.studentId}`).expect(200)).body.data,
    ).toMatchObject({ status: 'WITHDRAWN' });
    await enrollInto(leaver.studentId, sec.B2).expect(409); // must be reactivated first

    await post(`/students/${leaver.studentId}/reactivate`).expect(200);
    await post(`/students/${leaver.studentId}/reactivate`).expect(409);
    const again = await enrollInto(leaver.studentId, sec.B2).expect(201);
    expect(again.body.data.id).toBe(closed.id); // same row, no duplicate
    expect(again.body.data.rollNo).toBe(3); // highest ever used in the section is 2, so last + 1

    await post(`/students/${stayer.studentId}/status`, {
      status: 'GRADUATED',
      effectiveOn: '2012-06-01',
      reason: 'Completed the final class',
    }).expect(200);
    expect(
      (
        await prisma.enrollment.findFirstOrThrow({
          where: { studentId: stayer.studentId },
        })
      ).status,
    ).toBe('COMPLETED');
  });

  it('deletes a mistaken enrollment, and only a current one', async () => {
    const d1 = studentIdOf(
      await admit('D1', { sectionId: sec.A2 }).expect(201),
    );
    const enrollmentId = (await rollList(sec.A2)).find(
      (r) => r.studentId === d1,
    )?.enrollmentId as string;
    await del(`/enrollments/${enrollmentId}`, plainToken).expect(403);
    await del(`/enrollments/${enrollmentId}`).expect(200);
    await del(`/enrollments/${enrollmentId}`).expect(404);
    await enrollInto(d1, sec.A2).expect(201); // can be placed again
  });

  it('shows occupancy, and refuses a capacity below the number of enrolled students', async () => {
    const occupancy = (
      await get(`/academic-years/${yearId}/occupancy`).expect(200)
    ).body.data as {
      sectionId: string;
      capacity: number | null;
      enrolled: number;
    }[];
    expect(occupancy.find((o) => o.sectionId === sec.A1)).toMatchObject({
      capacity: 2,
      enrolled: 2,
    });
    await get(`/academic-years/${randomUUID()}/occupancy`).expect(404);

    const url = `/classes/${classA}/sections/${sec.A1}`;
    await patch(url, { capacity: 1 }).expect(409);
    await patch(url, { capacity: 2 }).expect(200);
    expect(
      (await patch(url, { capacity: null }).expect(200)).body.data.capacity,
    ).toBeNull();
  });
});
