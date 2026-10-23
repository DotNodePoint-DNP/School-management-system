import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_PASS_PERCENT } from '../../common/constants/exams.js';
import {
  dateParts,
  isoToDate,
  resolveDate,
} from '../../common/utils/bs-date.js';
import { percentOf } from '../../common/utils/marks.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClassesService } from '../classes/classes.service.js';
import type {
  CopyExamSetupDto,
  CreateExamDto,
  ExamSubjectInputDto,
  SetExamSubjectsDto,
  UpdateExamDto,
} from './dto/exam.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;
type ExamStatusValue = 'DRAFT' | 'OPEN' | 'LOCKED' | 'PUBLISHED';

const EXAM_SELECT = {
  id: true,
  academicYearId: true,
  name: true,
  sequence: true,
  isFinal: true,
  status: true,
  term: { select: { id: true, name: true } },
  _count: { select: { subjects: true } },
} satisfies Prisma.ExamSelect;
type ExamRow = Prisma.ExamGetPayload<{ select: typeof EXAM_SELECT }>;

export interface ExamResponse {
  id: string;
  academicYearId: string;
  name: string;
  sequence: number;
  isFinal: boolean;
  status: ExamStatusValue;
  term: { id: string; name: string } | null;
  subjectSetupCount: number;
}

const toExam = (e: ExamRow): ExamResponse => ({
  id: e.id,
  academicYearId: e.academicYearId,
  name: e.name,
  sequence: e.sequence,
  isFinal: e.isFinal,
  status: e.status,
  term: e.term,
  subjectSetupCount: e._count.subjects,
});

export interface ExamLock {
  id: string;
  academicYearId: string;
  status: ExamStatusValue;
}

