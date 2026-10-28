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

const PFX = 'E2E-PAP';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const email = (n: string): string => `e2e-pap-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

type Key = 'a1' | 'a2' | 'a3' | 'b1' | 'b2' | 'g1' | 'g2';
const PLAN: Record<
  Key,
  {
    cls: 'Y5' | 'Y6';
    section: 'A' | 'B';
    roll: number;
    status: 'PASS' | 'FAIL';
    classRank: number;
    sectionRank: number;
    percentage: number;
  }
> = {
  a1: {
    cls: 'Y5',
    section: 'A',
    roll: 1,
    status: 'PASS',
    classRank: 1,
    sectionRank: 1,
    percentage: 90,
  },
  b1: {
    cls: 'Y5',
    section: 'B',
    roll: 1,
    status: 'PASS',
    classRank: 2,
    sectionRank: 1,
    percentage: 85,
  },
  a2: {
    cls: 'Y5',
    section: 'A',
    roll: 2,
    status: 'PASS',
    classRank: 3,
    sectionRank: 2,
    percentage: 75,
  },
  b2: {
    cls: 'Y5',
    section: 'B',
    roll: 2,
    status: 'PASS',
    classRank: 4,
    sectionRank: 2,
    percentage: 65,
  },
  a3: {
    cls: 'Y5',
    section: 'A',
    roll: 3,
    status: 'FAIL',
    classRank: 5,
    sectionRank: 3,
    percentage: 30,
  },
  g1: {
    cls: 'Y6',
    section: 'A',
    roll: 1,
    status: 'PASS',
    classRank: 1,
    sectionRank: 1,
    percentage: 88,
  },
  g2: {
    cls: 'Y6',
    section: 'A',
    roll: 2,
    status: 'FAIL',
    classRank: 2,
    sectionRank: 2,
    percentage: 28,
  },
};

describe('Promotion apply, rolls, undo and closing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = false;
  const token = { admin: '', manager: '', plain: '' };
  let adminId = '';
  let fromYear = '';
  let toYear = '';
  const cls = { Y5: '', Y6: '' };
  const sec = { Y5A: '', Y5B: '', Y6A: '', Y6B: '' };
  const subj = { OPT: '', OPT2: '' };
  const enr = {} as Record<Key, string>;
  const stu = {} as Record<Key, string>;
  let n1Enrollment = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.admin) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object = {}, t = token.admin) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, body: object, t = token.admin) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const base = (): string => `/academic-years/${fromYear}/promotion`;
  const apply = (t = token.admin, body: object = {}) =>
    post(`${base()}/apply`, body, t);
  const undo = (key: Key, t = token.admin) =>
    post(`${base()}/decisions/${enr[key]}/undo`, {}, t);
  const decision = (key: Key) =>
    prisma.promotionDecision.findFirstOrThrow({
      where: { enrollmentId: enr[key] },
    });
  const newEnrollment = async (key: Key) => {
    const d = await decision(key);
    return d.newEnrollmentId
      ? prisma.enrollment.findUniqueOrThrow({
          where: { id: d.newEnrollmentId },
        })
      : null;
  };
  type Apply = {
    status: string;
    remaining: number;
    totals: {
      moved: number;
      graduated: number;
      blocked: number;
      optionalCarried: number;
      optionalDropped: number;
    };
    chunks: {
      sectionId: string;
      blocked: { reason: string; admissionNo: string }[];
    }[];
    errors: unknown[];
  };
  const applied = async (t = token.admin, body: object = {}): Promise<Apply> =>
    (await apply(t, body).expect(200)).body.data as Apply;

  async function cleanup(): Promise<void> {
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    const runs = await prisma.promotionRun.findMany({
      where: {
        OR: [{ fromYearId: { in: yearIds } }, { toYearId: { in: yearIds } }],
      },
      select: { id: true },
    });
    await prisma.promotionDecision.deleteMany({
      where: { runId: { in: runs.map((r) => r.id) } },
    });
    await prisma.promotionRun.deleteMany({
      where: { id: { in: runs.map((r) => r.id) } },
    });
    await prisma.attendanceRecord.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.studentSubjectChoice.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    const students = await prisma.student.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true },
    });
    await prisma.enrollment.deleteMany({
      where: {
        OR: [
          { studentId: { in: students.map((s) => s.id) } },
          { academicYearId: { in: yearIds } },
        ],
      },
    });
    await prisma.classSubject.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.schoolClass.updateMany({
      where: { name: { startsWith: PFX } },
      data: { nextClassId: null },
    });
    await prisma.section.deleteMany({
      where: { schoolClass: { name: { startsWith: PFX } } },
    });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.subject.deleteMany({ where: { name: { startsWith: PFX } } });
    await prisma.student.deleteMany({
      where: { id: { in: students.map((s) => s.id) } },
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

  async function publishResult(
    classKey: 'Y5' | 'Y6',
    version: number,
  ): Promise<void> {
    const keys = (Object.keys(PLAN) as Key[]).filter(
      (k) => PLAN[k].cls === classKey,
    );
    await prisma.resultRun.create({
      data: {
        academicYearId: fromYear,
        classId: cls[classKey],
        scopeKey: 'POLICY',
        version,
        createdById: adminId,
        gradeScale: { id: 'x', name: 'x', bands: [] },
        components: [],
        warnings: [],
        rows: {
          create: keys.map((k) => ({
            enrollmentId: enr[k],
            sectionId: sec[`${classKey}${PLAN[k].section}` as keyof typeof sec],
            status: PLAN[k].status,
            percentage: PLAN[k].percentage,
            classRank: PLAN[k].classRank,
            sectionRank: PLAN[k].sectionRank,
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

  const newStudent = (label: string) =>
    prisma.student.create({
      data: {
        admissionNo: `E2E-${RUN}-${label}`,
        firstName: `${PFX}-${label}`,
        lastName: 'Rai',
        gender: 'MALE',
        dateOfBirth: date('1995-04-04'),
        admissionDate: date('2000-05-05'),
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
      where: { email: { startsWith: 'e2e-pap-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    blocked =
      (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' } })) !==
        null ||
      (await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: date('2007-03-31') },
          endDate: { gte: date('2004-04-01') },
        },
      })) !== null;
    if (blocked) return;

    adminId = await makeUser('admin', [
      ['promotion', 'read'],
      ['promotion', 'manage'],
      ['promotion', 'apply'],
      ['enrollments', 'read'],
      ['academic-years', 'read'],
      ['academic-years', 'manage'],
    ]);
    await makeUser('manager', [
      ['promotion', 'read'],
      ['promotion', 'manage'],
      ['academic-years', 'manage'],
    ]);
    await makeUser('plain', []);

    fromYear = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-FROM`,
          startDate: date('2005-04-01'),
          endDate: date('2006-03-31'),
          status: 'ACTIVE',
        },
      })
    ).id;
    toYear = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-TO`,
          startDate: date('2006-04-01'),
          endDate: date('2007-03-31'),
        },
      })
    ).id;
    cls.Y5 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-Y5`, sortOrder: 5 },
      })
    ).id;
    cls.Y6 = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-Y6`, sortOrder: 6 },
      })
    ).id;
    await prisma.schoolClass.update({
      where: { id: cls.Y5 },
      data: { nextClassId: cls.Y6 },
    }); // Y6 is the final class
    const makeSection = async (
      key: keyof typeof sec,
      classKey: 'Y5' | 'Y6',
      name: string,
      capacity?: number,
    ): Promise<void> => {
      sec[key] = (
        await prisma.section.create({
          data: { classId: cls[classKey], name, capacity },
        })
      ).id;
    };
    await makeSection('Y5A', 'Y5', 'A');
    await makeSection('Y5B', 'Y5', 'B');
    await makeSection('Y6A', 'Y6', 'A', 3);
    await makeSection('Y6B', 'Y6', 'B');

    subj.OPT = (
      await prisma.subject.create({
        data: { code: `O${TAIL}`, name: `${PFX}-${RUN}-Computer` },
      })
    ).id;
    subj.OPT2 = (
      await prisma.subject.create({
        data: { code: `Q${TAIL}`, name: `${PFX}-${RUN}-Music` },
      })
    ).id;
    const compulsory = (
      await prisma.subject.create({
        data: { code: `C${TAIL}`, name: `${PFX}-${RUN}-Maths` },
      })
    ).id;
    await prisma.classSubject.createMany({
      data: [
        {
          academicYearId: fromYear,
          classId: cls.Y5,
          subjectId: subj.OPT,
          isCompulsory: false,
        },
        {
          academicYearId: fromYear,
          classId: cls.Y5,
          subjectId: subj.OPT2,
          isCompulsory: false,
        },
        {
          academicYearId: toYear,
          classId: cls.Y6,
          subjectId: subj.OPT,
          isCompulsory: false,
        }, // next year's Y6 offers Computer, not Music
        {
          academicYearId: toYear,
          classId: cls.Y6,
          subjectId: compulsory,
          isCompulsory: true,
        },
      ],
    });

    for (const key of Object.keys(PLAN) as Key[]) {
      const p = PLAN[key];
      const student = await newStudent(key);
      stu[key] = student.id;
      enr[key] = (
        await prisma.enrollment.create({
          data: {
            studentId: student.id,
            academicYearId: fromYear,
            classId: cls[p.cls],
            sectionId: sec[`${p.cls}${p.section}` as keyof typeof sec],
            rollNo: p.roll,
          },
        })
      ).id;
    }
    await prisma.studentSubjectChoice.create({
      data: {
        enrollmentId: enr.a1,
        subjectId: subj.OPT,
        academicYearId: fromYear,
        classId: cls.Y5,
      },
    });
    await prisma.studentSubjectChoice.create({
      data: {
        enrollmentId: enr.b1,
        subjectId: subj.OPT2,
        academicYearId: fromYear,
        classId: cls.Y5,
      },
    });

    // Already registered for next year in Y6-A: it takes one of the three seats.
    const n1 = await newStudent('n1');
    n1Enrollment = (
      await prisma.enrollment.create({
        data: {
          studentId: n1.id,
          academicYearId: toYear,
          classId: cls.Y6,
          sectionId: sec.Y6A,
          rollNo: 1,
        },
      })
    ).id;

    await publishResult('Y5', 1);
    await publishResult('Y6', 1);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-pap-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('keeps apply, rolls and undo for people who may apply promotions', async ({
    skip,
  }) => {
    if (blocked) skip();
    for (const t of [token.plain, token.manager]) {
      await apply(t).expect(403);
      await post(`${base()}/finalize-rolls`, {}, t).expect(403);
      await undo('a1', t).expect(403);
    }
    await apply().expect(404); // no plan yet
    await post(base(), { toYearId: toYear }, token.manager).expect(200); // managers may still build the plan
  });

  it('applies in section chunks, blocking whatever does not fit', async ({
    skip,
  }) => {
    if (blocked) skip();
    const summary = (await get(base()).expect(200)).body.data;
    expect(summary.totals).toMatchObject({
      students: 7,
      promote: 4,
      repeat: 2,
      graduate: 1,
      hold: 0,
      needsSection: 0,
    });
    expect(
      summary.readiness.find(
        (r: { code: string }) => r.code === 'OVER_CAPACITY',
      ),
    ).toMatchObject({ blocking: true, sectionId: sec.Y6A });

    const res = await applied();
    expect(res.totals).toEqual({
      moved: 5,
      graduated: 1,
      blocked: 1,
      optionalCarried: 1,
      optionalDropped: 1,
    });
    expect(res.chunks.map((c) => c.sectionId)).toEqual([
      sec.Y5A,
      sec.Y5B,
      sec.Y6A,
    ]); // lower classes first
    expect(res.chunks[2]?.blocked).toEqual([
      {
        enrollmentId: enr.g2,
        admissionNo: `E2E-${RUN}-g2`,
        reason: 'SECTION_FULL',
      },
    ]);
    expect(res).toMatchObject({ status: 'APPLYING', remaining: 1, errors: [] });

    // Placement: same section name, no roll numbers yet.
    expect(await newEnrollment('a1')).toMatchObject({
      classId: cls.Y6,
      sectionId: sec.Y6A,
      status: 'ENROLLED',
      rollNo: null,
      academicYearId: toYear,
    });
    expect(await newEnrollment('a2')).toMatchObject({ sectionId: sec.Y6A });
    expect(await newEnrollment('a3')).toMatchObject({
      classId: cls.Y5,
      sectionId: sec.Y5A,
    }); // repeats Y5
    expect(await newEnrollment('b1')).toMatchObject({ sectionId: sec.Y6B });
    expect(await newEnrollment('b2')).toMatchObject({ sectionId: sec.Y6B });
    expect(await newEnrollment('g1')).toBeNull();
    expect(await newEnrollment('g2')).toBeNull();

    // The year just finished is complete for them; graduates are graduated; the blocked one is untouched.
    for (const key of ['a1', 'a2', 'a3', 'b1', 'b2', 'g1'] as const) {
      expect(
        await prisma.enrollment.findUniqueOrThrow({ where: { id: enr[key] } }),
      ).toMatchObject({ status: 'COMPLETED' });
    }
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { id: enr.a1 } }))
        .statusChangedOn,
    ).not.toBeNull();
    expect(
      await prisma.student.findUniqueOrThrow({ where: { id: stu.g1 } }),
    ).toMatchObject({ status: 'GRADUATED' });
    expect(
      await prisma.enrollment.findUniqueOrThrow({ where: { id: enr.g2 } }),
    ).toMatchObject({ status: 'ENROLLED' });
    expect(
      await prisma.student.findUniqueOrThrow({ where: { id: stu.g2 } }),
    ).toMatchObject({ status: 'ACTIVE' });

    // Optional subjects: Computer follows Anil; Music is not offered in Y6, so Binod chooses again.
    const a1New = (await newEnrollment('a1'))?.id as string;
    const b1New = (await newEnrollment('b1'))?.id as string;
    expect(
      (
        await prisma.studentSubjectChoice.findMany({
          where: { enrollmentId: a1New },
        })
      ).map((c) => c.subjectId),
    ).toEqual([subj.OPT]);
    expect(
      await prisma.studentSubjectChoice.count({
        where: { enrollmentId: b1New },
      }),
    ).toBe(0);
    expect(
      await prisma.enrollment.count({
        where: {
          academicYearId: toYear,
          sectionId: sec.Y6A,
          status: 'ENROLLED',
        },
      }),
    ).toBe(3); // full

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'promotion.applied', entityType: 'promotion_run' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit.details).toMatchObject({
      sectionId: sec.Y6A,
      graduated: 1,
      blocked: 1,
    });
    expect(JSON.stringify(audit.details)).not.toContain(PFX);
  });

  it('can be run again without moving anyone twice', async ({ skip }) => {
    if (blocked) skip();
    const before = await prisma.enrollment.count({
      where: { academicYearId: toYear },
    });
    const again = await applied();
    expect(again.totals).toEqual({
      moved: 0,
      graduated: 0,
      blocked: 1,
      optionalCarried: 0,
      optionalDropped: 0,
    });
    expect(again.chunks).toHaveLength(1); // only the section with something left
    expect(
      await prisma.enrollment.count({ where: { academicYearId: toYear } }),
    ).toBe(before);

    await patch(
      `${base()}/decisions/${enr.a1}`,
      { toClassId: cls.Y6 },
      token.manager,
    ).expect(409); // moved students cannot be edited
    await post(base(), { toYearId: toYear }).expect(200); // refreshing keeps what has been moved
    expect((await get(base()).expect(200)).body.data.totals.applied).toBe(6);
  });

  it('places the blocked student once the plan is corrected, and the plan completes', async ({
    skip,
  }) => {
    if (blocked) skip();
    await patch(
      `${base()}/decisions/${enr.g2}`,
      { toSectionId: sec.Y6B },
      token.manager,
    ).expect(200);
    const res = await applied();
    expect(res).toMatchObject({
      status: 'APPLIED',
      remaining: 0,
      totals: { moved: 1, graduated: 0, blocked: 0 },
    });
    expect(await newEnrollment('g2')).toMatchObject({
      classId: cls.Y6,
      sectionId: sec.Y6B,
    });
    const run = await prisma.promotionRun.findFirstOrThrow({
      where: { fromYearId: fromYear },
    });
    expect(run).toMatchObject({ status: 'APPLIED' });
    expect(run.appliedAt).not.toBeNull();
    await apply().expect(409); // already fully applied
    await post(base(), { toYearId: toYear }).expect(409);
  });

  it('assigns roll numbers by previous rank: promoted first, then repeaters, then everyone else', async ({
    skip,
  }) => {
    if (blocked) skip();
    expect((await newEnrollment('a1'))?.rollNo).toBeNull();
    const res = await post(`${base()}/finalize-rolls`).expect(200);
    expect(
      (res.body.data.sections as { sectionId: string; students: number }[])
        .map((s) => [s.sectionId, s.students])
        .sort(),
    ).toEqual(
      [
        [sec.Y5A, 1],
        [sec.Y6A, 3],
        [sec.Y6B, 3],
      ].sort(),
    );

    const roll = async (id: string | undefined): Promise<number | null> =>
      (
        await prisma.enrollment.findUniqueOrThrow({
          where: { id: id as string },
        })
      ).rollNo;
    expect(await roll((await newEnrollment('a1'))?.id)).toBe(1); // Y6-A: Anil, rank 1 of Y5
    expect(await roll((await newEnrollment('a2'))?.id)).toBe(2); // rank 3
    expect(await roll(n1Enrollment)).toBe(3); // pre-registered, so after those promoted by rank
    expect(await roll((await newEnrollment('b1'))?.id)).toBe(1); // Y6-B: rank 2, then rank 4, then the repeater
    expect(await roll((await newEnrollment('b2'))?.id)).toBe(2);
    expect(await roll((await newEnrollment('g2'))?.id)).toBe(3);
    expect(await roll((await newEnrollment('a3'))?.id)).toBe(1);

    const list = (
      await get(
        `/academic-years/${toYear}/sections/${sec.Y6A}/enrollments`,
      ).expect(200)
    ).body.data as { rollNo: number; status: string }[];
    expect(list.map((r) => r.rollNo)).toEqual([1, 2, 3]);
    await post(`${base()}/finalize-rolls`).expect(200); // repeatable
    expect(await roll((await newEnrollment('a1'))?.id)).toBe(1);
    expect(
      (
        await post(`${base()}/finalize-rolls`, { sectionId: sec.Y6B }).expect(
          200,
        )
      ).body.data.sections,
    ).toHaveLength(1);
    await post(`${base()}/finalize-rolls`, { sectionId: sec.Y5B }).expect(404); // nobody was placed there
    await post(`${base()}/finalize-rolls`, { toYearId: randomUUID() }).expect(
      404,
    );

    // The year just finished still shows its students, with their completed status.
    const old = (
      await get(
        `/academic-years/${fromYear}/sections/${sec.Y5A}/enrollments`,
      ).expect(200)
    ).body.data as { status: string; rollNo: number }[];
    expect(old.map((r) => [r.rollNo, r.status])).toEqual([
      [1, 'COMPLETED'],
      [2, 'COMPLETED'],
      [3, 'COMPLETED'],
    ]);
  });

  it('undoes a move only when nothing depends on it', async ({ skip }) => {
    if (blocked) skip();
    // Attendance on b1's new enrollment makes it permanent.
    const b1New = (await newEnrollment('b1'))?.id as string;
    const session = await prisma.attendanceSession.create({
      data: {
        academicYearId: toYear,
        sectionId: sec.Y6B,
        date: date('2006-05-02'),
        takenById: adminId,
      },
    });
    await prisma.attendanceRecord.create({
      data: {
        sessionId: session.id,
        date: date('2006-05-02'),
        academicYearId: toYear,
        enrollmentId: b1New,
        status: 'PRESENT',
      },
    });
    const blockedUndo = await undo('b1').expect(409);
    expect(blockedUndo.body.error.message).toMatch(/attendance/);
    await prisma.attendanceRecord.deleteMany({
      where: { sessionId: session.id },
    });
    await prisma.attendanceSession.delete({ where: { id: session.id } });

    await prisma.academicYear.update({
      where: { id: toYear },
      data: { status: 'CLOSED' },
    });
    await undo('b2').expect(409); // the next year is no longer planned
    await prisma.academicYear.update({
      where: { id: toYear },
      data: { status: 'PLANNED' },
    });

    const a1New = (await newEnrollment('a1'))?.id as string;
    await undo('a1').expect(200);
    expect(await prisma.enrollment.count({ where: { id: a1New } })).toBe(0);
    expect(
      await prisma.studentSubjectChoice.count({
        where: { enrollmentId: a1New },
      }),
    ).toBe(0);
    expect(
      await prisma.enrollment.findUniqueOrThrow({ where: { id: enr.a1 } }),
    ).toMatchObject({ status: 'ENROLLED', statusChangedOn: null });
    expect(await decision('a1')).toMatchObject({
      appliedAt: null,
      newEnrollmentId: null,
    });
    expect((await get(base()).expect(200)).body.data.run.status).toBe(
      'APPLYING',
    ); // the plan is open again
    await undo('a1').expect(409); // not moved any more

    await undo('g1').expect(200);
    expect(
      await prisma.student.findUniqueOrThrow({ where: { id: stu.g1 } }),
    ).toMatchObject({ status: 'ACTIVE', statusChangedOn: null });
    expect(
      await prisma.enrollment.findUniqueOrThrow({ where: { id: enr.g1 } }),
    ).toMatchObject({ status: 'ENROLLED' });
    await undo('a3', token.manager).expect(403);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'promotion.undone', entityType: 'promotion_run' },
      }),
    ).not.toBeNull();
  });

  it('refuses to apply on results that changed, until the plan is refreshed', async ({
    skip,
  }) => {
    if (blocked) skip();
    await publishResult('Y5', 2); // a revised combined result for Y5

    const stale = await applied();
    expect(stale.totals).toMatchObject({ moved: 0, graduated: 1, blocked: 1 }); // Y6 is unaffected, so g1 graduates again
    expect(stale.chunks.flatMap((c) => c.blocked)).toEqual([
      {
        enrollmentId: enr.a1,
        admissionNo: `E2E-${RUN}-a1`,
        reason: 'STALE_RESULT',
      },
    ]);
    expect(stale.status).toBe('APPLYING');

    expect(
      (await post(base(), { toYearId: toYear }).expect(200)).body.data.refresh,
    ).toMatchObject({ removed: 0 });
    const fresh = await applied();
    expect(fresh).toMatchObject({
      status: 'APPLIED',
      remaining: 0,
      totals: { moved: 1, blocked: 0 },
    });
    expect(await newEnrollment('a1')).toMatchObject({
      sectionId: sec.Y6A,
      classId: cls.Y6,
    });
    expect(
      await prisma.enrollment.count({
        where: {
          academicYearId: toYear,
          sectionId: sec.Y6A,
          status: 'ENROLLED',
        },
      }),
    ).toBe(3);
  });

  it('checks promotion before a year is closed, and lets only the principal override', async ({
    skip,
  }) => {
    if (blocked) skip();
    // A student admitted mid-year who was not part of the plan.
    const late = await newStudent('late');
    await prisma.enrollment.create({
      data: {
        studentId: late.id,
        academicYearId: fromYear,
        classId: cls.Y5,
        sectionId: sec.Y5A,
        rollNo: 9,
      },
    });

    const checklist = (
      await get(`/academic-years/${fromYear}/closing-checklist`).expect(200)
    ).body.data;
    expect(checklist).toMatchObject({
      status: 'ACTIVE',
      canClose: true,
      enrolledStudents: 1,
      ready: false,
      exams: { total: 0, unpublished: [] },
    });
    expect(checklist.byClass).toEqual([
      expect.objectContaining({ classId: cls.Y5, enrolled: 1 }),
    ]);
    expect(checklist.promotion).toEqual([
      {
        toYear: { id: toYear, name: `${PFX}-${RUN}-TO` },
        status: 'APPLIED',
        applied: 7,
        total: 7,
        pending: 0,
      },
    ]);
    expect(checklist.warnings.join(' ')).toMatch(/1 student/);
    await get(
      `/academic-years/${fromYear}/closing-checklist`,
      token.plain,
    ).expect(403);
    await get(`/academic-years/${randomUUID()}/closing-checklist`).expect(404);

    const close = (body: object, t = token.admin) =>
      post(`/academic-years/${fromYear}/close`, body, t);
    const refused = await close({}).expect(409);
    expect(refused.body.error.message).toMatch(
      /1 student\(s\) are still enrolled/,
    );
    await close(
      {
        acknowledgeUnplaced: true,
        reason: 'The student joined mid-year and is repeating',
      },
      token.manager,
    ).expect(403); // may manage years, not apply promotions
    await close({ acknowledgeUnplaced: true }).expect(400); // a reason is needed
    await close({ acknowledgeUnplaced: true, reason: 'short' }).expect(400);

    const closed = await close({
      acknowledgeUnplaced: true,
      reason: 'The student joined mid-year and is repeating',
    }).expect(200);
    expect(closed.body.data.status).toBe('CLOSED');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'academic-year.closed', entityId: fromYear },
    });
    expect(audit.details).toMatchObject({
      unplaced: 1,
      acknowledged: true,
      reason: 'The student joined mid-year and is repeating',
    });

    // A closed year can no longer be changed through the plan.
    await apply().expect(409);
    await undo('a2').expect(409);
    expect(
      (await get(`/academic-years/${fromYear}/closing-checklist`).expect(200))
        .body.data.canClose,
    ).toBe(false);
  });
});
