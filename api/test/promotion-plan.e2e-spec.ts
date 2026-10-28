import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { proposedAction } from '../src/modules/promotion/promotion.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PFX = 'E2E-PRM';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const email = (n: string): string => `e2e-prm-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const NOTE = 'Principal decision after the review meeting';

type Key = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8';
type Result = {
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  classRank: number | null;
  sectionRank: number | null;
  percentage: number | null;
};
const PLAN: Record<
  Key,
  { cls: 'X4' | 'X5' | 'X6'; section: 'A' | 'B'; roll: number; result?: Result }
> = {
  s1: {
    cls: 'X5',
    section: 'A',
    roll: 1,
    result: { status: 'PASS', classRank: 1, sectionRank: 1, percentage: 90 },
  },
  s8: {
    cls: 'X5',
    section: 'A',
    roll: 2,
    result: { status: 'PASS', classRank: 2, sectionRank: 2, percentage: 80 },
  },
  s2: {
    cls: 'X5',
    section: 'A',
    roll: 3,
    result: { status: 'FAIL', classRank: 4, sectionRank: 3, percentage: 30 },
  },
  s3: {
    cls: 'X5',
    section: 'A',
    roll: 4,
    result: {
      status: 'INCOMPLETE',
      classRank: null,
      sectionRank: null,
      percentage: null,
    },
  },
  s4: {
    cls: 'X5',
    section: 'B',
    roll: 1,
    result: { status: 'PASS', classRank: 3, sectionRank: 1, percentage: 70 },
  },
  s5: {
    cls: 'X6',
    section: 'A',
    roll: 1,
    result: { status: 'PASS', classRank: 1, sectionRank: 1, percentage: 85 },
  },
  s6: {
    cls: 'X6',
    section: 'A',
    roll: 2,
    result: { status: 'FAIL', classRank: 2, sectionRank: 2, percentage: 20 },
  },
  s7: { cls: 'X4', section: 'A', roll: 1 }, // class X4 has no published result
};