interface NormalizedSubject {
  subjectId: string;
  fullTheory: number;
  passTheory: number;
  fullPractical: number | null;
  passPractical: number | null;
  examDate: string | null;
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly classes: ClassesService,
  ) {}

  async list(yearId: string): Promise<ExamResponse[]> {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: yearId },
      select: { id: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    const rows = await this.prisma.exam.findMany({
      where: { academicYearId: yearId },
      orderBy: { sequence: 'asc' },
      select: EXAM_SELECT,
    });
    return rows.map(toExam);
  }

  async get(id: string): Promise<ExamResponse> {
    const row = await this.prisma.exam.findUnique({
      where: { id },
      select: EXAM_SELECT,
    });
    if (!row) throw new NotFoundException('Exam not found');
    return toExam(row);
  }

  async create(
    yearId: string,
    dto: CreateExamDto,
    actor: AuthUser,
  ): Promise<ExamResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockYearShared(tx, yearId);
      if (year.status === 'CLOSED')
        throw new ConflictException(
          'This academic year is closed and can no longer be changed',
        );
      if (dto.termId) await this.assertTermInYear(tx, dto.termId, yearId);
      if (dto.isFinal) await this.assertNoOtherFinal(tx, yearId);
      return tx.exam.create({
        data: {
          academicYearId: yearId,
          name: dto.name,
          sequence: dto.sequence,
          termId: dto.termId,
          isFinal: dto.isFinal === true,
        },
        select: EXAM_SELECT,
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'exam.created',
      entityType: 'exam',
      entityId: row.id,
      details: { academicYearId: yearId, name: row.name, isFinal: row.isFinal },
    });
    return toExam(row);
  }

  async update(
    id: string,
    dto: UpdateExamDto,
    actor: AuthUser,
  ): Promise<ExamResponse> {
    const { row, changed } = await this.prisma.$transaction(async (tx) => {
      const exam = await this.lockExamForWrite(tx, id);
      if (exam.status !== 'DRAFT')
        throw new ConflictException('Only a draft exam can be edited');
      if (dto.termId)
        await this.assertTermInYear(tx, dto.termId, exam.academicYearId);
      if (dto.isFinal === true)
        await this.assertNoOtherFinal(tx, exam.academicYearId, id);

      const data: Prisma.ExamUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.sequence !== undefined) data.sequence = dto.sequence;
      if (dto.termId !== undefined) data.termId = dto.termId;
      if (dto.isFinal !== undefined) data.isFinal = dto.isFinal;
      const updated = await tx.exam.update({
        where: { id },
        data,
        select: EXAM_SELECT,
      });
      return { row: updated, changed: Object.keys(data) };
    }, TX);
    await this.audit.record({
      actor,
      action: 'exam.updated',
      entityType: 'exam',
      entityId: id,
      details: { changedFields: changed },
    });
    return toExam(row);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const name = await this.prisma.$transaction(async (tx) => {
      const exam = await this.lockExamForWrite(tx, id);
      if (exam.status !== 'DRAFT')
        throw new ConflictException('Only a draft exam can be deleted');
      const [subjects, components] = await Promise.all([
        tx.examSubject.count({ where: { examId: id } }),
        tx.resultComponent.count({ where: { examId: id } }),
      ]);
      if (subjects + components > 0) {
        throw new ConflictException(
          'This exam still has subject setup or is part of a result policy. Remove those first.',
        );
      }
      const row = await tx.exam.findUniqueOrThrow({
        where: { id },
        select: { name: true },
      });
      await tx.exam.delete({ where: { id } });
      return row.name;
    }, TX);
    await this.audit.record({
      actor,
      action: 'exam.deleted',
      entityType: 'exam',
      entityId: id,
      details: { name },
    });
  }

  async getClassSetup(examId: string, classId: string) {
    const [exam, cls] = await Promise.all([
      this.prisma.exam.findUnique({
        where: { id: examId },
        select: { id: true },
      }),
      this.prisma.schoolClass.findUnique({
        where: { id: classId },
        select: { id: true },
      }),
    ]);
    if (!exam) throw new NotFoundException('Exam not found');
    if (!cls) throw new NotFoundException('Class not found');

    const rows = await this.prisma.examSubject.findMany({
      where: { examId, classId },
      orderBy: { classSubject: { subject: { code: 'asc' } } },
      select: {
        fullTheory: true,
        passTheory: true,
        fullPractical: true,
        passPractical: true,
        examDate: true,
        classSubject: {
          select: {
            isCompulsory: true,
            creditHours: true,
            subject: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    return {
      examId,
      classId,
      subjects: rows.map((r) => {
        const date = r.examDate ? dateParts(r.examDate) : null;
        const fullTheory = r.fullTheory.toNumber();
        const fullPractical = r.fullPractical?.toNumber() ?? null;
        return {
          subjectId: r.classSubject.subject.id,
          code: r.classSubject.subject.code,
          name: r.classSubject.subject.name,
          isCompulsory: r.classSubject.isCompulsory,
          creditHours: r.classSubject.creditHours?.toNumber() ?? null,
          fullTheory,
          passTheory: r.passTheory.toNumber(),
          fullPractical,
          passPractical: r.passPractical?.toNumber() ?? null,
          totalFull: fullTheory + (fullPractical ?? 0),
          examDate: date?.ad ?? null,
          examDateBs: date?.bs ?? null,
        };
      }),
    };
  }

  async setClassSetup(
    examId: string,
    classId: string,
    dto: SetExamSubjectsDto,
    actor: AuthUser,
  ) {
    const rows = dto.subjects.map((s) => this.normalize(s));
    await this.prisma.$transaction(async (tx) => {
      const exam = await this.lockExamForWrite(tx, examId);
      if (exam.status !== 'DRAFT')
        throw new ConflictException(
          'Subject setup can only be changed while the exam is a draft',
        );
      await this.classes.lockActiveClassForUse(tx, classId);

      const ids = rows.map((r) => r.subjectId);
      if (ids.length > 0) {
        const mapped = await tx.classSubject.findMany({
          where: {
            academicYearId: exam.academicYearId,
            classId,
            subjectId: { in: ids },
          },
          select: { subjectId: true },
        });
        if (mapped.length !== ids.length) {
          throw new BadRequestException(
            "One or more subjects are not in this class's curriculum for this academic year",
          );
        }
      }
      await tx.examSubject.deleteMany({
        where: { examId, classId, subjectId: { notIn: ids } },
      });
      for (const r of rows) {
        const data = {
          fullTheory: r.fullTheory,
          passTheory: r.passTheory,
          fullPractical: r.fullPractical,
          passPractical: r.passPractical,
          examDate: r.examDate ? isoToDate(r.examDate) : null,
        };
        await tx.examSubject.upsert({
          where: {
            examId_classId_subjectId: {
              examId,
              classId,
              subjectId: r.subjectId,
            },
          },
          update: data,
          create: {
            examId,
            academicYearId: exam.academicYearId,
            classId,
            subjectId: r.subjectId,
            ...data,
          },
        });
      }
    }, TX);
    await this.audit.record({
      actor,
      action: 'exam.setup_updated',
      entityType: 'exam',
      entityId: examId,
      details: { classId, subjectCount: rows.length },
    });
    return this.getClassSetup(examId, classId);
  }

  /** Copies the per-class subject setup from another exam (this year or an earlier one), skipping what no longer fits. */
  async copySetup(
    examId: string,
    sourceExamId: string,
    dto: CopyExamSetupDto,
    actor: AuthUser,
  ) {
    if (examId === sourceExamId)
      throw new BadRequestException(
        'Source and destination must be different exams',
      );
    const result = await this.prisma.$transaction(async (tx) => {
      const exam = await this.lockExamForWrite(tx, examId);
      if (exam.status !== 'DRAFT')
        throw new ConflictException(
          'Subject setup can only be changed while the exam is a draft',
        );
      const source = await tx.exam.findUnique({
        where: { id: sourceExamId },
        select: { id: true },
      });
      if (!source) throw new NotFoundException('Source exam not found');

      const rows = await tx.examSubject.findMany({
        where: {
          examId: sourceExamId,
          ...(dto.classIds && dto.classIds.length > 0
            ? { classId: { in: dto.classIds } }
            : {}),
        },
      });
      if (rows.length === 0)
        return { copied: 0, alreadyPresent: 0, skipped: 0 };

      const mapped = await tx.classSubject.findMany({
        where: {
          academicYearId: exam.academicYearId,
          OR: rows.map((r) => ({ classId: r.classId, subjectId: r.subjectId })),
        },
        select: {
          classId: true,
          subjectId: true,
          schoolClass: { select: { isActive: true } },
        },
      });
      const usable = new Set(
        mapped
          .filter((m) => m.schoolClass.isActive)
          .map((m) => `${m.classId}:${m.subjectId}`),
      );
      const fit = rows.filter((r) => usable.has(`${r.classId}:${r.subjectId}`));
      const created =
        fit.length === 0
          ? { count: 0 }
          : await tx.examSubject.createMany({
              data: fit.map((r) => ({
                examId,
                academicYearId: exam.academicYearId,
                classId: r.classId,
                subjectId: r.subjectId,
                fullTheory: r.fullTheory,
                passTheory: r.passTheory,
                fullPractical: r.fullPractical,
                passPractical: r.passPractical,
              })),
              skipDuplicates: true,
            });
      return {
        copied: created.count,
        alreadyPresent: fit.length - created.count,
        skipped: rows.length - fit.length,
      };
    }, TX);
    await this.audit.record({
      actor,
      action: 'exam.setup_copied',
      entityType: 'exam',
      entityId: examId,
      details: { sourceExamId, ...result },
    });
    return result;
  }

  async open(id: string, actor: AuthUser): Promise<ExamResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      const exam = await this.lockExamForWrite(tx, id);
      if (exam.status !== 'DRAFT')
        throw new ConflictException(
          `Only a draft exam can be opened (this one is ${exam.status.toLowerCase()})`,
        );
      const year = await tx.academicYear.findUniqueOrThrow({
        where: { id: exam.academicYearId },
        select: { status: true },
      });
      if (year.status !== 'ACTIVE')
        throw new ConflictException(
          'Exams can only be opened in the active academic year',
        );
      const setup = await tx.examSubject.count({ where: { examId: id } });
      if (setup === 0)
        throw new ConflictException(
          'Set up at least one class and subject before opening this exam',
        );

      const updated = await tx.exam.update({
        where: { id },
        data: { status: 'OPEN' },
        select: EXAM_SELECT,
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'exam.opened',
        entityType: 'exam',
        entityId: id,
        details: { subjectSetupCount: setup },
      });
      return updated;
    }, TX);
    return toExam(row);
  }

  /**
   * Lock order: academic year (shared), then the exam row. Every exam write goes through here.
   * Rejects closed years. The returned status is read after the lock.
   */
  async lockExamForWrite(tx: Tx, examId: string): Promise<ExamLock> {
    const found = await tx.exam.findUnique({
      where: { id: examId },
      select: { academicYearId: true },
    });
    if (!found) throw new NotFoundException('Exam not found');
    const year = await this.years.lockYearShared(tx, found.academicYearId);
    if (year.status === 'CLOSED')
      throw new ConflictException(
        'This academic year is closed and can no longer be changed',
      );
    const rows = await tx.$queryRaw<
      { status: ExamStatusValue }[]
    >`SELECT status::text AS status FROM exams WHERE id = ${examId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Exam not found');
    return {
      id: examId,
      academicYearId: found.academicYearId,
      status: row.status,
    };
  }

  private async assertTermInYear(
    tx: Tx,
    termId: string,
    yearId: string,
  ): Promise<void> {
    const term = await tx.term.findFirst({
      where: { id: termId, academicYearId: yearId },
      select: { id: true },
    });
    if (!term)
      throw new BadRequestException(
        'That term does not belong to this academic year',
      );
  }

  private async assertNoOtherFinal(
    tx: Tx,
    yearId: string,
    excludeId?: string,
  ): Promise<void> {
    const other = await tx.exam.findFirst({
      where: {
        academicYearId: yearId,
        isFinal: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { name: true },
    });
    if (other)
      throw new ConflictException(
        `"${other.name}" is already the final exam of this academic year`,
      );
  }

  private normalize(s: ExamSubjectInputDto): NormalizedSubject {
    const fail = (message: string): never => {
      throw new BadRequestException(`Subject ${s.subjectId}: ${message}`);
    };
    const passTheory =
      s.passTheory ?? percentOf(s.fullTheory, DEFAULT_PASS_PERCENT.theory);
    if (passTheory > s.fullTheory)
      fail('the theory pass marks cannot exceed the full marks');

    let fullPractical: number | null = null;
    let passPractical: number | null = null;
    if (s.fullPractical === undefined) {
      if (s.passPractical !== undefined)
        fail('practical pass marks need practical full marks');
    } else {
      fullPractical = s.fullPractical;
      passPractical =
        s.passPractical ??
        percentOf(fullPractical, DEFAULT_PASS_PERCENT.practical);
      if (passPractical > fullPractical)
        fail('the practical pass marks cannot exceed the full marks');
    }
    const examDate = resolveDate('examDate', s.examDate, s.examDateBs) ?? null;
    return {
      subjectId: s.subjectId,
      fullTheory: s.fullTheory,
      passTheory,
      fullPractical,
      passPractical,
      examDate,
    };
  }
}
