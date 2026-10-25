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

const PFX = 'E2E-RES';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-res-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const REASON = 'Recounted the answer sheet with the head teacher';

type Key = 'A' | 'B' | 'C' | 'D';
// [theory, practical?] per exam, per student, per subject.
const MARKS: Record<
  'terminal' | 'final',
  Record<
    Key,
    Record<'maths' | 'english' | 'computer', [number, number?] | undefined>
  >
> = {
  terminal: {
    A: { maths: [60, 20], english: [70], computer: [40] },
    B: { maths: [50, 15], english: [60], computer: undefined },
    C: { maths: [40, 12], english: [50], computer: undefined },
    D: { maths: [70, 22], english: [75], computer: undefined },
  },
  final: {
    A: { maths: [66, 22], english: [80], computer: [45] },
    B: { maths: [52.5, 17.5], english: [65], computer: undefined },
    C: { maths: [15, 25], english: [60], computer: undefined }, // theory far below the pass marks
    D: { maths: [60, 20], english: [70], computer: undefined },
  },
};

describe('Results (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let yearId = '';
  let classId = '';
  let s1 = '';
  let s2 = '';
  const subj = { maths: '', english: '', computer: '' };
  const exam = { terminal: '', final: '' };
  const enr: Record<Key, string> = { A: '', B: '', C: '', D: '' };
  const stu: Record<Key, string> = { A: '', B: '', C: '', D: '' };
  const token = { controller: '', teacher: '', plain: '' };

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t: string) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, t: string, body: object = {}) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, t: string, body: object) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const results = (q = ''): string =>
    `/academic-years/${yearId}/classes/${classId}/results${q}`;

  type Row = {
    enrollmentId: string;
    status: string;
    percentage: number | null;
    gpa: number | null;
    sectionRank: number | null;
    classRank: number | null;
    failedSubjects: string[];
  };
  const byStudent = (rows: Row[], key: Key): Row =>
    rows.find((r) => r.enrollmentId === enr[key]) as Row;

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
      where: { email: { startsWith: 'e2e-res-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });

    await makeUser('controller', [
      ['results', 'preview'],
      ['results', 'read-all'],
      ['exams', 'lock'],
      ['exams', 'publish'],
      ['exams', 'read'],
      ['marks', 'read-all'],
      ['marks', 'correct'],
    ]);
    const teacherUser = await makeUser('teacher', [['results', 'read']]);
    await makeUser('plain', []);

    const scale = await prisma.gradeScale.findFirst({
      where: { isDefault: true },
    });
    if (!scale)
      throw new Error('No default grade scale: run `pnpm prisma db seed`');

    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y`,
          startDate: date('2107-04-01'),
          endDate: date('2108-03-31'),
        },
      })
    ).id;
    classId = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C`, sortOrder: 6 },
      })
    ).id;
    s1 = (await prisma.section.create({ data: { classId, name: 'A' } })).id;
    s2 = (await prisma.section.create({ data: { classId, name: 'B' } })).id;
    const makeSubject = async (
      key: keyof typeof subj,
      letter: string,
      label: string,
      isCompulsory: boolean,
      creditHours: number,
    ): Promise<void> => {
      subj[key] = (
        await prisma.subject.create({
          data: { code: `R${TAIL}${letter}`, name: `${PFX}-${RUN}-${label}` },
        })
      ).id;
      await prisma.classSubject.create({
        data: {
          academicYearId: yearId,
          classId,
          subjectId: subj[key],
          isCompulsory,
          creditHours,
        },
      });
    };
    await makeSubject('maths', 'M', 'Maths', true, 4);
    await makeSubject('english', 'E', 'English', true, 3);
    await makeSubject('computer', 'C', 'Computer', false, 2);

    for (const [key, name, seq, isFinal] of [
      ['terminal', 'Terminal', 1, false],
      ['final', 'Final', 2, true],
    ] as const) {
      exam[key] = (
        await prisma.exam.create({
          data: {
            academicYearId: yearId,
            name: `${PFX}-${RUN}-${name}`,
            sequence: seq,
            isFinal,
            status: 'OPEN',
          },
        })
      ).id;
      await prisma.examSubject.createMany({
        data: [
          {
            examId: exam[key],
            academicYearId: yearId,
            classId,
            subjectId: subj.maths,
            fullTheory: 75,
            passTheory: 26.25,
            fullPractical: 25,
            passPractical: 10,
          },
          {
            examId: exam[key],
            academicYearId: yearId,
            classId,
            subjectId: subj.english,
            fullTheory: 100,
            passTheory: 35,
          },
          {
            examId: exam[key],
            academicYearId: yearId,
            classId,
            subjectId: subj.computer,
            fullTheory: 50,
            passTheory: 17.5,
          },
        ],
      });
    }
    const policy = await prisma.resultPolicy.create({
      data: { academicYearId: yearId, classId, gradeScaleId: scale.id },
    });
    await prisma.resultComponent.createMany({
      data: [
        {
          policyId: policy.id,
          academicYearId: yearId,
          examId: exam.terminal,
          weightPercent: 40,
        },
        {
          policyId: policy.id,
          academicYearId: yearId,
          examId: exam.final,
          weightPercent: 60,
        },
      ],
    });

    const placement: [Key, string][] = [
      ['A', s1],
      ['B', s1],
      ['C', s2],
      ['D', s2],
    ];
    for (const [key, section] of placement) {
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
            rollNo: placement.findIndex(([k]) => k === key) + 1,
          },
        })
      ).id;
    }
    await prisma.studentSubjectChoice.create({
      data: {
        enrollmentId: enr.A,
        subjectId: subj.computer,
        academicYearId: yearId,
        classId,
      },
    });

    const staff = await prisma.staff.create({
      data: {
        staffNo: `E2E-${RUN}-T`,
        firstName: `${PFX}-t`,
        lastName: 'Teacher',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: date('2020-01-01'),
        userId: teacherUser,
      },
    });
    await prisma.classTeacherAssignment.create({
      data: { academicYearId: yearId, sectionId: s1, staffId: staff.id },
    });

    // Submitted mark sheets for every expected (exam, section, subject).
    const sheets: [string, string][] = [
      [s1, 'maths'],
      [s1, 'english'],
      [s1, 'computer'],
      [s2, 'maths'],
      [s2, 'english'],
    ];
    for (const key of ['terminal', 'final'] as const) {
      for (const [section, subjectKey] of sheets) {
        const sheet = await prisma.markSheet.create({
          data: {
            examId: exam[key],
            academicYearId: yearId,
            classId,
            sectionId: section,
            subjectId: subj[subjectKey as keyof typeof subj],
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });
        const rows = (Object.keys(enr) as Key[])
          .filter((k) => placement.find(([pk]) => pk === k)?.[1] === section)
          .flatMap((k) => {
            const value =
              MARKS[key][k][subjectKey as 'maths' | 'english' | 'computer'];
            return value
              ? [
                  {
                    sheetId: sheet.id,
                    academicYearId: yearId,
                    classId,
                    enrollmentId: enr[k],
                    theory: value[0],
                    practical: value[1] ?? null,
                  },
                ]
              : [];
          });
        if (rows.length > 0) await prisma.mark.createMany({ data: rows });
      }
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-res-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('previews results before publishing, without writing anything', async () => {
    await get(`${results('/preview')}`, token.plain).expect(403);
    await get(`${results('/preview')}`, token.teacher).expect(403);
    const res = await get(results('/preview'), token.controller).expect(200);
    const { students, summary, source, components } = res.body.data as {
      students: Row[];
      summary: object;
      source: string;
      components: { status: string; weightPercent: number }[];
    };
    expect(source).toBe('EXPLICIT');
    expect(components.map((c) => [c.weightPercent, c.status])).toEqual([
      [40, 'OPEN'],
      [60, 'OPEN'],
    ]);
    expect(summary).toEqual({ students: 4, pass: 3, fail: 1, incomplete: 0 });

    expect(byStudent(students, 'A')).toMatchObject({
      status: 'PASS',
      percentage: 81.52,
      gpa: 3.47,
      classRank: 1,
      sectionRank: 1,
    });
    expect(byStudent(students, 'D')).toMatchObject({
      status: 'PASS',
      percentage: 78.4,
      gpa: 3.43,
      classRank: 2,
      sectionRank: 1,
    });
    expect(byStudent(students, 'B')).toMatchObject({
      status: 'PASS',
      percentage: 65.5,
      gpa: 2.8,
      classRank: 3,
      sectionRank: 2,
    });
    expect(byStudent(students, 'C')).toMatchObject({
      status: 'FAIL',
      percentage: 50.4,
      gpa: 1.03,
      classRank: 4,
      sectionRank: 2,
    }); // failed ranks last
    expect(byStudent(students, 'C').failedSubjects).toEqual([`R${TAIL}M`]);
    expect(
      await prisma.resultRun.count({ where: { academicYearId: yearId } }),
    ).toBe(0);

    await get(
      results('/preview?examId=' + randomUUID()),
      token.controller,
    ).expect(404);
    await get(
      `/academic-years/${randomUUID()}/classes/${classId}/results/preview`,
      token.controller,
    ).expect(404);
  });

  it('has nothing to show until results are published', async () => {
    await get(results(), token.controller).expect(404);
    await get(results(`?sectionId=${s1}`), token.teacher).expect(404);
    await get(`/enrollments/${enr.A}/report-card`, token.controller).expect(
      404,
    );
  });

  it('publishes the first exam: its own result is frozen, the combined one waits for the final', async () => {
    await post(`/exams/${exam.terminal}/publish`, token.controller).expect(409); // must be locked first
    await post(`/exams/${exam.terminal}/lock`, token.controller).expect(200);
    const published = await post(
      `/exams/${exam.terminal}/publish`,
      token.controller,
    ).expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');

    const own = await get(
      results(`?examId=${exam.terminal}`),
      token.controller,
    ).expect(200);
    const rows = own.body.data.students as Row[];
    expect(own.body.data.run).toMatchObject({
      scope: 'EXAM',
      version: 1,
      revised: false,
    });
    expect(byStudent(rows, 'D')).toMatchObject({
      percentage: 83.5,
      classRank: 1,
    });
    expect(byStudent(rows, 'A')).toMatchObject({
      percentage: 76,
      classRank: 2,
    });
    expect(byStudent(rows, 'C')).toMatchObject({
      status: 'PASS',
      percentage: 51,
      classRank: 4,
    }); // passes the terminal
    await get(results(), token.controller).expect(404); // the combined result needs the final too
  });

  it('publishes the final exam and the combined result with it', async () => {
    await post(`/exams/${exam.final}/lock`, token.controller).expect(200);
    const published = await post(
      `/exams/${exam.final}/publish`,
      token.controller,
    ).expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { action: 'exam.published', entityId: exam.final },
        })
      ).details,
    ).toMatchObject({ runs: 2, incompleteStudents: 0 });

    const combined = await get(results(), token.controller).expect(200);
    expect(combined.body.data.run).toMatchObject({
      scope: 'POLICY',
      version: 1,
      revised: false,
    });
    expect(
      combined.body.data.run.components.map(
        (c: { weightPercent: number }) => c.weightPercent,
      ),
    ).toEqual([40, 60]);
    const rows = combined.body.data.students as Row[];
    expect(
      [rows[0], rows[1], rows[2], rows[3]].map((r) => r?.classRank),
    ).toEqual([1, 2, 3, 4]);
    expect(byStudent(rows, 'A')).toMatchObject({
      percentage: 81.52,
      gpa: 3.47,
    });
    expect(byStudent(rows, 'C')).toMatchObject({
      status: 'FAIL',
      classRank: 4,
    });
  });

  it('applies the scope rules to reading results', async () => {
    await get(results(), token.plain).expect(403);
    await get(results(), token.teacher).expect(403); // class teachers must name their section
    await get(results(`?sectionId=${s2}`), token.teacher).expect(403); // not their section
    const mine = await get(results(`?sectionId=${s1}`), token.teacher).expect(
      200,
    );
    expect(
      (mine.body.data.students as Row[]).map((r) => r.enrollmentId).sort(),
    ).toEqual([enr.A, enr.B].sort());
    await get(`/enrollments/${enr.A}/report-card`, token.teacher).expect(200);
    await get(`/enrollments/${enr.C}/report-card`, token.teacher).expect(403);
    await get(`/enrollments/${enr.A}/report-card`, token.plain).expect(403);
    await get(results('/runs'), token.teacher).expect(403);
    await get(results('/roll-order'), token.teacher).expect(403);
  });

  it('builds a complete report card', async () => {
    const res = await get(
      `/enrollments/${enr.A}/report-card`,
      token.controller,
    ).expect(200);
    const card = res.body.data;
    expect(card.student).toMatchObject({
      admissionNo: `E2E-${RUN}-A`,
      dateOfBirth: '2004-04-04',
    });
    expect(card.student.dateOfBirthBs).toEqual(expect.any(String));
    expect(card).toMatchObject({
      rollNo: 1,
      section: { name: 'A' },
      run: { scope: 'POLICY', version: 1 },
    });
    expect(card.result).toMatchObject({
      status: 'PASS',
      totalMarks: 203.8,
      totalFull: 250,
      percentage: 81.52,
      gpa: 3.47,
      creditBasis: 'CREDIT_HOURS',
      sectionRank: 1,
      classRank: 1,
      sectionSize: 2,
      classSize: 4,
    });
    expect(
      card.subjects.map((s: { grade: string; percentage: number }) => [
        s.grade,
        s.percentage,
      ]),
    ).toEqual([
      ['A', 84.8],
      ['A', 86],
      ['B+', 76],
    ]);
    expect(
      card.subjects[0].exams.map(
        (e: { weightPercent: number; theory: number }) => [
          e.weightPercent,
          e.theory,
        ],
      ),
    ).toEqual([
      [40, 60],
      [60, 66],
    ]);
    expect(card.attendance).toEqual({
      counts: { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 },
      daysRecorded: 0,
      attended: 0,
      percentage: null,
    });

    const binod = (
      await get(`/enrollments/${enr.B}/report-card`, token.controller).expect(
        200,
      )
    ).body.data;
    expect(binod.subjects).toHaveLength(2); // Computer is optional and Binod did not choose it
    const failed = (
      await get(`/enrollments/${enr.C}/report-card`, token.controller).expect(
        200,
      )
    ).body.data;
    expect(failed.subjects[0]).toMatchObject({
      status: 'FAILED',
      grade: 'NG',
      gradePoint: 0,
      percentage: 44.8,
      failedBecause: ['THEORY'],
    });
  });

  it('gives the roll-number order from the final ranking', async () => {
    const section = await get(
      results(`/roll-order?sectionId=${s1}`),
      token.controller,
    ).expect(200);
    expect(
      (section.body.data.order as { enrollmentId: string }[]).map(
        (o) => o.enrollmentId,
      ),
    ).toEqual([enr.A, enr.B]);
    const wholeClass = await get(
      results('/roll-order'),
      token.controller,
    ).expect(200);
    expect(wholeClass.body.data).toMatchObject({ version: 1, scope: 'CLASS' });
    expect(
      (
        wholeClass.body.data.order as {
          enrollmentId: string;
          position: number;
        }[]
      ).map((o) => o.enrollmentId),
    ).toEqual([enr.A, enr.D, enr.B, enr.C]);
  });

  it('revises results when a mark is corrected after publishing, and keeps the earlier versions', async () => {
    const fix = (subject: 'maths' | 'english', body: object) =>
      patch(
        `/exams/${exam.final}/sections/${s1}/subjects/${subj[subject]}/marks/${enr.B}`,
        token.controller,
        { reason: REASON, ...body },
      );

    await fix('maths', { theory: 75, practical: 25 }).expect(200); // Binod's Maths: 68 -> 86
    expect(
      (await get(results('/runs'), token.controller).expect(200)).body.data.map(
        (r: { version: number }) => r.version,
      ),
    ).toEqual([2, 1]);
    let rows = (await get(results(), token.controller).expect(200)).body.data
      .students as Row[];
    expect(byStudent(rows, 'B')).toMatchObject({
      percentage: 74.5,
      classRank: 3,
    }); // still behind Anil and Dipak

    await fix('english', { theory: 100 }).expect(200); // Binod's English: 63 -> 84
    const latest = await get(results(), token.controller).expect(200);
    expect(latest.body.data.run).toMatchObject({
      version: 3,
      revised: true,
      reason: REASON,
    });
    rows = latest.body.data.students as Row[];
    expect(byStudent(rows, 'B')).toMatchObject({
      percentage: 85,
      classRank: 1,
      sectionRank: 1,
    });
    expect(byStudent(rows, 'A')).toMatchObject({
      classRank: 2,
      sectionRank: 2,
    });
    expect(byStudent(rows, 'C')).toMatchObject({
      status: 'FAIL',
      classRank: 4,
    });

    const original = (
      await get(results('?version=1'), token.controller).expect(200)
    ).body.data;
    expect(original.run).toMatchObject({ version: 1, revised: false });
    expect(byStudent(original.students as Row[], 'B')).toMatchObject({
      percentage: 65.5,
      classRank: 3,
    }); // history is unchanged

    const exams = (
      await get(results(`/runs?examId=${exam.final}`), token.controller).expect(
        200,
      )
    ).body.data;
    expect(exams.map((r: { version: number }) => r.version)).toEqual([3, 2, 1]); // the exam's own result was revised too
    const terminal = (
      await get(
        results(`/runs?examId=${exam.terminal}`),
        token.controller,
      ).expect(200)
    ).body.data;
    expect(terminal).toHaveLength(1); // the terminal was not touched

    const card = (
      await get(`/enrollments/${enr.B}/report-card`, token.controller).expect(
        200,
      )
    ).body.data;
    expect(card).toMatchObject({
      run: { version: 3, revised: true },
      result: { classRank: 1, percentage: 85 },
    });
    expect(
      (
        await get(
          `/enrollments/${enr.B}/report-card?version=1`,
          token.controller,
        ).expect(200)
      ).body.data.result.classRank,
    ).toBe(3);
    await get(results('?version=99'), token.controller).expect(404);
  });

  it('keeps published results immutable', async () => {
    const run = await prisma.resultRun.findFirstOrThrow({
      where: { academicYearId: yearId, scopeKey: 'POLICY', version: 1 },
    });
    await expect(
      prisma.resultRun.update({
        where: { id: run.id },
        data: { reason: 'edited' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.resultRun.delete({ where: { id: run.id } }),
    ).rejects.toThrow();
    const row = await prisma.resultRow.findFirstOrThrow({
      where: { runId: run.id },
    });
    await expect(
      prisma.resultRow.update({
        where: {
          runId_enrollmentId: { runId: run.id, enrollmentId: row.enrollmentId },
        },
        data: { percentage: 100 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.resultRow.delete({
        where: {
          runId_enrollmentId: { runId: run.id, enrollmentId: row.enrollmentId },
        },
      }),
    ).rejects.toThrow();
  });
});