describe('Promotion plan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blocked = false;
  const token = { admin: '', reader: '', plain: '' };
  let fromYear = '';
  let toYear = '';
  let earlyYear = '';
  const cls = { X4: '', X5: '', X6: '', XALT: '' };
  const sec = { X4A: '', X5A: '', X5B: '', X6A: '', XALTA: '' };
  const enr = {} as Record<Key, string>;
  const adm = {} as Record<Key, string>;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = token.admin) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t = token.admin) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, body: object, t = token.admin) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const del = (url: string, t = token.admin) =>
    http().delete(`${V1}${url}`).set(auth(t));
  const base = (): string => `/academic-years/${fromYear}/promotion`;
  const propose = (t = token.admin, to = toYear) =>
    post(base(), { toYearId: to }, t);
  const decide = (key: Key, body: object, t = token.admin) =>
    patch(`${base()}/decisions/${enr[key]}`, body, t);
  type Row = {
    enrollmentId: string;
    admissionNo: string;
    action: string;
    basis: string;
    toClass: { id: string } | null;
    toSection: { id: string; name: string } | null;
    result: {
      status: string | null;
      classRank: number | null;
      version: number | null;
    } | null;
    stale: boolean;
    applied: boolean;
  };
  const classRows = async (classId: string, query = ''): Promise<Row[]> =>
    (await get(`${base()}/classes/${classId}${query}`).expect(200)).body.data
      .students as Row[];
  const rowOf = (rows: Row[], key: Key): Row =>
    rows.find((r) => r.enrollmentId === enr[key]) as Row;

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
    await prisma.classTeacherAssignment.deleteMany({
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

  /** A published combined result, written directly. The exam pipeline has its own tests. */
  async function publishResult(
    classKey: 'X5' | 'X6',
    version: number,
    createdById: string,
    overrides: Partial<Record<Key, Result>> = {},
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
        createdById,
        gradeScale: { id: 'x', name: 'x', bands: [] },
        components: [],
        warnings: [],
        rows: {
          create: keys.map((k) => {
            const r = (overrides[k] ?? PLAN[k].result) as Result;
            return {
              enrollmentId: enr[k],
              sectionId:
                sec[`${classKey}${PLAN[k].section}` as keyof typeof sec],
              status: r.status,
              percentage: r.percentage,
              classRank: r.classRank,
              sectionRank: r.sectionRank,
              payload: {
                subjects: [],
                missing: [],
                failedSubjects: [],
                creditBasis: 'EQUAL',
              },
            };
          }),
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

    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-prm-' } },
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

    const adminId = await makeUser('admin', [
      ['promotion', 'read'],
      ['promotion', 'manage'],
      ['classes', 'manage'],
      ['classes', 'read'],
    ]);
    await makeUser('reader', [['promotion', 'read']]);
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
    earlyYear = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-EARLY`,
          startDate: date('2004-04-01'),
          endDate: date('2005-03-31'),
        },
      })
    ).id;

    const makeClass = async (
      key: keyof typeof cls,
      sortOrder: number,
    ): Promise<void> => {
      cls[key] = (
        await prisma.schoolClass.create({
          data: { name: `${PFX}-${RUN}-${key}`, sortOrder },
        })
      ).id;
    };
    await makeClass('X4', 4);
    await makeClass('X5', 5);
    await makeClass('X6', 6);
    await makeClass('XALT', 7);
    await prisma.schoolClass.update({
      where: { id: cls.X4 },
      data: { nextClassId: cls.X5 },
    });
    await prisma.schoolClass.update({
      where: { id: cls.X5 },
      data: { nextClassId: cls.X6 },
    }); // X6 is the final class

    const makeSection = async (
      key: keyof typeof sec,
      classKey: keyof typeof cls,
      name: string,
      capacity?: number,
    ): Promise<void> => {
      sec[key] = (
        await prisma.section.create({
          data: { classId: cls[classKey], name, capacity },
        })
      ).id;
    };
    await makeSection('X4A', 'X4', 'A');
    await makeSection('X5A', 'X5', 'A');
    await makeSection('X5B', 'X5', 'B'); // X6 has no section B
    await makeSection('X6A', 'X6', 'A', 1); // one seat only
    await makeSection('XALTA', 'XALT', 'A');

    const subject = await prisma.subject.create({
      data: { code: `P${String(RUN).slice(-8)}`, name: `${PFX}-${RUN}-Maths` },
    });
    await prisma.classSubject.create({
      data: { academicYearId: toYear, classId: cls.X6, subjectId: subject.id },
    }); // next year's X6 has a curriculum

    for (const key of Object.keys(PLAN) as Key[]) {
      const p = PLAN[key];
      adm[key] = `E2E-${RUN}-${key}`;
      const student = await prisma.student.create({
        data: {
          admissionNo: adm[key],
          firstName: `${PFX}-${key}`,
          lastName: 'Rai',
          gender: 'MALE',
          dateOfBirth: date('1995-04-04'),
          admissionDate: date('2000-05-05'),
        },
      });
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
    await publishResult('X5', 1, adminId);
    await publishResult('X6', 1, adminId);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-prm-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('proposes an outcome from each kind of result', () => {
    expect(proposedAction('PASS', true)).toBe('PROMOTE');
    expect(proposedAction('PASS', false)).toBe('GRADUATE');
    expect(proposedAction('FAIL', true)).toBe('REPEAT');
    expect(proposedAction('FAIL', false)).toBe('REPEAT');
    expect(proposedAction('INCOMPLETE', true)).toBe('HOLD');
    expect(proposedAction(null, false)).toBe('HOLD');
  });

  it('keeps the class order free of self-references and loops', async ({
    skip,
  }) => {
    if (blocked) skip();
    const next = (id: string, nextClassId: string | null, t = token.admin) =>
      patch(`/classes/${id}`, { nextClassId }, t);
    await next(cls.X6, cls.X6).expect(400); // itself
    await next(cls.X6, cls.X4).expect(400); // X4 -> X5 -> X6 -> X4
    await next(cls.X6, randomUUID()).expect(400);
    await next(cls.X5, cls.X6, token.plain).expect(403);

    const shown = (await get(`/classes/${cls.X5}`).expect(200)).body.data;
    expect(shown.nextClass).toMatchObject({ id: cls.X6 });
    await next(cls.XALT, cls.X4).expect(200); // XALT -> X4 -> X5 -> X6 is fine
    await next(cls.X4, cls.XALT).expect(400); // but X4 -> XALT would loop
    await next(cls.XALT, null).expect(200);
    await del(`/classes/${cls.X6}`).expect(409); // X5 points to it
  });

  it('requires the promotion permissions', async ({ skip }) => {
    if (blocked) skip();
    await get(base(), token.plain).expect(403);
    await propose(token.plain).expect(403);
    await propose(token.reader).expect(403); // reading is not managing
    await decide('s1', { note: 'x' }, token.reader).expect(403);
    await get(base()).expect(404); // no plan yet
  });

  it('refuses plans that cannot work', async ({ skip }) => {
    if (blocked) skip();
    await post(base(), { toYearId: fromYear }).expect(400); // the same year
    await post(base(), { toYearId: randomUUID() }).expect(404);
    await post(`/academic-years/${toYear}/promotion`, {
      toYearId: fromYear,
    }).expect(409); // the year ending must be the active one
    await post(base(), { toYearId: earlyYear }).expect(400); // the next year must start after this one ends
    await post(base(), { toYearId: 'not-a-uuid' }).expect(400);
  });

  it('builds the plan from published results', async ({ skip }) => {
    if (blocked) skip();
    const res = await propose().expect(200);
    const s = res.body.data;
    expect(s.run).toMatchObject({
      status: 'DRAFT',
      fromYear: { id: fromYear },
      toYear: { id: toYear },
      appliedAt: null,
    });
    expect(s.refresh).toEqual({
      students: 8,
      created: 8,
      manualKept: 0,
      resultChanged: 0,
      removed: 0,
    });
    expect(s.totals).toEqual({
      students: 8,
      promote: 3,
      repeat: 2,
      graduate: 1,
      hold: 2,
      applied: 0,
      needsSection: 1,
      stale: 0,
    });

    const x5 = s.classes.find((c: { classId: string }) => c.classId === cls.X5);
    expect(x5).toMatchObject({
      nextClass: { id: cls.X6 },
      resultVersion: 1,
      stale: false,
      counts: { promote: 3, repeat: 1, graduate: 0, hold: 1, needsSection: 1 },
    });
    expect(s.classes.map((c: { sortOrder: number }) => c.sortOrder)).toEqual([
      4, 5, 6,
    ]);

    const rows = await classRows(cls.X5);
    expect(rows.map((r) => r.admissionNo)).toEqual([
      adm.s1,
      adm.s8,
      adm.s4,
      adm.s2,
      adm.s3,
    ]); // by class rank, unranked last
    expect(rowOf(rows, 's1')).toMatchObject({
      action: 'PROMOTE',
      basis: 'RESULT',
      toClass: { id: cls.X6 },
      toSection: { id: sec.X6A, name: 'A' },
      result: { status: 'PASS', classRank: 1, version: 1 },
      stale: false,
      applied: false,
    });
    expect(rowOf(rows, 's4')).toMatchObject({
      action: 'PROMOTE',
      toClass: { id: cls.X6 },
      toSection: null,
    }); // X6 has no section B
    expect(rowOf(rows, 's2')).toMatchObject({
      action: 'REPEAT',
      toClass: { id: cls.X5 },
      toSection: { id: sec.X5A },
    });
    expect(rowOf(rows, 's3')).toMatchObject({
      action: 'HOLD',
      toClass: null,
      toSection: null,
      result: { status: 'INCOMPLETE' },
    });

    const x6 = await classRows(cls.X6);
    expect(rowOf(x6, 's5')).toMatchObject({
      action: 'GRADUATE',
      toClass: null,
    });
    expect(rowOf(x6, 's6')).toMatchObject({
      action: 'REPEAT',
      toClass: { id: cls.X6 },
      toSection: { id: sec.X6A },
    });
    const x4 = await classRows(cls.X4);
    expect(rowOf(x4, 's7')).toMatchObject({ action: 'HOLD', result: null }); // nothing published for this class

    const byRoll = await classRows(cls.X5, '?order=ROLL');
    expect(byRoll.map((r) => r.admissionNo)).toEqual([
      adm.s1,
      adm.s8,
      adm.s2,
      adm.s3,
      adm.s4,
    ]);
    expect(
      (await classRows(cls.X5, `?sectionId=${sec.X5B}`)).map(
        (r) => r.admissionNo,
      ),
    ).toEqual([adm.s4]);
    await get(`${base()}/classes/${randomUUID()}`).expect(404);
  });

  it('flags what still needs doing before anything is applied', async ({
    skip,
  }) => {
    if (blocked) skip();
    const { readiness } = (await get(base(), token.reader).expect(200)).body
      .data as {
      readiness: {
        code: string;
        blocking: boolean;
        classId: string | null;
        sectionId: string | null;
      }[];
    };
    const find = (code: string, match: object) =>
      readiness.find(
        (r) =>
          r.code === code &&
          Object.entries(match).every(([k, v]) => r[k as keyof typeof r] === v),
      );
    expect(find('NO_RESULT', { classId: cls.X4 })).toMatchObject({
      blocking: false,
    });
    expect(find('NEEDS_SECTION', { classId: cls.X5 })).toMatchObject({
      blocking: true,
    });
    expect(find('OVER_CAPACITY', { sectionId: sec.X6A })).toMatchObject({
      blocking: true,
    }); // one seat, three incoming
    expect(find('NO_CURRICULUM', { classId: cls.X5 })).toMatchObject({
      blocking: false,
    }); // a repeater returns to X5, which has none next year
    expect(find('NO_CURRICULUM', { classId: cls.X6 })).toBeUndefined(); // X6 has one
    expect(find('NO_CLASS_TEACHER', { sectionId: sec.X6A })).toMatchObject({
      blocking: false,
    });
    expect(readiness.some((r) => r.code === 'EARLY')).toBe(false); // the year really has ended
    expect(readiness.some((r) => r.code === 'STALE_RESULT')).toBe(false);
  });

  it('lets people change an outcome, with a note when it differs from the results', async ({
    skip,
  }) => {
    if (blocked) skip();
    await decide('s2', { action: 'PROMOTE' }).expect(400); // overriding a fail needs a note
    await decide('s2', { action: 'PROMOTE', note: 'short' }).expect(400);
    const promoted = (
      await decide('s2', { action: 'PROMOTE', note: NOTE }).expect(200)
    ).body.data as Row;
    expect(promoted).toMatchObject({
      action: 'PROMOTE',
      basis: 'MANUAL',
      toClass: { id: cls.X6 },
      toSection: { id: sec.X6A },
    });
    const back = (await decide('s2', { action: 'REPEAT' }).expect(200)).body
      .data as Row; // matches the result again: no note needed
    expect(back).toMatchObject({
      action: 'REPEAT',
      toClass: { id: cls.X5 },
      toSection: { id: sec.X5A },
      basis: 'MANUAL',
    });

    await decide('s1', { action: 'GRADUATE', note: NOTE }).expect(400); // only a final class graduates
    await decide('s1', { toClassId: cls.X5 }).expect(400); // promote must change class
    await decide('s1', {
      action: 'REPEAT',
      toClassId: cls.X6,
      note: NOTE,
    }).expect(400);
    await decide('s1', {
      action: 'HOLD',
      toSectionId: sec.X6A,
      note: NOTE,
    }).expect(400);
    await decide('s1', { toClassId: randomUUID() }).expect(400);
    await decide('s1', {}).expect(400); // nothing to change
    await decide('s1', { note: undefined }).expect(400);

    // A different destination class keeps the same outcome, so it needs no note, and the same-named section follows.
    const alt = (await decide('s1', { toClassId: cls.XALT }).expect(200)).body
      .data as Row;
    expect(alt).toMatchObject({
      action: 'PROMOTE',
      toClass: { id: cls.XALT },
      toSection: { id: sec.XALTA },
    });
    const restored = (await decide('s1', { toClassId: cls.X6 }).expect(200))
      .body.data as Row;
    expect(restored).toMatchObject({
      toClass: { id: cls.X6 },
      toSection: { id: sec.X6A },
    });

    await decide('s4', { toSectionId: sec.XALTA }).expect(400); // a section of another class
    const placed = (await decide('s4', { toSectionId: sec.X6A }).expect(200))
      .body.data as Row;
    expect(placed.toSection).toMatchObject({ id: sec.X6A });
    expect((await get(base()).expect(200)).body.data.totals.needsSection).toBe(
      0,
    );
    await patch(`${base()}/decisions/${randomUUID()}`, {
      action: 'HOLD',
      note: NOTE,
    }).expect(404);
    await decide('s3', { action: 'PROMOTE', note: NOTE }).expect(200); // an incomplete result can be decided by hand
    await decide('s3', { action: 'HOLD' }).expect(200);
  });

  it('writes counts, never names or notes, to the audit log', async ({
    skip,
  }) => {
    if (blocked) skip();
    const proposed = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'promotion.proposed', entityId: fromYear },
    });
    expect(proposed.details).toMatchObject({ students: 8, created: 8 });
    const changed = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'promotion.decision_changed' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(JSON.stringify([proposed.details, changed.details])).not.toMatch(
      new RegExp(`${PFX}|Principal decision`),
    );
  });

  it('flags a stale plan after a result is revised, and refreshes it while keeping manual decisions', async ({
    skip,
  }) => {
    if (blocked) skip();
    const adminUser = await prisma.user.findFirstOrThrow({
      where: { email: email('admin') },
    });
    // Version 2 of the X5 result: s3 now passes, and s4 now fails.
    await publishResult('X5', 2, adminUser.id, {
      s3: { status: 'PASS', classRank: 4, sectionRank: 3, percentage: 55 },
      s4: { status: 'FAIL', classRank: 5, sectionRank: 2, percentage: 33 },
    });

    const stale = (await get(base()).expect(200)).body.data;
    expect(
      stale.classes.find((c: { classId: string }) => c.classId === cls.X5),
    ).toMatchObject({ stale: true, resultVersion: 2 });
    expect(stale.totals.stale).toBe(5);
    expect(
      stale.readiness.find((r: { code: string }) => r.code === 'STALE_RESULT'),
    ).toMatchObject({ blocking: true, classId: cls.X5 });
    expect(rowOf(await classRows(cls.X5), 's1').stale).toBe(true);

    // The withdrawn student drops out of the plan.
    await prisma.enrollment.update({
      where: { id: enr.s7 },
      data: { status: 'WITHDRAWN', statusChangedOn: date('2005-09-01') },
    });

    const refreshed = (await propose().expect(200)).body.data;
    // Manual: s1, s2, s4 (kept, pins refreshed). Regenerated from results: s8, s3, s5, s6. Removed: s7.
    expect(refreshed.refresh).toEqual({
      students: 7,
      created: 4,
      manualKept: 3,
      resultChanged: 1,
      removed: 1,
    });
    expect(refreshed.totals.stale).toBe(0);
    expect(
      refreshed.readiness.some(
        (r: { code: string }) => r.code === 'STALE_RESULT',
      ),
    ).toBe(false);

    const rows = await classRows(cls.X5);
    expect(rowOf(rows, 's3')).toMatchObject({
      action: 'PROMOTE',
      basis: 'RESULT',
      toSection: { id: sec.X6A },
      result: { status: 'PASS', version: 2 },
    }); // regenerated
    expect(rowOf(rows, 's4')).toMatchObject({
      action: 'PROMOTE',
      basis: 'MANUAL',
      toSection: { id: sec.X6A },
      result: { status: 'FAIL', version: 2 },
    }); // manual choice kept, result shown honestly
    expect(rowOf(rows, 's2')).toMatchObject({
      action: 'REPEAT',
      basis: 'MANUAL',
    });
    expect((await classRows(cls.X4)).length).toBe(0);

    const again = (await propose().expect(200)).body.data.refresh;
    expect(again).toEqual({
      students: 7,
      created: 4,
      manualKept: 3,
      resultChanged: 0,
      removed: 0,
    }); // repeatable with no changes
  });

  it('refuses to refresh once the plan has been applied', async ({ skip }) => {
    if (blocked) skip();
    await prisma.promotionRun.updateMany({
      where: { fromYearId: fromYear },
      data: { status: 'APPLIED' },
    });
    await propose().expect(409);
    await decide('s1', { toClassId: cls.XALT }).expect(409);
    expect((await get(base()).expect(200)).body.data.run.status).toBe(
      'APPLIED',
    );
  });
});
