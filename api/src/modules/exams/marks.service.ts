import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CursorPaginated } from '../../common/dto/pagination.dto.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CorrectMarkDto,
  MarkChangesQueryDto,
  MarkEntryDto,
  ReasonDto,
  SaveMarksDto,
} from './dto/marks.dto.js';
import { ExamsService } from './exams.service.js';
import { MarksAccessService } from './marks-access.service.js';
import { ResultsService } from './results.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 120_000 } as const;

const ENROLLMENT_SELECT = {
  id: true,
  rollNo: true,
  student: {
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      middleName: true,
      lastName: true,
      fullNameNp: true,
    },
  },
} satisfies Prisma.EnrollmentSelect;
type EnrollmentRow = Prisma.EnrollmentGetPayload<{
  select: typeof ENROLLMENT_SELECT;
}>;

interface Setup {
  fullTheory: number;
  passTheory: number;
  fullPractical: number | null;
  passPractical: number | null;
}
interface Context {
  exam: {
    id: string;
    name: string;
    status: 'DRAFT' | 'OPEN' | 'LOCKED' | 'PUBLISHED';
    academicYearId: string;
  };
  section: { id: string; name: string; classId: string; className: string };
  setup: Setup;
  subject: { id: string; code: string; name: string; isCompulsory: boolean };
}
interface Value {
  theory: number | null;
  practical: number | null;
  absent: boolean;
}

export interface SheetStudent extends Value {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
  /** Absent, or every component of the subject has been entered. */
  complete: boolean;
  /** Currently enrolled in the section (and, for optional subjects, has chosen it). False for a student who moved away but still has marks here. */
  onRoster: boolean;
}

export interface SheetResponse {
  examId: string;
  examName: string;
  examStatus: string;
  academicYearId: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subject: { id: string; code: string; name: string; isCompulsory: boolean };
  setup: Setup;
  sheet: {
    id: string | null;
    status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
    submittedAt: string | null;
    submittedByName: string | null;
  };
  editableByMe: boolean;
  correctableByMe: boolean;
  counts: { total: number; entered: number; complete: number };
  students: SheetStudent[];
}

const cents = (n: number): number => Math.round(n * 100);
const isComplete = (setup: Setup, v: Value): boolean =>
  v.absent ||
  (v.theory !== null && (setup.fullPractical === null || v.practical !== null));

