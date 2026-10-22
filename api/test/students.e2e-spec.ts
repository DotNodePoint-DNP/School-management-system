import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { adToBsString } from '../src/common/utils/bs-date.js';
import { hashPassword } from '../src/common/utils/password.js';
import { MessagingService } from '../src/infra/messaging/messaging.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

class FakeMessaging {
  sent: { channel: 'sms' | 'email'; to: string; text: string }[] = [];
  failing = false;
  sendSms(to: string, text: string) {
    return this.record('sms', to, text);
  }
  sendEmail(to: string, _subject: string, text: string) {
    return this.record('email', to, text);
  }
  private record(channel: 'sms' | 'email', to: string, text: string) {
    if (this.failing)
      return Promise.resolve({ ok: false, error: 'gateway down' });
    this.sent.push({ channel, to, text });
    return Promise.resolve({ ok: true });
  }
  lastPassword(): string {
    const text = this.sent.at(-1)?.text ?? '';
    return /Temporary password: (\S+)/.exec(text)?.[1] ?? '';
  }
}

const PFX = 'E2E-STU';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const phoneRaw = (n: number): string =>
  `98${String(RUN).slice(-6)}${String(n).padStart(2, '0')}`;
const phoneNorm = (n: number): string => `+977${phoneRaw(n)}`;
const email = (n: string): string => `e2e-stu-${RUN}-${n}@test.local`;
const ADMISSION = '2010-05-05';
const BS_YEAR = adToBsString(ADMISSION)?.slice(0, 4) ?? '';
const ADMISSION_2 = '2011-05-05';
const BS_YEAR_2 = adToBsString(ADMISSION_2)?.slice(0, 4) ?? '';

