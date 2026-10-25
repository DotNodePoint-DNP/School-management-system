import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { adToBsString, isoToDate } from '../src/common/utils/bs-date.js';
import { hashPassword } from '../src/common/utils/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PFX = 'E2E-ATT';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const BS_YEAR = adToBsString('2010-05-05')?.slice(0, 4) ?? '';
const email = (n: string): string => `e2e-att-${RUN}-${n}@test.local`;
const phoneRaw = (n: number): string =>
  `98${String(RUN).slice(-6)}${String(n).padStart(2, '0')}`;
const day = (shift: number): string =>
  new Date(Date.now() + 345 * 60_000 + shift * 86_400_000)
    .toISOString()
    .slice(0, 10);
const weekday = (iso: string): number =>
  new Date(`${iso}T00:00:00Z`).getUTCDay();

type Roster = {
  session: { id: string } | null;
  isSchoolDay: boolean;
  editableByMe: boolean;
  dateBs: string | null;
  students: {
    enrollmentId: string;
    studentId: string;
    status: string | null;
  }[];
};

describe('Attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = false;
  let phoneCounter = 0;
  let yearId = '';
  let s1 = '';
  let s2 = '';
  let s3 = '';
  let adminToken = '';
  let teacherToken = '';
  let subjectTeacherToken = '';
  let otherTeacherToken = '';
  let officeToken = '';
  let plainToken = '';
  const stu: Record<'s1a' | 's1b' | 's1c' | 's2a' | 's3a', string> = {
    s1a: '',
    s1b: '',
    s1c: '',
    s2a: '',
    s3a: '',
  };

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
  const sectionUrl = (section: string, date: string): string =>
    `/academic-years/${yearId}/sections/${section}/attendance/${date}`;

  const roster = async (
    section: string,
    date: string,
    token = adminToken,
  ): Promise<Roster> => {
    const res = await get(sectionUrl(section, date), token);
    expect(res.status).toBe(200);
    return res.body.data as Roster;
  };
  const enrollmentOf = async (
    section: string,
    date: string,
    student: string,
  ): Promise<string> =>
    (await roster(section, date)).students.find((s) => s.studentId === student)
      ?.enrollmentId as string;

  /** Marks everyone PRESENT except the overrides (by student id). */
  const submit = async (
    section: string,
    date: string,
    overrides: Record<string, string> = {},
    token = adminToken,
    extra: object = {},
  ) => {
    const r = await roster(section, date, token);
    return put(
      sectionUrl(section, date),
      {
        records: r.students.map((s) => ({
          enrollmentId: s.enrollmentId,
          status: overrides[s.studentId] ?? 'PRESENT',
        })),
        ...extra,
      },
      token,
    );
  };
  const REASON = { reason: 'Back-filled after the edit window by the office' };

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
    await prisma.attendanceRecord.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.calendarEntry.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.teachingAssignment.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.classTeacherAssignment.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.classSubject.deleteMany({
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
  ): Promise<{ token: string; userId: string }> {
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
    const res = await http()
      .post(`${V1}/auth/login`)
      .send({ identifier: email(label), password: PASSWORD });
    expect(res.status).toBe(200);
    return { token: res.body.data.accessToken as string, userId: user.id };
  }

  const makeStaff = (label: string, userId: string) =>
    prisma.staff.create({
      data: {
        staffNo: `E2E-${RUN}-${label}`,
        firstName: `${PFX}-${label}`,
        lastName: 'Teacher',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: new Date('2020-01-01T00:00:00Z'),
        userId,
      },
    });

  const admit = async (label: string, section: string): Promise<string> => {
    const res = await post('/students', {
      firstName: `${PFX}-${label}`,
      lastName: 'Rai',
      gender: 'MALE',
      dateOfBirth: '2004-04-04',
      admissionDate: day(-30),
      guardians: [
        {
          firstName: `${PFX}-G`,
          phone: phoneRaw(++phoneCounter),
          relationship: 'FATHER',
          createLogin: false,
        },
      ],
      placement: { academicYearId: yearId, sectionId: section },
    });
    expect(res.status).toBe(201);
    return res.body.data.student.id as string;
  };

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
      where: { email: { startsWith: 'e2e-att-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });

    const start = day(-40);
    const end = day(40);
    blocked =
      (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' } })) !==
        null ||
      (await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: isoToDate(end) },
          endDate: { gte: isoToDate(start) },
        },
      })) !== null;
    if (blocked) return;

    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y`,
          startDate: isoToDate(start),
          endDate: isoToDate(end),
          status: 'ACTIVE',
          weeklyOffDays: [],
        },
      })
    ).id;
    const cls = await prisma.schoolClass.create({
      data: { name: `${PFX}-${RUN}-C`, sortOrder: 4 },
    });
    s1 = (
      await prisma.section.create({ data: { classId: cls.id, name: 'S1' } })
    ).id;
    s2 = (
      await prisma.section.create({ data: { classId: cls.id, name: 'S2' } })
    ).id;
    s3 = (
      await prisma.section.create({ data: { classId: cls.id, name: 'S3' } })
    ).id;

    adminToken = (
      await makeUser('admin', [
        ['attendance', 'read-all'],
        ['attendance', 'mark-any'],
        ['attendance', 'correct'],
        ['attendance', 'calendar-manage'],
        ['students', 'create'],
        ['enrollments', 'manage'],
      ])
    ).token;
    officeToken = (await makeUser('office', [['attendance', 'mark-any']]))
      .token;
    plainToken = (await makeUser('plain', [])).token;

    const teacher = await makeUser('teacher', [
      ['attendance', 'mark'],
      ['attendance', 'read'],
    ]);
    teacherToken = teacher.token;
    const other = await makeUser('other', [
      ['attendance', 'mark'],
      ['attendance', 'read'],
    ]);
    otherTeacherToken = other.token;
    const subject = await makeUser('subject', [['attendance', 'read']]);
    subjectTeacherToken = subject.token;

    const maths = await prisma.subject.create({
      data: { code: `A${TAIL}`, name: `${PFX}-${RUN}-Maths` },
    });
    await prisma.classSubject.create({
      data: { academicYearId: yearId, classId: cls.id, subjectId: maths.id },
    });
    const classTeacher = await makeStaff('ct', teacher.userId);
    const subjectStaff = await makeStaff('st', subject.userId);
    await makeStaff('ot', other.userId);
    await prisma.classTeacherAssignment.create({
      data: { academicYearId: yearId, sectionId: s1, staffId: classTeacher.id },
    });
    await prisma.teachingAssignment.create({
      data: {
        academicYearId: yearId,
        sectionId: s1,
        classId: cls.id,
        subjectId: maths.id,
        staffId: subjectStaff.id,
      },
    });

    stu.s1a = await admit('s1a', s1);
    stu.s1b = await admit('s1b', s1);
    stu.s1c = await admit('s1c', s1);
    stu.s2a = await admit('s2a', s2);
    stu.s3a = await admit('s3a', s3);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-att-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('requires access to the section', async ({ skip }) => {
    if (blocked) skip();
    const resPlain = await get(sectionUrl(s1, day(0)), plainToken);
    expect(resPlain.status).toBe(403);

    const resOther = await get(sectionUrl(s1, day(0)), otherTeacherToken);
    expect(resOther.status).toBe(403); // not assigned to S1

    const resSubject = await get(sectionUrl(s1, day(0)), subjectTeacherToken);
    expect(resSubject.status).toBe(200); // subject teachers can read

    const resPutPlain = await put(
      sectionUrl(s1, day(0)),
      { records: [] },
      plainToken,
    );
    expect(resPutPlain.status).toBe(403);

    const resDate = await get(sectionUrl(s1, 'not-a-date'));
    expect(resDate.status).toBe(400);
  });

  it('shows the roster before attendance is taken', async ({ skip }) => {
    if (blocked) skip();
    const r = await roster(s1, day(0));
    expect(r).toMatchObject({
      session: null,
      isSchoolDay: true,
      editableByMe: true,
    });
    expect(r.students).toHaveLength(3);
    expect(r.students.every((s) => s.status === null)).toBe(true);

    const rosterTeacher = await roster(s1, day(0), teacherToken);
    expect(rosterTeacher.editableByMe).toBe(true);

    const rosterSubject = await roster(s1, day(0), subjectTeacherToken);
    expect(rosterSubject.editableByMe).toBe(false);
  });

  it('lets the class teacher take attendance, and records the counts without names', async ({
    skip,
  }) => {
    if (blocked) skip();
    const res = await submit(
      s1,
      day(0),
      { [stu.s1b]: 'ABSENT', [stu.s1c]: 'LATE' },
      teacherToken,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.session).toMatchObject({ takenByName: 'E2E teacher' });
    const statusOf = (student: string): string | null =>
      (res.body.data as Roster).students.find((s) => s.studentId === student)
        ?.status ?? null;
    expect([statusOf(stu.s1a), statusOf(stu.s1b), statusOf(stu.s1c)]).toEqual([
      'PRESENT',
      'ABSENT',
      'LATE',
    ]);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'attendance.taken', entityId: res.body.data.session.id },
    });
    expect(audit.details).toMatchObject({
      counts: { PRESENT: 1, ABSENT: 1, LATE: 1, LEAVE: 0 },
    });
    expect(JSON.stringify(audit.details)).not.toContain(PFX);

    const resRepeat = await submit(s1, day(0), {}, teacherToken);
    expect(resRepeat.status).toBe(409); // already taken
  });

  it('rejects incomplete, duplicate, unknown and invalid submissions', async ({
    skip,
  }) => {
    if (blocked) skip();
    const date = day(-2);
    const r = await roster(s2, date);
    const only = r.students[0] as Roster['students'][number];
    const url = sectionUrl(s2, date);
    const base = { reason: 'Back-filled while testing validation' };

    const r1 = await put(url, { records: [], ...base });
    expect(r1.status).toBe(400);

    const r2 = await put(url, {
      records: [{ enrollmentId: randomUUID(), status: 'PRESENT' }],
      ...base,
    });
    expect(r2.status).toBe(400); // unknown

    const r3 = await put(url, {
      records: [{ enrollmentId: only.enrollmentId, status: 'SICK' }],
      ...base,
    });
    expect(r3.status).toBe(400); // bad status

    const r4 = await put(url, {
      records: [
        { enrollmentId: only.enrollmentId, status: 'PRESENT' },
        { enrollmentId: only.enrollmentId, status: 'ABSENT' },
      ],
      ...base,
    });
    expect(r4.status).toBe(400);

    const r5 = await put(sectionUrl(s2, day(1)), {
      records: [{ enrollmentId: only.enrollmentId, status: 'PRESENT' }],
    });
    expect(r5.status).toBe(400); // future

    const r6 = await put(sectionUrl(s2, day(-100)), {
      records: [{ enrollmentId: only.enrollmentId, status: 'PRESENT' }],
      ...base,
    });
    expect(r6.status).toBe(400); // outside the year
  });

  it('lets office staff take attendance for any section, but not outside the edit window', async ({
    skip,
  }) => {
    if (blocked) skip();
    const r1 = await submit(s2, day(0), {}, officeToken);
    expect(r1.status).toBe(200);

    const r2 = await submit(s3, day(-3), {}, officeToken);
    expect(r2.status).toBe(403); // window passed, and office cannot correct

    const r3 = await submit(s1, day(-1), {}, otherTeacherToken);
    expect(r3.status).toBe(403); // not S1's class teacher
  });

  it('enforces the edit window, mandatory reasons and the correction history', async ({
    skip,
  }) => {
    if (blocked) skip();
    // Yesterday is inside the 1-day window; three days ago is not.
    const r1 = await submit(s1, day(-1), { [stu.s1b]: 'LEAVE' }, teacherToken);
    expect(r1.status).toBe(200);

    const r2 = await submit(s1, day(-3), {}, teacherToken);
    expect(r2.status).toBe(403);

    const r3 = await submit(s1, day(-3));
    expect(r3.status).toBe(400); // admin can, but must give a reason

    const r4 = await submit(s1, day(-3), {}, adminToken, REASON);
    expect(r4.status).toBe(200);

    const today = await enrollmentOf(s1, day(0), stu.s1b);
    const todayUrl = `${sectionUrl(s1, day(0))}/records/${today}`;
    const p1 = await patch(todayUrl, {}, teacherToken);
    expect(p1.status).toBe(400); // nothing to change

    const p2 = await patch(todayUrl, { status: 'ABSENT' }, teacherToken);
    expect(p2.status).toBe(400); // already ABSENT

    const fixed = await patch(todayUrl, { status: 'LATE' }, teacherToken);
    expect(fixed.status).toBe(200);
    expect(fixed.body.data).toMatchObject({
      status: 'LATE',
      source: 'MANUAL',
      withinWindow: true,
    });

    const old = await enrollmentOf(s1, day(-3), stu.s1b);
    const oldUrl = `${sectionUrl(s1, day(-3))}/records/${old}`;
    const op1 = await patch(oldUrl, { status: 'ABSENT' }, teacherToken);
    expect(op1.status).toBe(403);

    const op2 = await patch(oldUrl, { status: 'ABSENT' }, officeToken);
    expect(op2.status).toBe(403);

    const op3 = await patch(oldUrl, { status: 'ABSENT' });
    expect(op3.status).toBe(400); // reason required

    const corrected = await patch(oldUrl, {
      status: 'ABSENT',
      reason: 'Parent confirmed the absence',
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data).toMatchObject({
      status: 'ABSENT',
      source: 'CORRECTION',
      withinWindow: false,
    });

    const history = await prisma.attendanceChange.findMany({
      where: { enrollmentId: old },
    });
    expect(history).toEqual([
      expect.objectContaining({
        fromStatus: 'PRESENT',
        toStatus: 'ABSENT',
        withinWindow: false,
        reason: 'Parent confirmed the absence',
      }),
    ]);
    await expect(
      prisma.attendanceChange.update({
        where: { id: history[0]?.id as string },
        data: { reason: 'edited' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.attendanceChange.delete({
        where: { id: history[0]?.id as string },
      }),
    ).rejects.toThrow();

    const listRes = await get('/attendance/changes').query({
      studentId: stu.s1b,
    });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
    expect(listRes.body.data[0]).toMatchObject({
      changedByName: 'E2E admin',
      studentId: stu.s1b,
    });

    const rChanges1 = await get('/attendance/changes', teacherToken);
    expect(rChanges1.status).toBe(403);

    const rChanges2 = await get('/attendance/changes', officeToken);
    expect(rChanges2.status).toBe(403);

    const r404 = await patch(
      `${sectionUrl(s3, day(0))}/records/${randomUUID()}`,
      { status: 'ABSENT' },
    );
    expect(r404.status).toBe(404); // no session
  });

  it('respects the school calendar', async ({ skip }) => {
    if (blocked) skip();
    const off = day(-6);
    const calendar = `/academic-years/${yearId}/calendar`;

    const c1 = await post(`${calendar}/entries`, {
      startDate: off,
      kind: 'WORKING_DAY',
      name: 'Make-up day',
    });
    expect(c1.status).toBe(400); // not an off day yet

    const c2 = await post(`${calendar}/entries`, {
      startDate: day(-3),
      kind: 'HOLIDAY',
      name: 'Too late',
    });
    expect(c2.status).toBe(409); // attendance already taken that day

    const c3 = await post(
      `${calendar}/entries`,
      { startDate: off, kind: 'HOLIDAY', name: 'Test festival' },
      teacherToken,
    );
    expect(c3.status).toBe(403);

    const holidayRes = await post(`${calendar}/entries`, {
      startDate: off,
      kind: 'HOLIDAY',
      name: 'Test festival',
    });
    expect(holidayRes.status).toBe(201);
    expect(holidayRes.body.data[0]).toMatchObject({
      date: off,
      kind: 'HOLIDAY',
    });

    const cDup = await post(`${calendar}/entries`, {
      startDate: off,
      kind: 'HOLIDAY',
      name: 'Duplicate',
    });
    expect(cDup.status).toBe(409);

    expect((await roster(s3, off)).isSchoolDay).toBe(false);

    const subOff = await submit(s3, off, {}, adminToken, REASON);
    expect(subOff.status).toBe(409);

    // A weekly off day, then a make-up working day on it.
    const offDay = day(-7);
    const pWeekly = await patch(calendar, { weeklyOffDays: [weekday(offDay)] });
    expect(pWeekly.status).toBe(200);

    const subOffDay = await submit(s3, offDay, {}, adminToken, REASON);
    expect(subOffDay.status).toBe(409);

    const makeUpRes = await post(`${calendar}/entries`, {
      startDate: offDay,
      kind: 'WORKING_DAY',
      name: 'Make-up day',
    });
    expect(makeUpRes.status).toBe(201);

    const subMakeUp = await submit(s3, offDay, {}, adminToken, REASON);
    expect(subMakeUp.status).toBe(200);

    const delMakeUp = await del(
      `${calendar}/entries/${makeUpRes.body.data[0].id}`,
    );
    expect(delMakeUp.status).toBe(409); // attendance was taken on it

    const pClearWeekly = await patch(calendar, { weeklyOffDays: [] });
    expect(pClearWeekly.status).toBe(200);

    const pBadWeekly = await patch(calendar, { weeklyOffDays: [9] });
    expect(pBadWeekly.status).toBe(400);

    const pBadWindow = await patch(calendar, { attendanceEditWindowDays: 99 });
    expect(pBadWindow.status).toBe(400);

    const pOutside = await post(`${calendar}/entries`, {
      startDate: day(-500),
      kind: 'HOLIDAY',
      name: 'Outside',
    });
    expect(pOutside.status).toBe(400);

    const getCalendar = await get(calendar, teacherToken);
    expect(getCalendar.status).toBe(200);
    expect(getCalendar.body.data.entries.length).toBeGreaterThanOrEqual(2); // readable by anyone signed in

    const delHoliday = await del(
      `${calendar}/entries/${holidayRes.body.data[0].id}`,
    );
    expect(delHoliday.status).toBe(200);
  });

  function del(url: string, token = adminToken) {
    return http().delete(`${V1}${url}`).set(auth(token));
  }

  it('shows a student their history and summary, with cursor pagination', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = `/students/${stu.s1a}/attendance`;
    const firstRes = await get(url, teacherToken).query({ limit: 2 });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.map((i: { date: string }) => i.date)).toEqual([
      day(0),
      day(-1),
    ]);
    expect(firstRes.body.meta).toMatchObject({ limit: 2, nextCursor: day(-1) });
    expect(firstRes.body.data[0].dateBs).toEqual(expect.any(String));

    const secondRes = await get(url, teacherToken).query({
      limit: 2,
      cursor: firstRes.body.meta.nextCursor,
    });
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.map((i: { date: string }) => i.date)).toEqual(
      [day(-3), day(-7)].filter((d) => d === day(-3)),
    );
    expect(secondRes.body.meta.nextCursor).toBeNull();

    // s1b: today LATE (corrected), yesterday LEAVE, three days ago ABSENT (corrected).
    const summaryRes = await get(`${url.replace(stu.s1a, stu.s1b)}/summary`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data).toMatchObject({
      counts: { PRESENT: 0, ABSENT: 1, LATE: 1, LEAVE: 1 },
      daysRecorded: 3,
      attended: 1,
      percentage: 33.3,
    });

    const rangedRes = await get(
      `/students/${stu.s1a}/attendance/summary`,
    ).query({ from: day(-1), to: day(0) });
    expect(rangedRes.status).toBe(200);
    expect(rangedRes.body.data).toMatchObject({
      daysRecorded: 2,
      attended: 2,
      percentage: 100,
    });

    const badRangeRes = await get(
      `/students/${stu.s1a}/attendance/summary`,
    ).query({ from: day(0), to: day(-1) });
    expect(badRangeRes.status).toBe(400);

    const notFoundRes = await get(
      `/students/${stu.s2a}/attendance`,
      teacherToken,
    );
    expect(notFoundRes.status).toBe(404); // not in the teacher's section

    const forbiddenRes = await get(url, plainToken);
    expect(forbiddenRes.status).toBe(403);

    const otherNotFoundRes = await get(url, otherTeacherToken);
    expect(otherNotFoundRes.status).toBe(404);
  });

  it('summarises a section by student and by day', async ({ skip }) => {
    if (blocked) skip();
    const url = `/academic-years/${yearId}/sections/${s1}/attendance-summary`;
    const res = await get(url, teacherToken).query({
      from: day(-10),
      to: day(0),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.daysTaken).toBe(3);
    expect(res.body.data.students).toHaveLength(3);
    expect(res.body.data.days.map((d: { date: string }) => d.date)).toEqual([
      day(-3),
      day(-1),
      day(0),
    ]);

    const otherRes = await get(url, otherTeacherToken);
    expect(otherRes.status).toBe(403);

    const badQueryRes = await get(url).query({ from: day(-1000), to: day(0) });
    expect(badQueryRes.status).toBe(400);
  });

  it('lists sections that have not taken attendance yet', async ({ skip }) => {
    if (blocked) skip();
    const pending = async () => {
      const res = await get('/attendance/pending');
      expect(res.status).toBe(200);
      return res.body.data.sections as {
        sectionId: string;
        classTeacher: unknown;
      }[];
    };
    expect((await pending()).map((s) => s.sectionId)).toEqual([s3]); // S1 and S2 are done

    const teacherPendingRes = await get('/attendance/pending', teacherToken);
    expect(teacherPendingRes.status).toBe(403);

    const submitRes = await submit(s3, day(0), {}, officeToken);
    expect(submitRes.status).toBe(200);
    expect(await pending()).toEqual([]);
  });

  it('does not double-count a student who changes section on the same day', async ({
    skip,
  }) => {
    if (blocked) skip();
    // s1c already has today's record in S1. Create a fresh section with no session yet.
    const cls = await prisma.section.findUniqueOrThrow({
      where: { id: s1 },
      select: { classId: true },
    });
    const s4 = (
      await prisma.section.create({
        data: { classId: cls.classId, name: 'S4' },
      })
    ).id;
    const s1cEnrollment = await enrollmentOf(s1, day(0), stu.s1c);
    const patchRes = await patch(`/enrollments/${s1cEnrollment}/section`, {
      sectionId: s4,
    });
    expect(patchRes.status).toBe(200);
    expect((await roster(s4, day(0))).students).toEqual([]); // already marked in S1 today

    const subRes = await submit(s4, day(0), {}, officeToken);
    expect(subRes.status).toBe(400); // nobody left to mark
  });

  it('serialises two simultaneous submissions for the same section and day', async ({
    skip,
  }) => {
    if (blocked) skip();
    const date = day(-2);
    const results = await Promise.all([
      submit(s2, date, {}, adminToken, REASON),
      submit(s2, date, { [stu.s2a]: 'ABSENT' }, adminToken, REASON),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.attendanceSession.count({
        where: { sectionId: s2, date: isoToDate(date) },
      }),
    ).toBe(1);
  });

  it('is read-only once the academic year is closed', async ({ skip }) => {
    if (blocked) skip();
    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'CLOSED' },
    });
    const enrollment = await enrollmentOf(s1, day(0), stu.s1a);
    const patchRes = await patch(
      `${sectionUrl(s1, day(0))}/records/${enrollment}`,
      { status: 'LEAVE' },
    );
    expect(patchRes.status).toBe(409);

    const subRes = await submit(s3, day(-4), {}, adminToken, REASON);
    expect(subRes.status).toBe(409);
    expect((await roster(s1, day(0))).editableByMe).toBe(false);

    const getRes = await get(`/students/${stu.s1a}/attendance`);
    expect(getRes.status).toBe(200);
  });

  it('converts between BS and AD', async () => {
    const fromAd = await get('/dates/convert').query({ ad: '2026-09-22' });
    expect(fromAd.status).toBe(200);
    expect(fromAd.body.data).toEqual({ ad: '2026-09-22', bs: '2083-06-06' });

    const fromBs = await get('/dates/convert').query({ bs: '2083-06-06' });
    expect(fromBs.status).toBe(200);
    expect(fromBs.body.data).toEqual({ ad: '2026-09-22', bs: '2083-06-06' });

    const bothRes = await get('/dates/convert').query({
      ad: '2026-09-22',
      bs: '2083-06-06',
    });
    expect(bothRes.status).toBe(400);

    const noneRes = await get('/dates/convert');
    expect(noneRes.status).toBe(400);

    const invalidRes = await get('/dates/convert').query({ bs: '2083-13-01' });
    expect(invalidRes.status).toBe(400);
  });
});