@Injectable()
export class MarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly exams: ExamsService,
    private readonly access: MarksAccessService,
    private readonly results: ResultsService,
  ) {}

  async getSheet(
    examId: string,
    sectionId: string,
    subjectId: string,
    actor: AuthUser,
  ): Promise<SheetResponse> {
    const ctx = await this.context(examId, sectionId, subjectId);
    await this.access.assertCanRead(
      ctx.exam.academicYearId,
      sectionId,
      subjectId,
      actor,
    );
    return this.buildSheet(ctx, actor);
  }

  /** Draft entry. Each entry replaces that student's row. Nothing here is final until the sheet is submitted. */
  async saveMarks(
    examId: string,
    sectionId: string,
    subjectId: string,
    dto: SaveMarksDto,
    actor: AuthUser,
  ): Promise<SheetResponse> {
    const ctx = await this.context(examId, sectionId, subjectId);
    if (
      !(await this.access.canEnter(
        ctx.exam.academicYearId,
        sectionId,
        subjectId,
        actor,
      ))
    ) {
      throw new ForbiddenException(
        'You are not assigned to enter marks for this section and subject',
      );
    }
    const prepared = dto.entries.map((e) => ({
      enrollmentId: e.enrollmentId,
      clear: e.clear === true,
      value: e.clear === true ? null : this.normalize(ctx.setup, e),
    }));

    const summary = await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamShared(tx, examId);
      if (exam.status !== 'OPEN')
        throw new ConflictException(
          `Marks can only be entered while the exam is open (this exam is ${exam.status.toLowerCase()})`,
        );
      const sheet = await this.lockSheet(tx, ctx, true);
      if (sheet.status === 'SUBMITTED') {
        throw new ConflictException(
          'This sheet is already submitted. Ask the exam controller to reopen it, or request a correction.',
        );
      }

      const roster = new Set(
        (await this.roster(tx, ctx, sheet.id))
          .filter((r) => r.onRoster)
          .map((r) => r.enrollmentId),
      );
      const unknown = prepared.filter(
        (p) => !roster.has(p.enrollmentId),
      ).length;
      if (unknown > 0)
        throw new BadRequestException(
          `${unknown} entr${unknown === 1 ? 'y is' : 'ies are'} for students who are not on this sheet`,
        );

      await tx.mark.deleteMany({
        where: {
          sheetId: sheet.id,
          enrollmentId: { in: prepared.map((p) => p.enrollmentId) },
        },
      });
      const rows = prepared.filter((p) => p.value !== null);
      if (rows.length > 0) {
        await tx.mark.createMany({
          data: rows.map((p) => ({
            sheetId: sheet.id,
            academicYearId: ctx.exam.academicYearId,
            classId: ctx.section.classId,
            enrollmentId: p.enrollmentId,
            theory: (p.value as Value).theory,
            practical: (p.value as Value).practical,
            absent: (p.value as Value).absent,
          })),
        });
      }
      return { saved: rows.length, cleared: prepared.length - rows.length };
    }, TX);

    // Marks themselves never go into the audit log, only counts.
    await this.audit.record({
      actor,
      action: 'marks.saved',
      entityType: 'mark_sheet',
      entityId: `${examId}:${sectionId}:${subjectId}`,
      details: summary,
    });
    return this.buildSheet(ctx, actor);
  }

  async submit(
    examId: string,
    sectionId: string,
    subjectId: string,
    actor: AuthUser,
  ): Promise<SheetResponse> {
    const ctx = await this.context(examId, sectionId, subjectId);
    if (
      !(await this.access.canEnter(
        ctx.exam.academicYearId,
        sectionId,
        subjectId,
        actor,
      ))
    ) {
      throw new ForbiddenException(
        'You are not assigned to submit marks for this section and subject',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamShared(tx, examId);
      if (exam.status !== 'OPEN')
        throw new ConflictException(
          `Marks can only be submitted while the exam is open (this exam is ${exam.status.toLowerCase()})`,
        );
      const sheet = await this.lockSheet(tx, ctx, true);
      if (sheet.status === 'SUBMITTED')
        throw new ConflictException('This sheet is already submitted');

      const onRoster = (await this.roster(tx, ctx, sheet.id)).filter(
        (r) => r.onRoster,
      );
      if (onRoster.length === 0)
        throw new BadRequestException('There are no students on this sheet');
      const incomplete = onRoster.filter((r) => !r.complete);
      if (incomplete.length > 0) {
        const names = incomplete
          .slice(0, 5)
          .map((r) => r.name)
          .join(', ');
        throw new BadRequestException(
          `${incomplete.length} student(s) still need marks: ${names}${incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : ''}`,
        );
      }
      await tx.markSheet.update({
        where: { id: sheet.id },
        data: {
          status: 'SUBMITTED',
          submittedById: actor.id,
          submittedAt: new Date(),
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'marks.submitted',
        entityType: 'mark_sheet',
        entityId: sheet.id,
        details: { examId, sectionId, subjectId, students: onRoster.length },
      });
    }, TX);
    return this.buildSheet(ctx, actor);
  }

  /** Back to draft so the teacher can edit. Only while the exam is open; afterwards, use corrections. */
  async reopen(
    examId: string,
    sectionId: string,
    subjectId: string,
    dto: ReasonDto,
    actor: AuthUser,
  ): Promise<SheetResponse> {
    if (!actor.permissions.includes('marks:reopen'))
      throw new ForbiddenException(
        'You do not have permission to reopen a sheet',
      );
    const ctx = await this.context(examId, sectionId, subjectId);

    await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamShared(tx, examId);
      if (exam.status !== 'OPEN') {
        throw new ConflictException(
          `A sheet can only be reopened while the exam is open (this exam is ${exam.status.toLowerCase()}). Use a correction instead.`,
        );
      }
      const sheet = await this.lockSheet(tx, ctx, false);
      if (sheet.status !== 'SUBMITTED')
        throw new ConflictException('Only a submitted sheet can be reopened');
      await tx.markSheet.update({
        where: { id: sheet.id },
        data: { status: 'DRAFT', submittedById: null, submittedAt: null },
      });
      // The reason is an administrative rationale with no student data, so it goes in the audit log.
      await this.audit.recordIn(tx, {
        actor,
        action: 'marks.reopened',
        entityType: 'mark_sheet',
        entityId: sheet.id,
        details: { examId, sectionId, subjectId, reason: dto.reason },
      });
    }, TX);
    return this.buildSheet(ctx, actor);
  }

  /** Changes one student's submitted marks. Needs marks:correct and a reason; always recorded in the append-only history. */
  async correct(
    examId: string,
    sectionId: string,
    subjectId: string,
    enrollmentId: string,
    dto: CorrectMarkDto,
    actor: AuthUser,
  ): Promise<SheetResponse> {
    if (!actor.permissions.includes('marks:correct'))
      throw new ForbiddenException(
        'You do not have permission to correct marks',
      );
    const ctx = await this.context(examId, sectionId, subjectId);
    const value = this.normalize(ctx.setup, dto, enrollmentId);

    await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamShared(tx, examId);
      if (exam.status === 'DRAFT')
        throw new ConflictException(
          'Marks cannot be corrected before the exam is opened',
        );
      const sheet = await this.lockSheet(tx, ctx, false);
      if (sheet.status !== 'SUBMITTED')
        throw new ConflictException(
          'Only submitted marks are corrected; edit a draft sheet directly',
        );

      const enrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          academicYearId: ctx.exam.academicYearId,
          classId: ctx.section.classId,
          OR: [
            { marks: { some: { sheetId: sheet.id } } },
            {
              sectionId: ctx.section.id,
              status: 'ENROLLED',
              ...(ctx.subject.isCompulsory
                ? {}
                : { subjectChoices: { some: { subjectId: ctx.subject.id } } }),
            },
          ],
        },
        select: { id: true },
      });
      if (!enrollment)
        throw new NotFoundException('This student is not on this sheet');

      const before = await tx.mark.findUnique({
        where: { sheetId_enrollmentId: { sheetId: sheet.id, enrollmentId } },
        select: { theory: true, practical: true, absent: true },
      });
      const from: Value | null = before
        ? {
            theory: before.theory?.toNumber() ?? null,
            practical: before.practical?.toNumber() ?? null,
            absent: before.absent,
          }
        : null;
      if (
        from &&
        from.theory === value.theory &&
        from.practical === value.practical &&
        from.absent === value.absent
      ) {
        throw new BadRequestException('Nothing to change');
      }

      await tx.mark.upsert({
        where: { sheetId_enrollmentId: { sheetId: sheet.id, enrollmentId } },
        update: value,
        create: {
          sheetId: sheet.id,
          academicYearId: ctx.exam.academicYearId,
          classId: ctx.section.classId,
          enrollmentId,
          ...value,
        },
      });
      await tx.markChange.create({
        data: {
          sheetId: sheet.id,
          examId,
          subjectId,
          enrollmentId,
          fromTheory: from?.theory,
          fromPractical: from?.practical,
          fromAbsent: from?.absent,
          toTheory: value.theory,
          toPractical: value.practical,
          toAbsent: value.absent,
          reason: dto.reason,
          examStatus: exam.status,
          changedById: actor.id,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'marks.corrected',
        entityType: 'mark_sheet',
        entityId: sheet.id,
        details: {
          examId,
          sectionId,
          subjectId,
          enrollmentId,
          examStatus: exam.status,
        },
      });
      if (exam.status === 'PUBLISHED') {
        await this.results.reviseForCorrection(
          tx,
          examId,
          ctx.section.classId,
          dto.reason,
          actor,
        );
      }
    }, TX);
    return this.buildSheet(ctx, actor);
  }

  /** The correction history, with values. For people who can read all marks or correct them. */
  async changes(q: MarkChangesQueryDto, actor: AuthUser) {
    if (
      !actor.permissions.includes('marks:read-all') &&
      !actor.permissions.includes('marks:correct')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view mark corrections',
      );
    }
    const where: Prisma.MarkChangeWhereInput = {};
    if (q.examId) where.examId = q.examId;
    if (q.subjectId) where.subjectId = q.subjectId;
    if (q.studentId) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { studentId: q.studentId },
        select: { id: true },
      });
      where.enrollmentId = { in: enrollments.map((e) => e.id) };
    }
    if (q.sectionId) {
      const sheets = await this.prisma.markSheet.findMany({
        where: {
          sectionId: q.sectionId,
          ...(q.examId ? { examId: q.examId } : {}),
        },
        select: { id: true },
      });
      where.sheetId = { in: sheets.map((s) => s.id) };
    }

    const rows = await this.prisma.markChange.findMany({
      where,
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    const [users, enrollments, subjects] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(page.map((r) => r.changedById))] } },
        select: { id: true, fullName: true },
      }),
      this.prisma.enrollment.findMany({
        where: { id: { in: [...new Set(page.map((r) => r.enrollmentId))] } },
        select: {
          id: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              middleName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.subject.findMany({
        where: { id: { in: [...new Set(page.map((r) => r.subjectId))] } },
        select: { id: true, code: true },
      }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.fullName] as const));
    const student = new Map(enrollments.map((e) => [e.id, e.student] as const));
    const subjectCode = new Map(subjects.map((s) => [s.id, s.code] as const));

    const items = page.map((r) => {
      const s = student.get(r.enrollmentId);
      return {
        id: r.id,
        changedAt: r.changedAt.toISOString(),
        changedByName: userName.get(r.changedById) ?? null,
        examId: r.examId,
        examStatus: r.examStatus,
        subjectCode: subjectCode.get(r.subjectId) ?? null,
        studentId: s?.id ?? null,
        admissionNo: s?.admissionNo ?? null,
        studentName: s ? displayName(s) : null,
        from:
          r.fromAbsent === null
            ? null
            : {
                theory: r.fromTheory?.toNumber() ?? null,
                practical: r.fromPractical?.toNumber() ?? null,
                absent: r.fromAbsent,
              },
        to: {
          theory: r.toTheory?.toNumber() ?? null,
          practical: r.toPractical?.toNumber() ?? null,
          absent: r.toAbsent,
        },
        reason: r.reason,
      };
    });
    return new CursorPaginated(items, {
      limit: q.limit,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    });
  }

  private normalize(
    setup: Setup,
    e: Pick<MarkEntryDto, 'theory' | 'practical' | 'absent'>,
    label?: string,
  ): Value {
    const fail = (message: string): never => {
      throw new BadRequestException(
        label ? `Student ${label}: ${message}` : message,
      );
    };
    if (e.absent === true) {
      if (e.theory !== undefined || e.practical !== undefined)
        fail('an absent student cannot also have marks');
      return { theory: null, practical: null, absent: true };
    }
    if (e.theory === undefined && e.practical === undefined)
      fail(
        'enter marks, or mark the student absent (use clear to remove an entry)',
      );
    if (e.theory !== undefined && cents(e.theory) > cents(setup.fullTheory))
      fail(`theory marks cannot exceed ${setup.fullTheory}`);
    if (e.practical !== undefined) {
      if (setup.fullPractical === null)
        fail('this subject has no practical component');
      else if (cents(e.practical) > cents(setup.fullPractical))
        fail(`practical marks cannot exceed ${setup.fullPractical}`);
    }
    return {
      theory: e.theory ?? null,
      practical: e.practical ?? null,
      absent: false,
    };
  }

  private async context(
    examId: string,
    sectionId: string,
    subjectId: string,
  ): Promise<Context> {
    const [exam, section] = await Promise.all([
      this.prisma.exam.findUnique({
        where: { id: examId },
        select: { id: true, name: true, status: true, academicYearId: true },
      }),
      this.prisma.section.findUnique({
        where: { id: sectionId },
        select: {
          id: true,
          name: true,
          classId: true,
          schoolClass: { select: { name: true } },
        },
      }),
    ]);
    if (!exam) throw new NotFoundException('Exam not found');
    if (!section) throw new NotFoundException('Section not found');
    const setup = await this.prisma.examSubject.findUnique({
      where: {
        examId_classId_subjectId: {
          examId,
          classId: section.classId,
          subjectId,
        },
      },
      select: {
        fullTheory: true,
        passTheory: true,
        fullPractical: true,
        passPractical: true,
        classSubject: {
          select: {
            isCompulsory: true,
            subject: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!setup)
      throw new NotFoundException(
        'This subject is not part of this exam for this class',
      );
    return {
      exam,
      section: {
        id: section.id,
        name: section.name,
        classId: section.classId,
        className: section.schoolClass.name,
      },
      setup: {
        fullTheory: setup.fullTheory.toNumber(),
        passTheory: setup.passTheory.toNumber(),
        fullPractical: setup.fullPractical?.toNumber() ?? null,
        passPractical: setup.passPractical?.toNumber() ?? null,
      },
      subject: {
        ...setup.classSubject.subject,
        isCompulsory: setup.classSubject.isCompulsory,
      },
    };
  }

  /** Creates the sheet on first use (race-safe), then locks its row. With create=false it must already exist. */
  private async lockSheet(
    tx: Tx,
    ctx: Context,
    create: boolean,
  ): Promise<{ id: string; status: 'DRAFT' | 'SUBMITTED' }> {
    if (create) {
      await tx.$executeRaw`
        INSERT INTO mark_sheets (id, exam_id, academic_year_id, class_id, section_id, subject_id, status, created_at, updated_at)
        VALUES (gen_random_uuid(), ${ctx.exam.id}::uuid, ${ctx.exam.academicYearId}::uuid, ${ctx.section.classId}::uuid,
                ${ctx.section.id}::uuid, ${ctx.subject.id}::uuid, 'DRAFT'::"MarkSheetStatus", now(), now())
        ON CONFLICT (exam_id, section_id, subject_id) DO NOTHING`;
    }
    const rows = await tx.$queryRaw<
      { id: string; status: 'DRAFT' | 'SUBMITTED' }[]
    >`
      SELECT id, status::text AS status FROM mark_sheets
      WHERE exam_id = ${ctx.exam.id}::uuid AND section_id = ${ctx.section.id}::uuid AND subject_id = ${ctx.subject.id}::uuid
      FOR UPDATE`;
    const row = rows[0];
    if (!row)
      throw new NotFoundException(
        'No marks have been entered for this sheet yet',
      );
    return row;
  }

  private async roster(
    db: Pick<Tx, 'enrollment' | 'mark'>,
    ctx: Context,
    sheetId: string | null,
  ): Promise<SheetStudent[]> {
    const [enrolled, marks] = await Promise.all([
      db.enrollment.findMany({
        where: {
          academicYearId: ctx.exam.academicYearId,
          sectionId: ctx.section.id,
          status: 'ENROLLED',
          ...(ctx.subject.isCompulsory
            ? {}
            : { subjectChoices: { some: { subjectId: ctx.subject.id } } }),
        },
        select: ENROLLMENT_SELECT,
      }),
      sheetId
        ? db.mark.findMany({
            where: { sheetId },
            select: {
              theory: true,
              practical: true,
              absent: true,
              enrollment: { select: ENROLLMENT_SELECT },
            },
          })
        : Promise.resolve([]),
    ]);
    const blank = (e: EnrollmentRow, onRoster: boolean): SheetStudent => ({
      enrollmentId: e.id,
      studentId: e.student.id,
      admissionNo: e.student.admissionNo,
      name: displayName(e.student),
      fullNameNp: e.student.fullNameNp,
      rollNo: e.rollNo,
      theory: null,
      practical: null,
      absent: false,
      complete: false,
      onRoster,
    });
    const byId = new Map(enrolled.map((e) => [e.id, blank(e, true)] as const));
    for (const m of marks) {
      const entry = byId.get(m.enrollment.id) ?? blank(m.enrollment, false);
      entry.theory = m.theory?.toNumber() ?? null;
      entry.practical = m.practical?.toNumber() ?? null;
      entry.absent = m.absent;
      byId.set(m.enrollment.id, entry);
    }
    return [...byId.values()]
      .map((s) => ({ ...s, complete: isComplete(ctx.setup, s) }))
      .sort(
        (a, b) =>
          (a.rollNo ?? Number.MAX_SAFE_INTEGER) -
            (b.rollNo ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      );
  }

  private async buildSheet(
    ctx: Context,
    actor: AuthUser,
  ): Promise<SheetResponse> {
    const sheet = await this.prisma.markSheet.findUnique({
      where: {
        examId_sectionId_subjectId: {
          examId: ctx.exam.id,
          sectionId: ctx.section.id,
          subjectId: ctx.subject.id,
        },
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        submittedById: true,
      },
    });
    const exam = await this.prisma.exam.findUniqueOrThrow({
      where: { id: ctx.exam.id },
      select: { status: true },
    });
    const [students, submittedBy, canEnter] = await Promise.all([
      this.roster(this.prisma, ctx, sheet?.id ?? null),
      sheet?.submittedById
        ? this.prisma.user.findUnique({
            where: { id: sheet.submittedById },
            select: { fullName: true },
          })
        : Promise.resolve(null),
      this.access.canEnter(
        ctx.exam.academicYearId,
        ctx.section.id,
        ctx.subject.id,
        actor,
      ),
    ]);
    const status = sheet?.status ?? 'NOT_STARTED';
    const counted = students.filter((s) => s.onRoster);
    return {
      examId: ctx.exam.id,
      examName: ctx.exam.name,
      examStatus: exam.status,
      academicYearId: ctx.exam.academicYearId,
      classId: ctx.section.classId,
      className: ctx.section.className,
      sectionId: ctx.section.id,
      sectionName: ctx.section.name,
      subject: ctx.subject,
      setup: ctx.setup,
      sheet: {
        id: sheet?.id ?? null,
        status,
        submittedAt: sheet?.submittedAt?.toISOString() ?? null,
        submittedByName: submittedBy?.fullName ?? null,
      },
      editableByMe:
        exam.status === 'OPEN' && status !== 'SUBMITTED' && canEnter,
      correctableByMe:
        status === 'SUBMITTED' &&
        exam.status !== 'DRAFT' &&
        actor.permissions.includes('marks:correct'),
      counts: {
        total: counted.length,
        entered: counted.filter(
          (s) => s.absent || s.theory !== null || s.practical !== null,
        ).length,
        complete: counted.filter((s) => s.complete).length,
      },
      students,
    };
  }
}