describe('Students, guardians and parent logins (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fake = new FakeMessaging();
  let managerToken = '';
  let clerkToken = '';
  let plainToken = '';
  let hasRealActiveYear = false;
  let phoneCounter = 0;
  let firstStudentId = '';
  let firstGuardianId = '';

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = managerToken) =>
    http().get(`${V1}${url}`).set(auth(token));
  const post = (url: string, body: object = {}, token = managerToken) =>
    http().post(`${V1}${url}`).set(auth(token)).send(body);
  const put = (url: string, body: object, token = managerToken) =>
    http().put(`${V1}${url}`).set(auth(token)).send(body);
  const del = (url: string, token = managerToken) =>
    http().delete(`${V1}${url}`).set(auth(token));
  const loginAs = (identifier: string, password: string) =>
    http().post(`${V1}/auth/login`).send({ identifier, password });

  const nextPhone = (): number => ++phoneCounter;
  const newStudent = (
    label: string,
    extra: object = {},
    guardian: object = {},
  ) => ({
    firstName: `${PFX}-${label}`,
    lastName: 'Rai',
    gender: 'MALE',
    dateOfBirth: '2004-04-04',
    admissionDate: ADMISSION,
    guardians: [
      {
        firstName: `${PFX}-G-${label}`,
        lastName: 'Rai',
        phone: phoneRaw(nextPhone()),
        relationship: 'FATHER',
        phoneConfirmed: true,
        ...guardian,
      },
    ],
    ...extra,
  });

  async function cleanup(): Promise<void> {
    const students = await prisma.student.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);
    await prisma.enrollment.deleteMany({
      where: { studentId: { in: studentIds } },
    });
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.classTeacherAssignment.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.section.deleteMany({
      where: { schoolClass: { name: { startsWith: PFX } } },
    });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    const guardians = await prisma.guardian.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true, userId: true },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: guardians.map((g) => g.id) } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: guardians.flatMap((g) => (g.userId ? [g.userId] : [])) },
      },
    });
    await prisma.staff.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    await prisma.sequence.deleteMany({
      where: {
        name: { in: [`admission:${BS_YEAR}`, `admission:${BS_YEAR_2}`] },
      },
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
    return (await loginAs(email(label), PASSWORD)).body.data
      .accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(MessagingService)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-stu-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    hasRealActiveYear =
      (await prisma.academicYear.findFirst({
        where: { status: 'ACTIVE', NOT: { name: { startsWith: PFX } } },
      })) !== null;

    managerToken = await makeUser('manager', [
      ['students', 'read-all'],
      ['students', 'create'],
      ['students', 'update'],
      ['students', 'delete'],
      ['guardians', 'read'],
      ['guardians', 'manage'],
      ['guardians', 'create-login'],
    ]);
    clerkToken = await makeUser('clerk', [
      ['students', 'create'],
      ['students', 'set-admission-no'],
    ]);
    plainToken = await makeUser('plain', []);
  });

  beforeEach(() => {
    fake.sent = [];
    fake.failing = false;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-stu-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires permissions', async () => {
    await post('/students', newStudent('x'), plainToken).expect(403);
    await get('/students', plainToken).expect(403);
    await get('/guardians', plainToken).expect(403);
  });

  it('admits a student, creates the parent login, and sends the credentials by SMS', async () => {
    const res = await post('/students', newStudent('Anil')).expect(201);
    const { student, logins } = res.body.data;
    firstStudentId = student.id as string;
    firstGuardianId = student.guardians[0].guardianId as string;

    expect(student.admissionNo).toMatch(new RegExp(`^ADM-${BS_YEAR}-\\d{3,}$`));
    expect(student).toMatchObject({
      status: 'ACTIVE',
      dateOfBirth: '2004-04-04',
      enrollment: null,
    });
    expect(student.guardians[0]).toMatchObject({
      isPrimary: true,
      relationship: 'FATHER',
      hasLogin: true,
    });
    expect(logins).toEqual([
      expect.objectContaining({
        status: 'sent',
        channel: 'sms',
        identifier: phoneNorm(phoneCounter),
      }),
    ]);
    expect(JSON.stringify(res.body)).not.toContain(fake.lastPassword()); // not exposed when delivery succeeded

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]?.to).toBe(phoneNorm(phoneCounter));

    const login = await loginAs(
      phoneNorm(phoneCounter),
      fake.lastPassword(),
    ).expect(200);
    expect(login.body.data.user).toMatchObject({
      mustChangePassword: true,
      roles: ['PARENT'],
    });
  });

  it('requires the guardian phone to be confirmed before credentials are sent', async () => {
    await post(
      '/students',
      newStudent('NoConfirm', {}, { phoneConfirmed: false }),
    ).expect(400);
    expect(fake.sent).toHaveLength(0);
    // Opting out of the login needs no confirmation.
    const res = await post(
      '/students',
      newStudent('NoLogin', {}, { phoneConfirmed: false, createLogin: false }),
    ).expect(201);
    expect(res.body.data.logins).toEqual([]);
    expect(fake.sent).toHaveLength(0);
  });

  it('validates admission input', async () => {
    const bad = (extra: object) => post('/students', newStudent('Bad', extra));
    await bad({ dateOfBirth: '2999-01-01' }).expect(400);
    await bad({ dateOfBirth: '2012-01-01' }).expect(400); // not before the admission date
    await bad({ guardians: [] }).expect(400);
    await bad({
      guardians: [{ firstName: `${PFX}-G`, relationship: 'FATHER' }],
    }).expect(400); // no contact
    await bad({
      dateOfBirth: '2004-04-04',
      dateOfBirthBs: '2060-12-21',
    }).expect(400);
    await bad({
      guardians: [
        {
          firstName: `${PFX}-G1`,
          phone: phoneRaw(90),
          relationship: 'FATHER',
          isPrimary: true,
          phoneConfirmed: true,
        },
        {
          firstName: `${PFX}-G2`,
          phone: phoneRaw(91),
          relationship: 'MOTHER',
          isPrimary: true,
          phoneConfirmed: true,
        },
      ],
    }).expect(400);
    expect(fake.sent).toHaveLength(0);
  });

  it('hands out unique admission numbers when admissions race', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(
          '/students',
          newStudent(
            `Race${i}`,
            {},
            { createLogin: false, phoneConfirmed: false },
          ),
        ),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const numbers = results.map(
      (r) => r.body.data.student.admissionNo as string,
    );
    expect(new Set(numbers).size).toBe(5);
    for (const n of numbers)
      expect(n).toMatch(new RegExp(`^ADM-${BS_YEAR}-\\d{3,}$`));
  });

  it('allows manual admission numbers only with permission, and the counter skips them', async () => {
    const manual = `ADM-${BS_YEAR_2}-001`;
    const noLogin = { createLogin: false, phoneConfirmed: false };
    await post(
      '/students',
      newStudent(
        'Manual0',
        { admissionNo: manual, admissionDate: ADMISSION_2 },
        noLogin,
      ),
    ).expect(403);

    const ok = await post(
      '/students',
      newStudent(
        'Manual1',
        { admissionNo: manual, admissionDate: ADMISSION_2 },
        noLogin,
      ),
      clerkToken,
    ).expect(201);
    expect(ok.body.data.student.admissionNo).toBe(manual);
    await post(
      '/students',
      newStudent(
        'Manual2',
        { admissionNo: manual, admissionDate: ADMISSION_2 },
        noLogin,
      ),
      clerkToken,
    ).expect(409);

    const auto = await post(
      '/students',
      newStudent('Auto', { admissionDate: ADMISSION_2 }, noLogin),
      clerkToken,
    ).expect(201);
    expect(auto.body.data.student.admissionNo).toBe(`ADM-${BS_YEAR_2}-002`); // 001 was taken manually
  });

  it('warns about a possible duplicate and lets the clerk override', async () => {
    const dup = (confirm?: boolean) =>
      post(
        '/students',
        newStudent(
          'Anil',
          { confirmNotDuplicate: confirm },
          { createLogin: false, phoneConfirmed: false },
        ),
      );
    const res = await dup().expect(409);
    expect(res.body.error.message).toMatch(/Possible duplicate of ADM-/);
    await dup(true).expect(201);
  });

  it('shows the password only when delivery fails, and resend replaces the old one', async () => {
    fake.failing = true;
    const res = await post('/students', newStudent('Sita')).expect(201);
    const outcome = res.body.data.logins[0];
    expect(outcome).toMatchObject({
      status: 'delivery_failed',
      channel: 'sms',
    });
    expect(outcome.temporaryPassword).toEqual(expect.any(String));
    const guardianId = outcome.guardianId as string;
    await loginAs(outcome.identifier, outcome.temporaryPassword).expect(200);

    fake.failing = false;
    const resent = await post(
      `/guardians/${guardianId}/resend-credentials`,
    ).expect(200);
    expect(resent.body.data.status).toBe('sent');
    expect(resent.body.data).not.toHaveProperty('temporaryPassword');
    const fresh = fake.lastPassword();
    expect(fresh).not.toBe(outcome.temporaryPassword);
    await loginAs(outcome.identifier, outcome.temporaryPassword).expect(401);
    await loginAs(outcome.identifier, fresh).expect(200);
  });

  it('expires temporary passwords', async () => {
    const res = await post('/students', newStudent('Expiry')).expect(201);
    const guardian = await prisma.guardian.findUniqueOrThrow({
      where: { id: res.body.data.logins[0].guardianId as string },
    });
    const identifier = res.body.data.logins[0].identifier as string;
    const password = fake.lastPassword();

    await prisma.user.update({
      where: { id: guardian.userId as string },
      data: { credentialsExpireAt: new Date(Date.now() - 1000) },
    });
    const expired = await loginAs(identifier, password).expect(401);
    expect(expired.body.error.message).toMatch(/expired/i);
    await loginAs(identifier, 'wrong-password-123').expect(401); // a guesser learns nothing about expiry
  });

  it('reuses a guardian for siblings and flags a phone already used by another person', async () => {
    const sibling = await post(
      '/students',
      newStudent('Sibling', {
        guardians: [{ guardianId: firstGuardianId, relationship: 'FATHER' }],
      }),
    ).expect(201);
    expect(sibling.body.data.logins).toEqual([
      { guardianId: firstGuardianId, status: 'exists' },
    ]);
    expect(fake.sent).toHaveLength(0);

    const shared = phoneRaw(1); // same number as the first guardian, but a different person
    const other = await post(
      '/students',
      newStudent(
        'SharedPhone',
        {},
        { firstName: `${PFX}-G-Other`, phone: shared },
      ),
    ).expect(201);
    expect(other.body.data.logins[0]).toMatchObject({
      status: 'contact_in_use',
    });
    expect(fake.sent).toHaveLength(0);
  });

  it('finds guardians by phone and shows their children', async () => {
    const found = await get('/guardians')
      .query({ phone: phoneRaw(1) })
      .expect(200);
    expect(found.body.data.map((g: { id: string }) => g.id)).toContain(
      firstGuardianId,
    );
    const detail = await get(`/guardians/${firstGuardianId}`).expect(200);
    expect(detail.body.data.children.length).toBeGreaterThanOrEqual(2);
    await get('/guardians').query({ phone: '12' }).expect(400);
  });

  it('keeps the login contact in step with the guardian', async () => {
    const newNumber = phoneRaw(80);
    await http()
      .patch(`${V1}/guardians/${firstGuardianId}`)
      .set(auth(managerToken))
      .send({ phone: newNumber })
      .expect(200);
    const guardian = await prisma.guardian.findUniqueOrThrow({
      where: { id: firstGuardianId },
    });
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: guardian.userId as string },
        })
      ).phone,
    ).toBe(`+977${newNumber}`);
  });

  it('lists with pagination without sensitive fields; detail includes guardian contacts', async () => {
    const list = await get('/students')
      .query({ search: `${PFX}-`, pageSize: 3 })
      .expect(200);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 3 });
    for (const s of list.body.data) {
      expect(s).not.toHaveProperty('address');
      expect(s).not.toHaveProperty('dateOfBirth');
      expect(s).not.toHaveProperty('guardians');
    }
    const byNumber = await get('/students')
      .query({ search: firstStudentAdmissionNo() })
      .expect(200);
    expect(byNumber.body.data.map((s: { id: string }) => s.id)).toContain(
      firstStudentId,
    );

    const detail = await get(`/students/${firstStudentId}`).expect(200);
    expect(detail.body.data.guardians[0].phone).toEqual(expect.any(String));
    await get(`/students/${randomUUID()}`).expect(404);
  });

  function firstStudentAdmissionNo(): string {
    return `ADM-${BS_YEAR}-`;
  }

  it('manages guardian links: exactly one primary, contact required', async () => {
    const guardianIds = (
      await get(`/students/${firstStudentId}`).expect(200)
    ).body.data.guardians.map(
      (g: { guardianId: string }) => g.guardianId,
    ) as string[];
    const url = `/students/${firstStudentId}/guardians`;
    await put(
      url,
      {
        guardians: [
          {
            guardianId: guardianIds[0],
            relationship: 'FATHER',
            isPrimary: false,
          },
        ],
      },
      managerToken,
    ).expect(400);
    await put(
      url,
      {
        guardians: [
          { guardianId: randomUUID(), relationship: 'FATHER', isPrimary: true },
        ],
      },
      managerToken,
    ).expect(400);
    const ok = await put(url, {
      guardians: [
        {
          guardianId: guardianIds[0],
          relationship: 'LEGAL_GUARDIAN',
          isPrimary: true,
          isEmergencyContact: true,
        },
      ],
    }).expect(200);
    expect(ok.body.data.guardians[0]).toMatchObject({
      relationship: 'LEGAL_GUARDIAN',
      isEmergencyContact: true,
    });
  });

  it('deletes only students without enrollment history', async () => {
    const created = await post(
      '/students',
      newStudent('Temp', {}, { createLogin: false, phoneConfirmed: false }),
    ).expect(201);
    await del(`/students/${created.body.data.student.id}`).expect(200);
    await get(`/students/${created.body.data.student.id}`).expect(404);

    const withHistory = await post(
      '/students',
      newStudent('History', {}, { createLogin: false, phoneConfirmed: false }),
    ).expect(201);
    const year = await prisma.academicYear.create({
      data: {
        name: `${PFX}-${RUN}-HIST`,
        startDate: new Date('2095-04-01T00:00:00Z'),
        endDate: new Date('2096-03-31T00:00:00Z'),
      },
    });
    const cls = await prisma.schoolClass.create({
      data: { name: `${PFX}-${RUN}-HIST`, sortOrder: 9 },
    });
    const section = await prisma.section.create({
      data: { classId: cls.id, name: 'A' },
    });
    await prisma.enrollment.create({
      data: {
        studentId: withHistory.body.data.student.id,
        academicYearId: year.id,
        classId: cls.id,
        sectionId: section.id,
      },
    });
    await del(`/students/${withHistory.body.data.student.id}`).expect(409);
  });

  it('shows teachers only the students of the sections they are assigned to', async ({
    skip,
  }) => {
    if (hasRealActiveYear) skip(); // a real active year exists; run this against a clean test database

    const year = await prisma.academicYear.create({
      data: {
        name: `${PFX}-${RUN}-ACTIVE`,
        startDate: new Date('2091-04-01T00:00:00Z'),
        endDate: new Date('2092-03-31T00:00:00Z'),
        status: 'ACTIVE',
      },
    });
    const cls = await prisma.schoolClass.create({
      data: { name: `${PFX}-${RUN}-SCOPE`, sortOrder: 8 },
    });
    const [s1, s2] = await Promise.all([
      prisma.section.create({ data: { classId: cls.id, name: 'A' } }),
      prisma.section.create({ data: { classId: cls.id, name: 'B' } }),
    ]);
    const noLogin = { createLogin: false, phoneConfirmed: false };
    const inA = (
      await post('/students', newStudent('InA', {}, noLogin)).expect(201)
    ).body.data.student.id as string;
    const inB = (
      await post('/students', newStudent('InB', {}, noLogin)).expect(201)
    ).body.data.student.id as string;
    await prisma.enrollment.create({
      data: {
        studentId: inA,
        academicYearId: year.id,
        classId: cls.id,
        sectionId: s1.id,
        rollNo: 1,
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: inB,
        academicYearId: year.id,
        classId: cls.id,
        sectionId: s2.id,
        rollNo: 1,
      },
    });

    const teacherToken = await makeUser('teacher', [['students', 'read']]);
    const teacherUser = await prisma.user.findFirstOrThrow({
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
        userId: teacherUser.id,
      },
    });
    await prisma.classTeacherAssignment.create({
      data: { academicYearId: year.id, sectionId: s1.id, staffId: staff.id },
    });

    const mine = await get('/students', teacherToken)
      .query({ search: `${PFX}-` })
      .expect(200);
    expect(mine.body.data.map((s: { id: string }) => s.id)).toEqual([inA]);
    expect(mine.body.data[0].enrollment).toMatchObject({
      sectionName: 'A',
      rollNo: 1,
    });

    await get(`/students/${inA}`, teacherToken).expect(200);
    await get(`/students/${inB}`, teacherToken).expect(404); // out of scope looks like "not found"

    // A user with students:read but no teaching assignment sees nothing.
    const stranger = await makeUser('stranger', [['students', 'read']]);
    await get('/students', stranger).expect(403);

    // students:read-all sees everyone.
    const all = await get('/students')
      .query({ search: `${PFX}-In` })
      .expect(200);
    expect(all.body.data.map((s: { id: string }) => s.id).sort()).toEqual(
      [inA, inB].sort(),
    );
  });
});
