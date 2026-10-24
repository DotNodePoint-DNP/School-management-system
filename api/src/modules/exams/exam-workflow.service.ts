import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { ReasonDto } from './dto/marks.dto.js';
import { ExamsService, type ExamResponse } from './exams.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

// Define a literal key type to prevent string mismatch errors
type SheetKey = `${string}:${string}`;

interface ExpectedSheet {
  classId: string;
  sectionId: string;
  subjectId: string;
  students: number;
}

export interface ProgressItem {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  students: number;
  status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
  entered: number;
  submittedAt: string | null;
  teacher: { id: string; name: string } | null;
}

@Injectable()
export class ExamWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly exams: ExamsService,
  ) {}

  async lock(id: string, actor: AuthUser): Promise<ExamResponse> {
    await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamForWrite(tx, id); // exclusive: waits for marks being entered right now
      if (exam.status !== 'OPEN')
        throw new ConflictException(
          `Only an open exam can be locked (this one is ${exam.status.toLowerCase()})`,
        );
      await this.assertAllSubmitted(tx, id, exam.academicYearId);
      await tx.exam.update({
        where: { id },
        data: { status: 'LOCKED', lockedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'exam.locked',
        entityType: 'exam',
        entityId: id,
      });
    }, TX);
    return this.exams.get(id);
  }

  /** Back to OPEN so sheets can be reopened. Needs a reason. */
  async unlock(
    id: string,
    dto: ReasonDto,
    actor: AuthUser,
  ): Promise<ExamResponse> {
    await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamForWrite(tx, id);
      if (exam.status !== 'LOCKED')
        throw new ConflictException(
          `Only a locked exam can be unlocked (this one is ${exam.status.toLowerCase()})`,
        );
      await tx.exam.update({
        where: { id },
        data: { status: 'OPEN', lockedAt: null },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'exam.unlocked',
        entityType: 'exam',
        entityId: id,
        details: { reason: dto.reason },
      });
    }, TX);
    return this.exams.get(id);
  }

  /** Makes the results visible to parents (once the portal and result snapshots exist in 4C). */
  async publish(id: string, actor: AuthUser): Promise<ExamResponse> {
    await this.prisma.$transaction(async (tx) => {
      const exam = await this.exams.lockExamForWrite(tx, id);
      if (exam.status !== 'LOCKED')
        throw new ConflictException(
          `Only a locked exam can be published (this one is ${exam.status.toLowerCase()})`,
        );
      await this.assertAllSubmitted(tx, id, exam.academicYearId);
      await tx.exam.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'exam.published',
        entityType: 'exam',
        entityId: id,
      });
    }, TX);
    return this.exams.get(id);
  }

  /** Every expected sheet with its status. For exam controllers and principals. */
  async progress(
    id: string,
    actor: AuthUser,
  ): Promise<{
    examId: string;
    submitted: number;
    total: number;
    sheets: ProgressItem[];
  }> {
    if (!actor.permissions.includes('marks:read-all'))
      throw new ForbiddenException(
        'You do not have permission to view exam progress',
      );
    const sheets = await this.buildProgress(this.prisma, id);
    return {
      examId: id,
      submitted: sheets.filter((s) => s.status === 'SUBMITTED').length,
      total: sheets.length,
      sheets,
    };
  }

  /** The sheets the signed-in teacher is assigned to fill for this exam. */
  async mySheets(id: string, actor: AuthUser): Promise<ProgressItem[]> {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      select: { academicYearId: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    const mine = await this.prisma.teachingAssignment.findMany({
      where: {
        academicYearId: exam.academicYearId,
        staff: { userId: actor.id, status: 'ACTIVE' },
      },
      select: { sectionId: true, subjectId: true },
    });
    // Explicitly type Set with SheetKey (`${string}:${string}`)
    const keys = new Set<SheetKey>(
      mine.map((m) => `${m.sectionId}:${m.subjectId}` as SheetKey), // Cast to satisfy literal template type
    );
    return (await this.buildProgress(this.prisma, id)).filter(
      (s) => keys.has(`${s.sectionId}:${s.subjectId}` as SheetKey), // Cast string to `${string}:${string}`
    );
  }

  /** Which (section, subject) sheets should exist: one per section with students taking the subject. */
  private async expectedSheets(
    db: Pick<Tx, 'examSubject' | 'enrollment'>,
    examId: string,
    yearId: string,
  ): Promise<ExpectedSheet[]> {
    const setup = await db.examSubject.findMany({
      where: { examId },
      select: {
        classId: true,
        subjectId: true,
        classSubject: { select: { isCompulsory: true } },
      },
    });
    if (setup.length === 0) return [];
    const enrolled = await db.enrollment.findMany({
      where: {
        academicYearId: yearId,
        status: 'ENROLLED',
        classId: { in: [...new Set(setup.map((s) => s.classId))] },
      },
      select: {
        classId: true,
        sectionId: true,
        subjectChoices: { select: { subjectId: true } },
      },
    });
    const byClass = new Map<string, typeof enrolled>();
    for (const e of enrolled)
      byClass.set(e.classId, [...(byClass.get(e.classId) ?? []), e]);

    const expected = new Map<string, ExpectedSheet>();
    for (const s of setup) {
      for (const e of byClass.get(s.classId) ?? []) {
        if (
          !s.classSubject.isCompulsory &&
          !e.subjectChoices.some((c) => c.subjectId === s.subjectId)
        )
          continue;
        const key = `${e.sectionId}:${s.subjectId}`;
        const found = expected.get(key);
        if (found) found.students += 1;
        else
          expected.set(key, {
            classId: s.classId,
            sectionId: e.sectionId,
            subjectId: s.subjectId,
            students: 1,
          });
      }
    }
    return [...expected.values()];
  }

  private async buildProgress(
    db: Tx | PrismaService,
    examId: string,
  ): Promise<ProgressItem[]> {
    const exam = await db.exam.findUnique({
      where: { id: examId },
      select: { academicYearId: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    const expected = await this.expectedSheets(db, examId, exam.academicYearId);
    if (expected.length === 0) return [];

    const [sheets, entered, sections, subjects, teachers] = await Promise.all([
      db.markSheet.findMany({
        where: { examId },
        select: {
          id: true,
          sectionId: true,
          subjectId: true,
          status: true,
          submittedAt: true,
        },
      }),
      db.mark.groupBy({
        by: ['sheetId'],
        where: { sheet: { examId } },
        _count: { _all: true },
      }),
      db.section.findMany({
        where: { id: { in: [...new Set(expected.map((e) => e.sectionId))] } },
        select: {
          id: true,
          name: true,
          schoolClass: { select: { id: true, name: true, sortOrder: true } },
        },
      }),
      db.subject.findMany({
        where: { id: { in: [...new Set(expected.map((e) => e.subjectId))] } },
        select: { id: true, code: true, name: true },
      }),
      db.teachingAssignment.findMany({
        where: {
          academicYearId: exam.academicYearId,
          sectionId: { in: [...new Set(expected.map((e) => e.sectionId))] },
        },
        select: {
          sectionId: true,
          subjectId: true,
          staff: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    // Explicitly type Maps with key type SheetKey (`${string}:${string}`)
    const sheetBy = new Map<SheetKey, (typeof sheets)[number]>(
      sheets.map((s) => [`${s.sectionId}:${s.subjectId}` as SheetKey, s]),
    );
    const enteredBy = new Map(
      entered.map((e) => [e.sheetId, e._count._all] as const),
    );
    const sectionBy = new Map(sections.map((s) => [s.id, s] as const));
    const subjectBy = new Map(subjects.map((s) => [s.id, s] as const));
    const teacherBy = new Map<SheetKey, (typeof teachers)[number]['staff']>(
      teachers.map((t) => [
        `${t.sectionId}:${t.subjectId}` as SheetKey,
        t.staff,
      ]),
    );

    return expected
      .map((e) => {
        const key: SheetKey = `${e.sectionId}:${e.subjectId}`; // Typed key
        const sheet = sheetBy.get(key);
        const section = sectionBy.get(e.sectionId);
        const subject = subjectBy.get(e.subjectId);
        const teacher = teacherBy.get(key);
        return {
          sort: [
            section?.schoolClass.sortOrder ?? 0,
            section?.schoolClass.name ?? '',
            section?.name ?? '',
            subject?.code ?? '',
          ] as const,
          item: {
            classId: e.classId,
            className: section?.schoolClass.name ?? '',
            sectionId: e.sectionId,
            sectionName: section?.name ?? '',
            subjectId: e.subjectId,
            subjectCode: subject?.code ?? '',
            subjectName: subject?.name ?? '',
            students: e.students,
            status: sheet?.status ?? ('NOT_STARTED' as const),
            entered: sheet ? (enteredBy.get(sheet.id) ?? 0) : 0,
            submittedAt: sheet?.submittedAt?.toISOString() ?? null,
            teacher: teacher
              ? { id: teacher.id, name: displayName(teacher) }
              : null,
          } satisfies ProgressItem,
        };
      })
      .sort(
        (a, b) =>
          a.sort[0] - b.sort[0] ||
          a.sort[1].localeCompare(b.sort[1]) ||
          a.sort[2].localeCompare(b.sort[2]) ||
          a.sort[3].localeCompare(b.sort[3]),
      )
      .map((x) => x.item);
  }

  private async assertAllSubmitted(
    tx: Tx,
    examId: string,
    yearId: string,
  ): Promise<void> {
    const progress = await this.buildProgress(tx, examId);
    if (progress.length === 0)
      throw new ConflictException(
        'No enrolled student is expected to sit this exam',
      );
    const open = progress.filter((p) => p.status !== 'SUBMITTED');
    if (open.length > 0) {
      const list = open
        .slice(0, 8)
        .map(
          (p) =>
            `${p.className} ${p.sectionName} ${p.subjectCode} (${p.status === 'DRAFT' ? 'draft' : 'not started'})`,
        )
        .join(', ');
      throw new ConflictException(
        `${open.length} sheet(s) are not submitted yet: ${list}${open.length > 8 ? ' and more' : ''}`,
      );
    }
    void yearId;
  }
}
