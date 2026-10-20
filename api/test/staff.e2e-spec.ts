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

const PFX = 'E2E-STAFF';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const email = (n: string): string => `e2e-staff-${RUN}-${n}@test.local`;

describe('Staff and teaching assignments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken = '';
  let plainToken = '';
  let hasRealActiveYear = false;
  let roleId = '';
  let yearId = '';
  let classId = '';
  let sectionId = '';
  let subjectId = '';
  let otherSubjectId = '';
  let teacherId = '';
  let clerkId = '';

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
  const classTeacherUrl = `/academic-years/YEAR/sections/SECTION/class-teacher`;
  const urlFor = (tpl: string) =>
    tpl.replace('YEAR', yearId).replace('SECTION', sectionId);

  const newStaff = (label: string, extra: object = {}) => ({
    firstName: `${PFX}-${RUN}-${label}`,
    lastName: 'Tester',
    gender: 'FEMALE',
    kind: 'TEACHING',
    joinDate: '2023-04-14',
    ...extra,
  });

  async function cleanup(): Promise<void> {
    const staff = await prisma.staff.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true },
    });
    const staffIds = staff.map((s) => s.id);
    await prisma.teachingAssignment.deleteMany({
      where: { staffId: { in: staffIds } },
    });
    await prisma.classTeacherAssignment.deleteMany({
      where: { staffId: { in: staffIds } },
    });
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.teachingAssignment.deleteMany({
      where: { academicYearId: { in: yearIds } },
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
    await prisma.staff.deleteMany({ where: { id: { in: staffIds } } });
  }

  async function loginAs(address: string, password: string) {
    return http()
      .post(`${V1}/auth/login`)
      .send({ identifier: address, password });
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
      where: { email: { startsWith: 'e2e-staff-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    hasRealActiveYear =
      (await prisma.academicYear.findFirst({
        where: { status: 'ACTIVE', NOT: { name: { startsWith: PFX } } },
      })) !== null;

    const wanted = [
      ['staff', 'read'],
      ['staff', 'manage'],
      ['staff', 'create-login'],
      ['teaching', 'read'],
      ['teaching', 'assign'],
      ['classes', 'manage'],
    ].map(([module, action]) => ({
      module: module as string,
      action: action as string,
    }));
    const perms = await prisma.permission.findMany({ where: { OR: wanted } });
    if (perms.length !== wanted.length)
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');

    const managerRole = await prisma.role.create({
      data: {
        name: `${PFX}-${RUN}-MANAGER`,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
    });
    roleId = (
      await prisma.role.create({ data: { name: `${PFX}-${RUN}-HARMLESS` } })
    ).id;
    for (const [label, rid] of [
      ['manager', managerRole.id],
      ['plain', undefined],
    ] as const) {
      await prisma.user.create({
        data: {
          email: email(label),
          fullName: `E2E ${label}`,
          passwordHash: await hashPassword(PASSWORD),
          roles: rid ? { create: [{ roleId: rid }] } : undefined,
        },
      });
    }
    managerToken = (await loginAs(email('manager'), PASSWORD).then((r) => r))
      .body.data.accessToken as string;
    plainToken = (await loginAs(email('plain'), PASSWORD)).body.data
      .accessToken as string;

    // Fixtures go straight to the database so these tests stay focused on staff and teaching.
    const year = await prisma.academicYear.create({
      data: {
        name: `${PFX}-${RUN}-Y`,
        startDate: new Date('2081-04-01T00:00:00Z'),
        endDate: new Date('2082-03-31T00:00:00Z'),
      },
    });
    yearId = year.id;
    classId = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C`, sortOrder: 7 },
      })
    ).id;
    sectionId = (await prisma.section.create({ data: { classId, name: 'A' } }))
      .id;
    const tail = String(RUN).slice(-8);
    subjectId = (
      await prisma.subject.create({
        data: { code: `S${tail}A`, name: `${PFX}-${RUN}-Maths` },
      })
    ).id;
    otherSubjectId = (
      await prisma.subject.create({
        data: { code: `S${tail}B`, name: `${PFX}-${RUN}-Art` },
      })
    ).id;
    await prisma.classSubject.create({
      data: { academicYearId: yearId, classId, subjectId },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-staff-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires the staff permissions', async () => {
    await get('/staff', plainToken).expect(403);
    await post('/staff', newStaff('x'), plainToken).expect(403);
    await get('/staff').expect(200);
  });

  it('creates staff with an automatic number and validates the input', async () => {
    const res = await post(
      '/staff',
      newStaff('Sita', {
        phone: '9801234567',
        email: email('TEACHER').toUpperCase(),
        dateOfBirth: '1990-05-05',
      }),
    ).expect(201);
    teacherId = res.body.data.id as string;
    expect(res.body.data).toMatchObject({
      staffNo: expect.stringMatching(/^STF-\d{4,}$/),
      phone: '+9779801234567',
      email: email('teacher'),
      dateOfBirth: '1990-05-05',
      status: 'ACTIVE',
      hasLogin: false,
    });
    expect(res.body.data.dateOfBirthBs).toEqual(expect.any(String));

    await post(
      '/staff',
      newStaff('bad1', { dateOfBirth: '2999-01-01' }),
    ).expect(400);
    await post('/staff', newStaff('bad2', { phone: '123' })).expect(400);
    await post('/staff', newStaff('bad3', { gender: 'ROBOT' })).expect(400);
    await post(
      '/staff',
      newStaff('bad4', {
        dateOfBirth: '1990-05-05',
        dateOfBirthBs: '2047-01-22',
      }),
    ).expect(400);
    await post('/staff', { ...newStaff('bad5'), joinDate: undefined }).expect(
      400,
    );
  });

  it('hands out unique staff numbers even when creates race', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post('/staff', newStaff(`Race${i}`, { kind: 'NON_TEACHING' })),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const numbers = results.map((r) => r.body.data.staffNo as string);
    expect(new Set(numbers).size).toBe(5);
    clerkId = results[0]?.body.data.id as string;
  });

  it('lists with pagination and hides sensitive fields; the detail view shows them', async () => {
    const list = await get('/staff')
      .query({ search: `${PFX}-${RUN}`, pageSize: 2 })
      .expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(list.body.meta.total).toBeGreaterThanOrEqual(6);
    for (const item of list.body.data) {
      expect(item).not.toHaveProperty('phone');
      expect(item).not.toHaveProperty('address');
      expect(item).not.toHaveProperty('dateOfBirth');
    }
    const detail = await get(`/staff/${teacherId}`).expect(200);
    expect(detail.body.data.phone).toBe('+9779801234567');
    await get(`/staff/${randomUUID()}`).expect(404);
  });

  it('updates staff', async () => {
    const res = await patch(`/staff/${teacherId}`, {
      designation: 'Senior Teacher',
    }).expect(200);
    expect(res.body.data.designation).toBe('Senior Teacher');
  });

  it('creates a login for staff and the teacher can use it', async () => {
    const noContact = (await post('/staff', newStaff('NoContact')).expect(201))
      .body.data.id as string;
    await post(`/staff/${noContact}/create-login`, {
      roleIds: [roleId],
    }).expect(400);
    await post(
      `/staff/${teacherId}/create-login`,
      { roleIds: [roleId] },
      plainToken,
    ).expect(403);

    const res = await post(`/staff/${teacherId}/create-login`, {
      roleIds: [roleId],
    }).expect(201);
    expect(res.body.data.staff.hasLogin).toBe(true);
    const temporary = res.body.data.temporaryPassword as string;
    await post(`/staff/${teacherId}/create-login`, {
      roleIds: [roleId],
    }).expect(409);

    const first = await loginAs(email('teacher'), temporary).then((r) => r);
    const token = first.body.data.accessToken as string;
    await get('/staff/me/assignments', token).expect(403); // password change required first
    await post(
      '/auth/change-password',
      { currentPassword: temporary, newPassword: 'another-long-password' },
      token,
    ).expect(200);

    const second = await loginAs(email('teacher'), 'another-long-password');
    const mine = await get(
      '/staff/me/assignments',
      second.body.data.accessToken as string,
    ).expect(200);
    expect(mine.body.data.classTeacherOf).toEqual([]);
    expect(mine.body.data.teaches).toEqual([]);
  });

  it('assigns class and subject teachers with validation', async () => {
    const asClassTeacher = (staffId: string | null, token = managerToken) =>
      put(urlFor(classTeacherUrl), { staffId }, token);
    const asSubjectTeacher = (subject: string, staffId: string | null) =>
      put(
        urlFor(
          `/academic-years/YEAR/sections/SECTION/subjects/${subject}/teacher`,
        ),
        { staffId },
      );

    await asClassTeacher(teacherId, plainToken).expect(403);
    await asClassTeacher(clerkId).expect(409); // non-teaching staff
    await asClassTeacher(randomUUID()).expect(404);
    await put(urlFor(classTeacherUrl), {}).expect(400); // staffId must be present, or explicitly null
    await put(
      urlFor(
        '/academic-years/YEAR/sections/' + randomUUID() + '/class-teacher',
      ),
      { staffId: teacherId },
    ).expect(404);

    const set = await asClassTeacher(teacherId).expect(200);
    expect(set.body.data.classTeacher).toMatchObject({ id: teacherId });

    await asSubjectTeacher(otherSubjectId, teacherId).expect(409); // not in the class curriculum
    const withSubject = await asSubjectTeacher(subjectId, teacherId).expect(
      200,
    );
    expect(withSubject.body.data.subjects).toHaveLength(1);
    expect(withSubject.body.data.subjects[0].teacher).toMatchObject({
      id: teacherId,
    });

    const mine = await get(`/staff/${teacherId}/assignments`)
      .query({ academicYearId: yearId })
      .expect(200);
    expect(mine.body.data.classTeacherOf).toHaveLength(1);
    expect(mine.body.data.teaches).toHaveLength(1);
  });

  it('blocks changes that would orphan an assignment', async () => {
    await patch(`/staff/${teacherId}`, { kind: 'NON_TEACHING' }).expect(409);
    await post(`/staff/${teacherId}/leave`, {
      leftOn: '2025-01-31',
      reason: 'Resigned after the term ended',
    }).expect(409);
    await del(`/staff/${teacherId}`).expect(409);
  });

  it('lets a teacher with a clean slate leave: login deactivated, then they can be reactivated', async () => {
    await put(urlFor(classTeacherUrl), { staffId: null }).expect(200);
    await put(
      urlFor(
        `/academic-years/YEAR/sections/SECTION/subjects/${subjectId}/teacher`,
      ),
      { staffId: null },
    ).expect(200);
    const cleared = await get(
      urlFor('/academic-years/YEAR/sections/SECTION/teaching'),
    ).expect(200);
    expect(cleared.body.data.classTeacher).toBeNull();

    await post(`/staff/${teacherId}/leave`, {
      leftOn: '2022-01-01',
      reason: 'Date before they joined',
    }).expect(400);
    const left = await post(`/staff/${teacherId}/leave`, {
      leftOn: '2025-01-31',
      reason: 'Resigned after the term ended',
    }).expect(200);
    expect(left.body.data).toMatchObject({
      status: 'LEFT',
      leftOn: '2025-01-31',
    });
    expect(
      (
        await prisma.user.findFirstOrThrow({
          where: { email: email('teacher') },
        })
      ).isActive,
    ).toBe(false);
    expect((await loginAs(email('teacher'), 'another-long-password')).status).toBe(401);

    await put(urlFor(classTeacherUrl), { staffId: teacherId }).expect(409); // has left

    await post(`/staff/${teacherId}/reactivate`).expect(200);
    expect(
      (
        await prisma.user.findFirstOrThrow({
          where: { email: email('teacher') },
        })
      ).isActive,
    ).toBe(false); // login is a separate decision
  });

  it('shows a teacher their own sections once the year is active', async ({
    skip,
  }) => {
    if (hasRealActiveYear) skip(); // a real active year exists; run this against a clean test database

    await prisma.user.update({
      where: { email: email('teacher') },
      data: { isActive: true, mustChangePassword: false },
    });
    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'ACTIVE' },
    });
    await put(urlFor(classTeacherUrl), { staffId: teacherId }).expect(200);

    const token = (await loginAs(email('teacher'), 'another-long-password'))
      .body.data.accessToken as string;
    const mine = await get('/staff/me/assignments', token).expect(200);
    expect(mine.body.data.academicYear).toMatchObject({ id: yearId });
    expect(mine.body.data.classTeacherOf).toEqual([
      expect.objectContaining({ sectionId, classId }),
    ]);
    await get('/staff/me/assignments', plainToken).expect(404); // not a staff member
  });

  it('keeps closed years read-only', async () => {
    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'CLOSED' },
    });
    await put(urlFor(classTeacherUrl), { staffId: teacherId }).expect(409);
    await put(urlFor(classTeacherUrl), { staffId: null }).expect(409);
    await get(urlFor('/academic-years/YEAR/sections/SECTION/teaching')).expect(
      200,
    );
  });

  it('sets and clears a section capacity', async () => {
    const url = `/classes/${classId}/sections/${sectionId}`;
    expect(
      (await patch(url, { capacity: 30 }).expect(200)).body.data.capacity,
    ).toBe(30);
    expect(
      (await patch(url, { capacity: null }).expect(200)).body.data.capacity,
    ).toBeNull();
    await patch(url, { capacity: 0 }).expect(400);
  });
});
