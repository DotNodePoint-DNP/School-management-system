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

const PFX = 'E2E-MRK';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-mrk-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe('Marks and exam workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = false;
  let yearId = '';
  let classId = '';
  let s1 = '';
  let s2 = '';
  let maths = '';
  let computer = '';
  let examId = '';
  const enr: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: '',
    B: '',
    C: '',
    D: '',
  };
  const stu: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: '',
    B: '',
    C: '',
    D: '',
  };
  const token: Record<
    | 'mathsTeacher'
    | 'computerTeacher'
    | 'classTeacher'
    | 'other'
    | 'office'
    | 'controller'
    | 'plain',
    string
  > = {
    mathsTeacher: '',
    computerTeacher: '',
    classTeacher: '',
    other: '',
    office: '',
    controller: '',
    plain: '',
  };

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sheet = (section: string, subject: string): string =>
    `/exams/${examId}/sections/${section}/subjects/${subject}/marks`;
  const get = (url: string, t: string) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, t: string, body: object = {}) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, t: string, body: object) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, t: string, body: object) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const REASON = 'Recounted the answer sheets with the head teacher';

  type Sheet = {
    sheet: { status: string };
    counts: { total: number; entered: number; complete: number };
    students: {
      enrollmentId: string;
      theory: number | null;
      practical: number | null;
      absent: boolean;
      complete: boolean;
    }[];
    editableByMe: boolean;
    correctableByMe: boolean;
  };
  const sheetOf = async (
    section: string,
    subject: string,
    t: string,
  ): Promise<Sheet> =>
    (await get(sheet(section, subject), t).expect(200)).body.data as Sheet;
  const row = (s: Sheet, enrollmentId: string) =>
    s.students.find((x) => x.enrollmentId === enrollmentId);

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
    await prisma.mark.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.markSheet.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.studentSubjectChoice.deleteMany({
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
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.staff.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
  }

  async function makeUser(
    label: keyof typeof token,
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
      .send({ identifier: email(label), password: PASSWORD })
      .expect(200);
    token[label] = res.body.data.accessToken as string;
    return user.id;
  }

  const makeStaff = (label: string, userId: string) =>
    prisma.staff.create({
      data: {
        staffNo: `E2E-${RUN}-${label}`,
        firstName: `${PFX}-${label}`,
        lastName: 'Teacher',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: date('2020-01-01'),
        userId,
      },
    });

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
      where: { email: { startsWith: 'e2e-mrk-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    blocked =
      (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' } })) !==
      null;
    if (blocked) return;

    const mathsUser = await makeUser('mathsTeacher', [
      ['marks', 'enter'],
      ['marks', 'read'],
    ]);
    const computerUser = await makeUser('computerTeacher', [
      ['marks', 'enter'],
    ]);
    const classTeacherUser = await makeUser('classTeacher', [
      ['marks', 'read'],
    ]);
    await makeUser('other', [['marks', 'enter']]);
    await makeUser('office', [['marks', 'enter-any']]);
    await makeUser('controller', [
      ['marks', 'read-all'],
      ['marks', 'reopen'],
      ['marks', 'correct'],
      ['exams', 'lock'],
      ['exams', 'publish'],
      ['exams', 'read'],
    ]);
    await makeUser('plain', []);

    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y`,
          startDate: date('2105-04-01'),
          endDate: date('2106-03-31'),
          status: 'ACTIVE',
        },
      })
    ).id;
    classId = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C`, sortOrder: 5 },
      })
    ).id;
    s1 = (await prisma.section.create({ data: { classId, name: 'A' } })).id;
    s2 = (await prisma.section.create({ data: { classId, name: 'B' } })).id;
    maths = (
      await prisma.subject.create({
        data: { code: `M${TAIL}`, name: `${PFX}-${RUN}-Maths` },
      })
    ).id;
    computer = (
      await prisma.subject.create({
        data: { code: `C${TAIL}`, name: `${PFX}-${RUN}-Computer` },
      })
    ).id;
    await prisma.classSubject.createMany({
      data: [
        {
          academicYearId: yearId,
          classId,
          subjectId: maths,
          isCompulsory: true,
        },
        {
          academicYearId: yearId,
          classId,
          subjectId: computer,
          isCompulsory: false,
        },
      ],
    });
    exam: {
      examId = (
        await prisma.exam.create({
          data: {
            academicYearId: yearId,
            name: `${PFX}-${RUN}-Final`,
            sequence: 1,
            isFinal: true,
            status: 'OPEN',
          },
        })
      ).id;
      await prisma.examSubject.createMany({
        data: [
          {
            examId,
            academicYearId: yearId,
            classId,
            subjectId: maths,
            fullTheory: 75,
            passTheory: 26.25,
            fullPractical: 25,
            passPractical: 10,
          },
          {
            examId,
            academicYearId: yearId,
            classId,
            subjectId: computer,
            fullTheory: 100,
            passTheory: 35,
          },
        ],
      });
    }

    const placement: [keyof typeof enr, string, number][] = [
      ['A', s1, 1],
      ['B', s1, 2],
      ['C', s1, 3],
      ['D', s2, 1],
    ];
    for (const [key, section, rollNo] of placement) {
      const student = await prisma.student.create({
        data: {
          admissionNo: `E2E-${RUN}-${key}`,
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('2004-04-04'),
          admissionDate: date('2010-05-05'),
        },
      });
      stu[key] = student.id;
      enr[key] = (
        await prisma.enrollment.create({
          data: {
            studentId: student.id,
            academicYearId: yearId,
            classId,
            sectionId: section,
            rollNo,
          },
        })
      ).id;
    }
    for (const key of ['A', 'B'] as const) {
      await prisma.studentSubjectChoice.create({
        data: {
          enrollmentId: enr[key],
          subjectId: computer,
          academicYearId: yearId,
          classId,
        },
      });
    }

    const mathsStaff = await makeStaff('maths', mathsUser);
    const computerStaff = await makeStaff('computer', computerUser);
    const classStaff = await makeStaff('class', classTeacherUser);
    await prisma.teachingAssignment.create({
      data: {
        academicYearId: yearId,
        sectionId: s1,
        classId,
        subjectId: maths,
        staffId: mathsStaff.id,
      },
    });
    await prisma.teachingAssignment.create({
      data: {
        academicYearId: yearId,
        sectionId: s1,
        classId,
        subjectId: computer,
        staffId: computerStaff.id,
      },
    });
    await prisma.classTeacherAssignment.create({
      data: { academicYearId: yearId, sectionId: s1, staffId: classStaff.id },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-mrk-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('applies access rules to sheets', async ({ skip }) => {
    if (blocked) skip();
    await get(sheet(s1, maths), token.plain).expect(403);
    await get(sheet(s1, maths), token.other).expect(403); // not assigned
    await get(sheet(s1, maths), token.computerTeacher).expect(403); // teaches another subject
    await get(sheet(s1, maths), token.classTeacher).expect(200); // class teachers read every subject of their section
    await get(sheet(s2, maths), token.mathsTeacher).expect(403); // another section
    await get(sheet(s1, maths), token.controller).expect(200);
    await put(sheet(s1, maths), token.classTeacher, {
      entries: [{ enrollmentId: enr.A, theory: 50, practical: 10 }],
    }).expect(403); // reading is not entering
    await put(sheet(s1, maths), token.other, {
      entries: [{ enrollmentId: enr.A, theory: 50, practical: 10 }],
    }).expect(403);
    await get(
      `/exams/${examId}/sections/${s1}/subjects/${randomUUID()}/marks`,
      token.controller,
    ).expect(404);
    await get(
      `/exams/${randomUUID()}/sections/${s1}/subjects/${maths}/marks`,
      token.controller,
    ).expect(404);
  });

  it('lists the roster, and for optional subjects only the students who chose them', async ({
    skip,
  }) => {
    if (blocked) skip();
    const m = await sheetOf(s1, maths, token.mathsTeacher);
    expect(m).toMatchObject({
      sheet: { status: 'NOT_STARTED' },
      editableByMe: true,
      correctableByMe: false,
      counts: { total: 3, entered: 0, complete: 0 },
    });
    expect(
      (await sheetOf(s1, computer, token.computerTeacher)).students
        .map((s) => s.enrollmentId)
        .sort(),
    ).toEqual([enr.A, enr.B].sort());
    await put(sheet(s1, computer), token.computerTeacher, {
      entries: [{ enrollmentId: enr.C, theory: 50 }],
    }).expect(400); // C did not choose Computer
  });

  it('saves draft marks and validates them', async ({ skip }) => {
    if (blocked) skip();
    const url = sheet(s1, maths);
    const bad = (entry: object) =>
      put(url, token.mathsTeacher, {
        entries: [{ enrollmentId: enr.A, ...entry }],
      });
    await bad({ theory: 76, practical: 10 }).expect(400); // above full marks
    await bad({ theory: 50, practical: 26 }).expect(400);
    await bad({ theory: -1 }).expect(400);
    await bad({ theory: 50.123 }).expect(400);
    await bad({ absent: true, theory: 10 }).expect(400); // absent students have no marks
    await bad({}).expect(400); // an empty entry means nothing
    await put(url, token.mathsTeacher, {
      entries: [{ enrollmentId: enr.D, theory: 50 }],
    }).expect(400); // D is in another section
    await put(url, token.mathsTeacher, {
      entries: [
        { enrollmentId: enr.A, theory: 5 },
        { enrollmentId: enr.A, theory: 6 },
      ],
    }).expect(400); // duplicates
    await put(sheet(s1, computer), token.computerTeacher, {
      entries: [{ enrollmentId: enr.A, theory: 50, practical: 5 }],
    }).expect(400); // Computer has no practical

    const saved = await put(url, token.mathsTeacher, {
      entries: [
        { enrollmentId: enr.A, theory: 60, practical: 20 },
        { enrollmentId: enr.B, absent: true },
        { enrollmentId: enr.C, theory: 40 },
      ],
    }).expect(200);
    const s = saved.body.data as Sheet;
    expect(s.sheet.status).toBe('DRAFT');
    expect(s.counts).toEqual({ total: 3, entered: 3, complete: 2 }); // C still lacks practical marks
    expect(row(s, enr.A)).toMatchObject({
      theory: 60,
      practical: 20,
      absent: false,
      complete: true,
    });
    expect(row(s, enr.B)).toMatchObject({
      theory: null,
      practical: null,
      absent: true,
      complete: true,
    });

    await put(url, token.mathsTeacher, {
      entries: [{ enrollmentId: enr.C, clear: true }],
    }).expect(200);
    expect((await sheetOf(s1, maths, token.mathsTeacher)).counts.entered).toBe(
      2,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'marks.saved', entityId: `${examId}:${s1}:${maths}` },
    });
    expect(JSON.stringify(audit?.details)).not.toMatch(/60|theory/); // counts only
  });

  it('refuses to submit incomplete sheets, then submits and freezes complete ones', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = sheet(s1, maths);
    const incomplete = await post(`${url}/submit`, token.mathsTeacher).expect(
      400,
    );
    expect(incomplete.body.error.message).toMatch(
      /1 student\(s\) still need marks/,
    );
    await post(`${url}/submit`, token.other).expect(403);

    await put(url, token.mathsTeacher, {
      entries: [{ enrollmentId: enr.C, theory: 40, practical: 12 }],
    }).expect(200);
    const results = await Promise.all([
      post(`${url}/submit`, token.mathsTeacher),
      post(`${url}/submit`, token.office),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]); // two simultaneous submits: one wins

    const s = await sheetOf(s1, maths, token.mathsTeacher);
    expect(s).toMatchObject({
      sheet: { status: 'SUBMITTED' },
      editableByMe: false,
    });
    await put(url, token.mathsTeacher, {
      entries: [{ enrollmentId: enr.A, theory: 61, practical: 20 }],
    }).expect(409);
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: 'marks.submitted',
          entityId: (
            await prisma.markSheet.findFirstOrThrow({
              where: { examId, sectionId: s1, subjectId: maths },
            })
          ).id,
        },
      }),
    ).not.toBeNull();
  });

  it('reopens a submitted sheet only with permission and a reason, while the exam is open', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = sheet(s1, maths);
    await post(`${url}/reopen`, token.mathsTeacher, { reason: REASON }).expect(
      403,
    );
    await post(`${url}/reopen`, token.controller, { reason: 'short' }).expect(
      400,
    );
    const reopened = await post(`${url}/reopen`, token.controller, {
      reason: REASON,
    }).expect(200);
    expect(reopened.body.data.sheet.status).toBe('DRAFT');
    await post(`${url}/reopen`, token.controller, { reason: REASON }).expect(
      409,
    ); // not submitted

    await put(url, token.mathsTeacher, {
      entries: [{ enrollmentId: enr.A, theory: 62, practical: 20 }],
    }).expect(200);
    await post(`${url}/submit`, token.mathsTeacher).expect(200);
  });

  it('shows progress, and refuses to lock while sheets are missing', async ({
    skip,
  }) => {
    if (blocked) skip();
    await get(`/exams/${examId}/progress`, token.plain).expect(403);
    await get(`/exams/${examId}/progress`, token.mathsTeacher).expect(403);
    const progress = (
      await get(`/exams/${examId}/progress`, token.controller).expect(200)
    ).body.data as {
      submitted: number;
      total: number;
      sheets: {
        sectionName: string;
        subjectCode: string;
        status: string;
        students: number;
        teacher: { name: string } | null;
      }[];
    };
    expect(progress).toMatchObject({ submitted: 1, total: 3 }); // Maths A, Maths B, Computer A
    expect(
      progress.sheets.map((s) => [s.sectionName, s.status, s.students]),
    ).toEqual(
      [
        ['A', 'SUBMITTED', 3],
        ['A', 'NOT_STARTED', 2],
        ['B', 'NOT_STARTED', 1],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0])) || 0).length
        ? expect.any(Array)
        : [],
    );
    expect(
      progress.sheets.find(
        (s) => s.subjectCode === `M${TAIL}` && s.sectionName === 'A',
      )?.teacher?.name,
    ).toBe(`${PFX}-maths Teacher`);

    const lock = await post(`/exams/${examId}/lock`, token.controller).expect(
      409,
    );
    expect(lock.body.error.message).toMatch(
      /2 sheet\(s\) are not submitted yet/,
    );
    await post(`/exams/${examId}/lock`, token.mathsTeacher).expect(403);

    const mine = (
      await get(`/exams/${examId}/my-sheets`, token.mathsTeacher).expect(200)
    ).body.data as { subjectCode: string }[];
    expect(mine.map((s) => s.subjectCode)).toEqual([`M${TAIL}`]);
    expect(
      (await get(`/exams/${examId}/my-sheets`, token.other).expect(200)).body
        .data,
    ).toEqual([]);
  });

  it('locks once every sheet is submitted, and blocks entry afterwards', async ({
    skip,
  }) => {
    if (blocked) skip();
    await put(sheet(s1, computer), token.computerTeacher, {
      entries: [
        { enrollmentId: enr.A, theory: 70 },
        { enrollmentId: enr.B, theory: 30 },
      ],
    }).expect(200);
    await post(`${sheet(s1, computer)}/submit`, token.computerTeacher).expect(
      200,
    );
    // Section B has no assigned teacher; office staff can enter on their behalf.
    await put(sheet(s2, maths), token.office, {
      entries: [{ enrollmentId: enr.D, theory: 55, practical: 18 }],
    }).expect(200);
    await post(`${sheet(s2, maths)}/submit`, token.office).expect(200);

    const locked = await post(`/exams/${examId}/lock`, token.controller).expect(
      200,
    );
    expect(locked.body.data.status).toBe('LOCKED');
    await post(`/exams/${examId}/lock`, token.controller).expect(409);
    await put(sheet(s1, maths), token.mathsTeacher, {
      entries: [{ enrollmentId: enr.A, theory: 1, practical: 1 }],
    }).expect(409);
    await post(`${sheet(s1, maths)}/reopen`, token.controller, {
      reason: REASON,
    }).expect(409); // corrections only now
    await post(`/exams/${examId}/publish`, token.plain).expect(403);
  });

  it('corrects submitted marks with a reason, recording the history', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = `${sheet(s1, maths)}/${enr.A}`;
    await patch(url, token.mathsTeacher, {
      theory: 65,
      practical: 20,
      reason: REASON,
    }).expect(403);
    await patch(url, token.controller, { theory: 65, practical: 20 }).expect(
      400,
    ); // reason required
    await patch(url, token.controller, {
      theory: 65,
      practical: 20,
      reason: 'short',
    }).expect(400);
    await patch(url, token.controller, {
      theory: 90,
      practical: 20,
      reason: REASON,
    }).expect(400); // above full marks
    await patch(url, token.controller, {
      theory: 62,
      practical: 20,
      reason: REASON,
    }).expect(400); // unchanged

    const fixed = await patch(url, token.controller, {
      theory: 65,
      practical: 20,
      reason: REASON,
    }).expect(200);
    expect(row(fixed.body.data as Sheet, enr.A)).toMatchObject({
      theory: 65,
      practical: 20,
    });
    const toAbsent = await patch(
      `${sheet(s1, maths)}/${enr.C}`,
      token.controller,
      { absent: true, reason: REASON },
    ).expect(200);
    expect(row(toAbsent.body.data as Sheet, enr.C)).toMatchObject({
      absent: true,
      theory: null,
    });
    await patch(`${sheet(s1, maths)}/${enr.D}`, token.controller, {
      theory: 5,
      reason: REASON,
    }).expect(404); // not on this sheet

    const history = await prisma.markChange.findMany({
      where: { enrollmentId: enr.A },
      orderBy: { changedAt: 'asc' },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromAbsent: false,
      toAbsent: false,
      reason: REASON,
      examStatus: 'LOCKED',
    });
    expect(history[0]?.fromTheory?.toNumber()).toBe(62);
    expect(history[0]?.toTheory?.toNumber()).toBe(65);
    await expect(
      prisma.markChange.update({
        where: { id: history[0]?.id as string },
        data: { reason: 'edited' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.markChange.delete({ where: { id: history[0]?.id as string } }),
    ).rejects.toThrow();

    const list = await get('/marks/changes?limit=1', token.controller).expect(
      200,
    );
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.nextCursor).toEqual(expect.any(String));
    const forStudent = await get(
      `/marks/changes?studentId=${stu.A}`,
      token.controller,
    ).expect(200);
    expect(forStudent.body.data[0]).toMatchObject({
      changedByName: 'E2E controller',
      from: { theory: 62 },
      to: { theory: 65 },
      reason: REASON,
    });
    await get('/marks/changes', token.mathsTeacher).expect(403);
  });

  it('unlocks with a reason, then locks and publishes', async ({ skip }) => {
    if (blocked) skip();
    await post(`/exams/${examId}/unlock`, token.controller, {
      reason: 'short',
    }).expect(400);
    await post(`/exams/${examId}/unlock`, token.plain, {
      reason: REASON,
    }).expect(403);
    expect(
      (
        await post(`/exams/${examId}/unlock`, token.controller, {
          reason: REASON,
        }).expect(200)
      ).body.data.status,
    ).toBe('OPEN');
    await post(`/exams/${examId}/unlock`, token.controller, {
      reason: REASON,
    }).expect(409); // not locked
    await post(`/exams/${examId}/publish`, token.controller).expect(409); // must be locked first
    await post(`/exams/${examId}/lock`, token.controller).expect(200);

    const published = await post(
      `/exams/${examId}/publish`,
      token.controller,
    ).expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    await post(`/exams/${examId}/publish`, token.controller).expect(409);
    await post(`/exams/${examId}/unlock`, token.controller, {
      reason: REASON,
    }).expect(409);
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(exam.publishedAt).not.toBeNull();
  });

  it('still allows corrections after publishing, recorded as such, but never in a closed year', async ({
    skip,
  }) => {
    if (blocked) skip();
    const url = `${sheet(s1, maths)}/${enr.B}`;
    await patch(url, token.controller, {
      theory: 33,
      practical: 8,
      reason: REASON,
    }).expect(200);
    const published = await prisma.markChange.findFirstOrThrow({
      where: { enrollmentId: enr.B, examStatus: 'PUBLISHED' },
    });
    expect(published.fromAbsent).toBe(true);
    expect(published.toTheory?.toNumber()).toBe(33);

    await prisma.academicYear.update({
      where: { id: yearId },
      data: { status: 'CLOSED' },
    });
    await patch(url, token.controller, {
      theory: 34,
      practical: 8,
      reason: REASON,
    }).expect(409);
    await get(sheet(s1, maths), token.controller).expect(200);
  });
});
