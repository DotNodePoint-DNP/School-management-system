import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

class FakeStorage {
  files = new Map<string, Buffer>();
  put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
    return Promise.resolve();
  }
  get(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

const PFX = 'E2E-RC';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const TAIL = String(RUN).slice(-8);
const LABEL = `${PFX}-${RUN}-Chair`;
const SLOT = `OTHER:${LABEL.toLowerCase()}`;
const email = (n: string): string => `e2e-rc-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const today = (): string =>
  new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
const REASON = 'Recounted the answer sheet with the head teacher';

type Doc = {
  ref: string;
  checksum: string;
  enrollmentId: string;
  rollNo: number | null;
  exam: { name: string } | null;
  student: { admissionNo: string };
  section: { id: string };
  run: { scope: string; version: number; revised: boolean };
  result: {
    status: string;
    percentage: number | null;
    classRank: number | null;
  };
  attendance: {
    from: string;
    to: string;
    totalDays: number;
    present: number;
    absent: number;
    late: number;
    leave: number;
    percentage: number | null;
  };
  remark: { text: string } | null;
  subjects: { grade: string | null }[];
};
type Batch = {
  kind: string;
  schemaVersion: number;
  issuedOn: { ad: string; bs: string | null };
  assets: Record<string, string>;
  signatories: { slot: string; mode: string; assetKey: string | null }[];
  classTeachers: Record<
    string,
    { mode: string; assetKey: string | null } | null
  >;
  documents: Doc[];
  skipped: { admissionNo: string | null; reason: string }[];
  warnings: string[];
};

describe('Report cards, remarks and printing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const storage = new FakeStorage();
  const token = {
    controller: '',
    teacher: '',
    other: '',
    office: '',
    plain: '',
  };
  let yearId = '';
  let classId = '';
  let sA = '';
  let sB = '';
  let subjectId = '';
  const exam = { terminal: '', final: '', draft: '' };
  const enr: Record<'A1' | 'A2' | 'A3' | 'B1', string> = {
    A1: '',
    A2: '',
    A3: '',
    B1: '',
  };
  const adm: Record<'A1' | 'A2' | 'A3' | 'B1', string> = {
    A1: '',
    A2: '',
    A3: '',
    B1: '',
  };
  let terminalChecksum = '';
  let finalChecksum = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t: string) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, t: string, body: object = {}) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const put = (url: string, t: string, body: object) =>
    http().put(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, t: string, body: object) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const remarksUrl = (section: string, examId?: string): string =>
    `/academic-years/${yearId}/sections/${section}/remarks${examId ? `?examId=${examId}` : ''}`;
  const print = (t: string, body: object = {}) =>
    post('/print/report-cards', t, {
      academicYearId: yearId,
      classId,
      ...body,
    });
  const batchOf = async (t: string, body: object = {}): Promise<Batch> =>
    (await print(t, body).expect(200)).body.data as Batch;
  const docFor = (b: Batch, key: keyof typeof enr): Doc =>
    b.documents.find((d) => d.enrollmentId === enr[key]) as Doc;

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
    await prisma.reportRemark.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.attendanceRecord.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.mark.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.markSheet.deleteMany({
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
    await prisma.term.deleteMany({
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
    await prisma.signatory.deleteMany({
      where: { roleLabel: { startsWith: PFX } },
    });
    await prisma.staff.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    const users = await prisma.user.findMany({
      where: { email: { startsWith: 'e2e-rc-' } },
      select: { id: true },
    });
    await prisma.storedFile.deleteMany({
      where: { uploadedById: { in: users.map((u) => u.id) } },
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

  async function signatureFile(uploadedById: string): Promise<string> {
    const data = await sharp({
      create: {
        width: 200,
        height: 80,
        channels: 4,
        background: { r: 0, g: 0, b: 90, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const objectKey = `school/signature/${randomUUID()}.png`;
    await storage.put(objectKey, data);
    return (
      await prisma.storedFile.create({
        data: {
          kind: 'SIGNATURE',
          objectKey,
          contentType: 'image/png',
          sizeBytes: data.length,
          width: 200,
          height: 80,
          sha256: 'a'.repeat(64),
          uploadedById,
        },
      })
    ).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-rc-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });

    const controllerUser = await makeUser('controller', [
      ['exams', 'lock'],
      ['exams', 'publish'],
      ['results', 'read-all'],
      ['marks', 'correct'],
      ['marks', 'read-all'],
      ['remarks', 'enter-any'],
      ['reportcards', 'print'],
      ['reportcards', 'print-signed'],
    ]);
    const teacherUser = await makeUser('teacher', [
      ['remarks', 'enter'],
      ['results', 'read'],
      ['reportcards', 'print'],
    ]);
    await makeUser('other', [
      ['remarks', 'enter'],
      ['results', 'read'],
      ['reportcards', 'print'],
    ]);
    await makeUser('office', [
      ['results', 'read-all'],
      ['reportcards', 'print'],
    ]);
    await makeUser('plain', []);

    // A historical year, so nothing here can collide with the real school years.
    yearId = (
      await prisma.academicYear.create({
        data: {
          name: `${PFX}-${RUN}-Y`,
          startDate: date('2005-04-01'),
          endDate: date('2006-03-31'),
        },
      })
    ).id;
    const term = await prisma.term.create({
      data: {
        academicYearId: yearId,
        name: 'First',
        sequence: 1,
        startDate: date('2005-04-01'),
        endDate: date('2005-07-31'),
      },
    });
    classId = (
      await prisma.schoolClass.create({
        data: { name: `${PFX}-${RUN}-C`, sortOrder: 4 },
      })
    ).id;
    sA = (await prisma.section.create({ data: { classId, name: 'A' } })).id;
    sB = (await prisma.section.create({ data: { classId, name: 'B' } })).id;
    subjectId = (
      await prisma.subject.create({
        data: { code: `RC${TAIL}`, name: `${PFX}-${RUN}-Maths` },
      })
    ).id;
    await prisma.classSubject.create({
      data: { academicYearId: yearId, classId, subjectId, isCompulsory: true },
    });

    const makeExam = async (
      key: keyof typeof exam,
      name: string,
      sequence: number,
      extra: object,
    ): Promise<void> => {
      exam[key] = (
        await prisma.exam.create({
          data: {
            academicYearId: yearId,
            name: `${PFX}-${RUN}-${name}`,
            sequence,
            ...extra,
          },
        })
      ).id;
    };
    await makeExam('terminal', 'Terminal', 1, {
      termId: term.id,
      status: 'OPEN',
    });
    await makeExam('final', 'Final', 2, { isFinal: true, status: 'OPEN' });
    await makeExam('draft', 'Draft', 3, { status: 'DRAFT' });
    for (const key of ['terminal', 'final'] as const) {
      await prisma.examSubject.create({
        data: {
          examId: exam[key],
          academicYearId: yearId,
          classId,
          subjectId,
          fullTheory: 100,
          passTheory: 35,
        },
      });
    }

    const placement: [keyof typeof enr, string, number][] = [
      ['A1', sA, 1],
      ['A2', sA, 2],
      ['A3', sA, 3],
      ['B1', sB, 1],
    ];
    for (const [key, section, rollNo] of placement) {
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
            academicYearId: yearId,
            classId,
            sectionId: section,
            rollNo,
          },
        })
      ).id;
    }

    // Submitted marks for both exams. A3 has no marks, so that student's result is incomplete.
    const marks = {
      terminal: { A1: 70, A2: 50, B1: 40 },
      final: { A1: 80, A2: 60, B1: 45 },
    } as const;
    for (const key of ['terminal', 'final'] as const) {
      for (const [section, students] of [
        [sA, ['A1', 'A2']],
        [sB, ['B1']],
      ] as const) {
        const sheet = await prisma.markSheet.create({
          data: {
            examId: exam[key],
            academicYearId: yearId,
            classId,
            sectionId: section,
            subjectId,
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });
        await prisma.mark.createMany({
          data: students.map((s) => ({
            sheetId: sheet.id,
            academicYearId: yearId,
            classId,
            enrollmentId: enr[s],
            theory: marks[key][s as keyof (typeof marks)[typeof key]],
          })),
        });
      }
    }

    // Attendance: A1 has 3 days in the first term and 1 later; B1 has 1.
    const sessionFor = async (section: string, day: string) =>
      (
        await prisma.attendanceSession.create({
          data: {
            academicYearId: yearId,
            sectionId: section,
            date: date(day),
            takenById: controllerUser,
          },
        })
      ).id;
    const record = (
      sessionId: string,
      day: string,
      key: keyof typeof enr,
      status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE',
    ) => ({
      sessionId,
      date: date(day),
      academicYearId: yearId,
      enrollmentId: enr[key],
      status,
    });
    const days: [string, 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE'][] = [
      ['2005-05-02', 'PRESENT'],
      ['2005-05-03', 'LATE'],
      ['2005-05-04', 'ABSENT'],
      ['2005-09-05', 'LEAVE'],
    ];
    for (const [day, status] of days) {
      const id = await sessionFor(sA, day);
      await prisma.attendanceRecord.create({
        data: record(id, day, 'A1', status),
      });
    }
    const bSession = await sessionFor(sB, '2005-05-02');
    await prisma.attendanceRecord.create({
      data: record(bSession, '2005-05-02', 'B1', 'PRESENT'),
    });

    // The class teacher, and signatures: a principal-like holder (unique "other" role) and the class teacher's own.
    const teacherSig = await signatureFile(controllerUser);
    const staff = await prisma.staff.create({
      data: {
        staffNo: `E2E-${RUN}-T`,
        firstName: `${PFX}-ct`,
        lastName: 'Teacher',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: date('2000-01-01'),
        userId: teacherUser,
        signatureFileId: teacherSig,
        signatureMode: 'DIGITAL',
      },
    });
    await prisma.classTeacherAssignment.create({
      data: { academicYearId: yearId, sectionId: sA, staffId: staff.id },
    });
    await prisma.signatory.create({
      data: {
        role: 'OTHER',
        roleLabel: LABEL,
        slot: SLOT,
        fullNameEn: `${PFX} Chair`,
        designationEn: 'Chairperson',
        mode: 'DIGITAL',
        signatureFileId: await signatureFile(controllerUser),
        validFrom: date('2000-01-01'),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-rc-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('limits who can see and write remarks', async () => {
    await get(remarksUrl(sA, exam.terminal), token.plain).expect(403);
    await get(remarksUrl(sA, exam.terminal), token.other).expect(403); // not the class teacher
    await get(remarksUrl(sB, exam.terminal), token.teacher).expect(403); // another section
    const mine = (
      await get(remarksUrl(sA, exam.terminal), token.teacher).expect(200)
    ).body.data;
    expect(mine).toMatchObject({
      scope: 'EXAM',
      editableByMe: true,
      counts: { total: 3, written: 0 },
    });
    expect(mine.students.map((s: { rollNo: number }) => s.rollNo)).toEqual([
      1, 2, 3,
    ]);
    await get(remarksUrl(sB, exam.terminal), token.controller).expect(200); // the exam controller sees every section
    await get(remarksUrl(sA, randomUUID()), token.teacher).expect(404);
  });

  it('saves, validates, clears and cleans remarks without logging their text', async () => {
    const save = (
      t: string,
      entries: object[],
      examId: string | undefined = exam.terminal,
    ) => put(remarksUrl(sA, examId), t, { entries });
    await save(token.teacher, []).expect(400);
    await save(token.teacher, [
      { enrollmentId: enr.A1, remark: 'x'.repeat(501) },
    ]).expect(400);
    await save(token.teacher, [{ enrollmentId: enr.A1 }]).expect(400); // the key must be present
    await save(token.teacher, [
      { enrollmentId: enr.B1, remark: 'Wrong section' },
    ]).expect(400);
    await save(token.teacher, [
      { enrollmentId: enr.A1, remark: 'a' },
      { enrollmentId: enr.A1, remark: 'b' },
    ]).expect(400);
    await save(token.other, [
      { enrollmentId: enr.A1, remark: 'Not mine' },
    ]).expect(403);
    await put(remarksUrl(sA, exam.draft), token.teacher, {
      entries: [{ enrollmentId: enr.A1, remark: 'Too early' }],
    }).expect(409); // the exam is still a draft

    const saved = await save(token.teacher, [
      { enrollmentId: enr.A1, remark: 'Excellent progress.\n\n  Keep it up.' },
      { enrollmentId: enr.A2, remark: 'नियमित अभ्यास आवश्यक छ।' },
    ]).expect(200);
    expect(saved.body.data.counts).toEqual({ total: 3, written: 2 });
    expect(saved.body.data.students[0].remark).toBe(
      'Excellent progress. Keep it up.',
    ); // tidied to one line
    expect(saved.body.data.students[1].remark).toBe('नियमित अभ्यास आवश्यक छ।');

    expect(
      (
        await save(token.teacher, [
          { enrollmentId: enr.A2, remark: null },
        ]).expect(200)
      ).body.data.counts.written,
    ).toBe(1);
    expect(
      (
        await save(token.teacher, [
          { enrollmentId: enr.A2, remark: '   ' },
          { enrollmentId: enr.A3, remark: 'Needs support' },
        ]).expect(200)
      ).body.data.counts.written,
    ).toBe(2);
    await save(token.teacher, [{ enrollmentId: enr.A3, remark: null }]).expect(
      200,
    );

    // The combined (final) card has its own remarks.
    const policy = await put(remarksUrl(sA), token.teacher, {
      entries: [{ enrollmentId: enr.A1, remark: 'Final remark' }],
    }).expect(200);
    expect(policy.body.data).toMatchObject({
      scope: 'POLICY',
      counts: { written: 1 },
    });
    expect(
      (await get(remarksUrl(sA, exam.terminal), token.teacher).expect(200)).body
        .data.students[0].remark,
    ).toBe('Excellent progress. Keep it up.');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'remarks.saved' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(JSON.stringify(audit.details)).not.toMatch(
      /Final remark|Excellent|Needs support/,
    );
    expect(audit.details).toMatchObject({ saved: 1, cleared: 0 });
  });

  it('shows nothing to print until results are published', async () => {
    await print(token.controller, { examId: exam.terminal }).expect(404);
    await get(`/enrollments/${enr.A1}/report-card`, token.controller).expect(
      404,
    );
  });

  it('publishes the first exam, after which only the exam controller can change its remarks', async () => {
    await post(`/exams/${exam.terminal}/lock`, token.controller).expect(200);
    await put(remarksUrl(sA, exam.terminal), token.teacher, {
      entries: [{ enrollmentId: enr.A1, remark: 'Late change' }],
    }).expect(200); // locked, not yet published
    await post(`/exams/${exam.terminal}/publish`, token.controller).expect(200);

    const locked = await put(remarksUrl(sA, exam.terminal), token.teacher, {
      entries: [{ enrollmentId: enr.A1, remark: 'Too late' }],
    }).expect(403);
    expect(locked.body.error.message).toMatch(/published/);
    expect(
      (await get(remarksUrl(sA, exam.terminal), token.teacher).expect(200)).body
        .data.editableByMe,
    ).toBe(false);
    await put(remarksUrl(sA, exam.terminal), token.controller, {
      entries: [
        { enrollmentId: enr.A1, remark: 'Excellent progress (reviewed).' },
      ],
    }).expect(200);
  });

  it("prints a section as a self-contained batch, with attendance for the exam's term", async () => {
    const res = await print(token.teacher, {
      sectionId: sA,
      examId: exam.terminal,
      slots: [SLOT],
    }).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const batch = res.body.data as Batch;

    expect(batch).toMatchObject({
      kind: 'REPORT_CARD',
      schemaVersion: 1,
      issuedOn: { ad: today() },
    });
    expect(batch.issuedOn.bs).toEqual(expect.any(String));
    expect(batch.documents.map((d) => d.student.admissionNo)).toEqual([
      adm.A1,
      adm.A2,
    ]); // roll order
    expect(batch.skipped).toEqual([
      { enrollmentId: enr.A3, admissionNo: adm.A3, reason: 'INCOMPLETE' },
    ]);
    expect(batch.warnings.join(' ')).toMatch(/1 student\(s\) were left out/);

    const a1 = docFor(batch, 'A1');
    expect(a1).toMatchObject({
      rollNo: 1,
      exam: { name: `${PFX}-${RUN}-Terminal` },
      run: { scope: 'EXAM', version: 1, revised: false },
    });
    expect(a1.result).toMatchObject({
      status: 'PASS',
      percentage: 70,
      classRank: 1,
    });
    expect(a1.attendance).toEqual({
      from: '2005-04-01',
      to: '2005-07-31',
      totalDays: 3,
      present: 2,
      absent: 1,
      late: 1,
      leave: 0,
      percentage: 66.7,
    });
    expect(a1.remark?.text).toBe('Excellent progress (reviewed).');
    expect(a1.checksum).toMatch(/^[0-9A-F]{12}$/);
    expect(a1.ref).toBe(`${adm.A1}/EXAM/v1`);
    terminalChecksum = a1.checksum;

    const a2 = docFor(batch, 'A2');
    expect(a2.attendance).toMatchObject({
      totalDays: 0,
      present: 0,
      absent: 0,
      percentage: null,
    }); // nothing recorded
    expect(a2.remark).toBeNull(); // its remark was cleared
  });

  it('gives blank signature lines unless the user may print signed documents', async () => {
    const unsigned = await batchOf(token.teacher, {
      sectionId: sA,
      examId: exam.terminal,
      slots: [SLOT],
    });
    expect(unsigned.signatories).toEqual([
      expect.objectContaining({ slot: SLOT, mode: 'LINE', assetKey: null }),
    ]);
    expect(unsigned.classTeachers[sA]).toMatchObject({
      mode: 'LINE',
      assetKey: null,
    });
    expect(
      Object.keys(unsigned.assets).filter((k) => k.startsWith('sig:')),
    ).toEqual([]);
    expect(unsigned.warnings.join(' ')).toMatch(
      /Digital signatures are only included/,
    );

    const signed = await batchOf(token.controller, {
      sectionId: sA,
      examId: exam.terminal,
      slots: [SLOT],
    });
    expect(signed.signatories[0]).toMatchObject({
      slot: SLOT,
      mode: 'DIGITAL',
      assetKey: `sig:${SLOT}`,
    });
    expect(signed.classTeachers[sA]).toMatchObject({
      mode: 'DIGITAL',
      assetKey: `sig:CLASS_TEACHER:${sA}`,
    });
    expect(signed.assets[`sig:${SLOT}`]).toMatch(/^data:image\/png;base64,/);
    expect(signed.assets[`sig:CLASS_TEACHER:${sA}`]).toMatch(
      /^data:image\/png;base64,/,
    );

    const forced = await batchOf(token.controller, {
      sectionId: sA,
      examId: exam.terminal,
      slots: [SLOT],
      signatures: 'line',
    });
    expect(forced.signatories[0]).toMatchObject({
      mode: 'LINE',
      assetKey: null,
    });
    expect(
      Object.keys(forced.assets).filter((k) => k.startsWith('sig:')),
    ).toEqual([]);
  });

  it('applies the issue-date rules', async () => {
    await print(token.controller, {
      examId: exam.terminal,
      issuedOn: '2000-01-01',
    }).expect(400); // before the results existed
    await print(token.controller, {
      examId: exam.terminal,
      issuedOn: '2999-01-01',
    }).expect(400);
    await print(token.controller, {
      examId: exam.terminal,
      issuedOn: today(),
      issuedOnBs: '2083-01-01',
    }).expect(400);
    await print(token.controller, {
      examId: exam.terminal,
      issuedOn: '2026-02-30',
    }).expect(400);

    const bs = (
      await get(`/dates/convert?ad=${today()}`, token.controller).expect(200)
    ).body.data.bs as string;
    const byBs = await batchOf(token.controller, {
      sectionId: sA,
      examId: exam.terminal,
      issuedOnBs: bs,
    });
    expect(byBs.issuedOn).toEqual({ ad: today(), bs });
  });

  it('keeps class teachers to their own section and lets office roles print a whole class', async () => {
    await print(token.teacher, { sectionId: sB, examId: exam.terminal }).expect(
      403,
    );
    await print(token.teacher, { examId: exam.terminal }).expect(403); // the whole class includes a section they do not teach
    await print(token.other, { sectionId: sA, examId: exam.terminal }).expect(
      403,
    );
    await print(token.plain, { sectionId: sA, examId: exam.terminal }).expect(
      403,
    );

    const whole = await batchOf(token.office, {
      examId: exam.terminal,
      slots: [],
    });
    expect(whole.documents.map((d) => d.student.admissionNo)).toEqual([
      adm.A1,
      adm.A2,
      adm.B1,
    ]); // section, then roll
    expect(whole.classTeachers[sB]).toBeNull();
    expect(whole.warnings.join(' ')).toMatch(/no class teacher/);
    expect(whole.signatories).toEqual([]);

    const ranked = await batchOf(token.office, {
      examId: exam.terminal,
      order: 'RANK',
      slots: [],
    });
    expect(ranked.documents.map((d) => d.result.classRank)).toEqual([1, 2, 3]);

    const chosen = await batchOf(token.office, {
      examId: exam.terminal,
      enrollmentIds: [enr.B1],
      slots: [],
    });
    expect(chosen.documents).toHaveLength(1);
    await print(token.office, {
      examId: exam.terminal,
      enrollmentIds: [enr.B1, randomUUID()],
    }).expect(404);
    await print(token.office, {
      examId: exam.terminal,
      enrollmentIds: Array.from({ length: 201 }, () => randomUUID()),
    }).expect(400);
    await print(token.office, {
      examId: exam.terminal,
      slots: ['KING'],
    }).expect(400);
  });

  it("publishes the final exam, and prints the combined card with the year's attendance and its own remark", async () => {
    await post(`/exams/${exam.final}/lock`, token.controller).expect(200);
    await post(`/exams/${exam.final}/publish`, token.controller).expect(200);
    await put(remarksUrl(sA), token.teacher, {
      entries: [{ enrollmentId: enr.A1, remark: 'Changed after publishing' }],
    }).expect(403);

    const batch = await batchOf(token.controller, { sectionId: sA, slots: [] });
    const a1 = docFor(batch, 'A1');
    expect(a1).toMatchObject({
      exam: null,
      run: { scope: 'POLICY', version: 1, revised: false },
    });
    expect(a1.result).toMatchObject({
      status: 'PASS',
      percentage: 80,
      classRank: 1,
    });
    expect(a1.subjects[0]?.grade).toBe('A');
    expect(a1.attendance).toEqual({
      from: '2005-04-01',
      to: '2006-03-31',
      totalDays: 4,
      present: 2,
      absent: 2,
      late: 1,
      leave: 1,
      percentage: 50,
    });
    expect(a1.remark?.text).toBe('Final remark');
    expect(a1.checksum).not.toBe(terminalChecksum);
    finalChecksum = a1.checksum;
  });

  it("serves one student's card for the screen, with the same data and access rules", async () => {
    const one = (
      await get(`/enrollments/${enr.A1}/report-card`, token.teacher).expect(200)
    ).body.data as Doc;
    expect(one).toMatchObject({
      checksum: finalChecksum,
      run: { scope: 'POLICY' },
    });
    expect(one.attendance.totalDays).toBe(4);
    const terminal = (
      await get(
        `/enrollments/${enr.A1}/report-card?examId=${exam.terminal}`,
        token.teacher,
      ).expect(200)
    ).body.data as Doc;
    expect(terminal.checksum).toBe(terminalChecksum);
    await get(`/enrollments/${enr.B1}/report-card`, token.teacher).expect(403);
    await get(`/enrollments/${enr.B1}/report-card`, token.office).expect(200);
    await get(`/enrollments/${enr.A1}/report-card`, token.plain).expect(403);
    await get(`/enrollments/${enr.A3}/report-card`, token.controller).expect(
      404,
    ); // incomplete result
    await get(
      `/enrollments/${randomUUID()}/report-card`,
      token.controller,
    ).expect(404);
  });

  it('prints a revised card after a correction, and still reproduces the earlier version', async () => {
    await patch(
      `/exams/${exam.final}/sections/${sA}/subjects/${subjectId}/marks/${enr.A1}`,
      token.controller,
      { theory: 90, reason: REASON },
    ).expect(200);

    const latest = docFor(
      await batchOf(token.controller, { sectionId: sA, slots: [] }),
      'A1',
    );
    expect(latest).toMatchObject({
      run: { version: 2, revised: true },
      ref: `${adm.A1}/FINAL/v2`,
    });
    expect(latest.result.percentage).toBe(90);
    expect(latest.checksum).not.toBe(finalChecksum);

    const original = docFor(
      await batchOf(token.controller, { sectionId: sA, slots: [], version: 1 }),
      'A1',
    );
    expect(original).toMatchObject({ run: { version: 1, revised: false } });
    expect(original.result.percentage).toBe(80);
    expect(original.checksum).toBe(finalChecksum); // a reprint of version 1 matches the first printout exactly
    await print(token.controller, { version: 99 }).expect(404);
  });

  it('records who printed what', async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'reportcards.printed', actorName: 'E2E office' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit.details).toMatchObject({ classId, signatures: 'line' });
    expect(typeof (audit.details as { count: number }).count).toBe('number');
  });
});
