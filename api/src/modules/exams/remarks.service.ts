import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { SaveRemarksDto } from './dto/remarks.dto.js';
import { ExamsService } from './exams.service.js';
import { ResultPoliciesService } from './result-policies.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

/** One tidy line: control characters and line breaks become spaces, and runs of spaces collapse. */
export function cleanRemark(value: string | null): string | null {
  if (value === null) return null;
  // eslint-disable-next-line no-control-regex
  const text = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
}

@Injectable()
export class RemarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly exams: ExamsService,
    private readonly policies: ResultPoliciesService,
  ) {}

  async get(
    yearId: string,
    sectionId: string,
    examId: string | undefined,
    actor: AuthUser,
  ) {
    const ctx = await this.resolve(yearId, sectionId, examId);
    const rights = await this.rights(yearId, sectionId, actor);
    if (!rights.canRead)
      throw new ForbiddenException(
        'You do not have access to the remarks of this section',
      );
    return this.view(yearId, sectionId, ctx, rights);
  }

  async save(
    yearId: string,
    sectionId: string,
    examId: string | undefined,
    dto: SaveRemarksDto,
    actor: AuthUser,
  ) {
    const ctx = await this.resolve(yearId, sectionId, examId);
    const rights = await this.rights(yearId, sectionId, actor);
    if (!rights.canWrite)
      throw new ForbiddenException(
        'Only the class teacher of this section, or the exam controller, can write remarks',
      );
    const entries = dto.entries.map((e) => ({
      enrollmentId: e.enrollmentId,
      remark: cleanRemark(e.remark),
    }));

    const summary = await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockYearShared(tx, yearId);
      if (year.status === 'CLOSED')
        throw new ConflictException(
          'This academic year is closed and can no longer be changed',
        );
      // Shared lock on the exam: publishing takes the exclusive one, so "published" cannot slip in mid-save.
      const exam = await this.exams.lockExamShared(tx, ctx.gateExam.id);
      if (exam.status === 'DRAFT')
        throw new ConflictException(
          'Remarks can be written once the exam is open',
        );
      if (exam.status === 'PUBLISHED' && !rights.canWriteAny) {
        throw new ForbiddenException(
          'These results are published. Ask the exam controller to change a remark.',
        );
      }

      const roster = new Set(
        (
          await tx.enrollment.findMany({
            where: {
              academicYearId: yearId,
              sectionId,
              status: { in: ['ENROLLED', 'COMPLETED'] },
            },
            select: { id: true },
          })
        ).map((e) => e.id),
      );
      const unknown = entries.filter((e) => !roster.has(e.enrollmentId)).length;
      if (unknown > 0)
        throw new BadRequestException(
          `${unknown} entr${unknown === 1 ? 'y is' : 'ies are'} for students who are not in this section`,
        );

      const toClear = entries
        .filter((e) => e.remark === null)
        .map((e) => e.enrollmentId);
      const toSave = entries.filter(
        (e): e is { enrollmentId: string; remark: string } => e.remark !== null,
      );
      if (toClear.length > 0)
        await tx.reportRemark.deleteMany({
          where: { scopeKey: ctx.scopeKey, enrollmentId: { in: toClear } },
        });
      for (const e of toSave) {
        await tx.reportRemark.upsert({
          where: {
            enrollmentId_scopeKey: {
              enrollmentId: e.enrollmentId,
              scopeKey: ctx.scopeKey,
            },
          },
          update: { remark: e.remark, updatedById: actor.id },
          create: {
            academicYearId: yearId,
            enrollmentId: e.enrollmentId,
            scopeKey: ctx.scopeKey,
            remark: e.remark,
            updatedById: actor.id,
          },
        });
      }
      return { saved: toSave.length, cleared: toClear.length };
    }, TX);

    // Counts only: remark text never goes into the audit log.
    await this.audit.record({
      actor,
      action: 'remarks.saved',
      entityType: 'section',
      entityId: sectionId,
      details: {
        scope: ctx.scopeKey === 'POLICY' ? 'POLICY' : 'EXAM',
        ...summary,
      },
    });
    return this.view(yearId, sectionId, ctx, rights);
  }

  /** Which scope the remarks belong to, and the exam whose status decides who may write. */
  private async resolve(yearId: string, sectionId: string, examId?: string) {
    const [year, section] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: { id: true, status: true },
      }),
      this.prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true, classId: true },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!section) throw new NotFoundException('Section not found');

    if (examId) {
      const exam = await this.prisma.exam.findFirst({
        where: { id: examId, academicYearId: yearId },
        select: { id: true, name: true },
      });
      if (!exam)
        throw new NotFoundException('Exam not found in this academic year');
      return {
        scope: 'EXAM' as const,
        scopeKey: `EXAM:${examId}`,
        gateExam: exam,
        yearStatus: year.status,
      };
    }
    const policy = await this.policies.getEffective(yearId, section.classId); // 404/409 if the class has no policy and no final exam
    const last = [...policy.components].sort(
      (a, b) => b.sequence - a.sequence,
    )[0];
    if (!last)
      throw new ConflictException(
        'This class has no exams in its result policy',
      );
    return {
      scope: 'POLICY' as const,
      scopeKey: 'POLICY',
      gateExam: { id: last.examId, name: last.examName },
      yearStatus: year.status,
    };
  }

  private async rights(yearId: string, sectionId: string, actor: AuthUser) {
    const has = (p: string): boolean => actor.permissions.includes(p);
    const canWriteAny = has('remarks:enter-any');
    const needsAssignment = has('remarks:enter') || has('results:read');
    const classTeacher = needsAssignment
      ? (await this.prisma.classTeacherAssignment.count({
          where: {
            academicYearId: yearId,
            sectionId,
            staff: { userId: actor.id, status: 'ACTIVE' },
          },
        })) > 0
      : false;
    return {
      canWriteAny,
      canWrite: canWriteAny || (has('remarks:enter') && classTeacher),
      canRead: canWriteAny || has('results:read-all') || classTeacher,
    };
  }

  private async view(
    yearId: string,
    sectionId: string,
    ctx: Awaited<ReturnType<RemarksService['resolve']>>,
    rights: Awaited<ReturnType<RemarksService['rights']>>,
  ) {
    const [exam, enrollments, remarks] = await Promise.all([
      this.prisma.exam.findUniqueOrThrow({
        where: { id: ctx.gateExam.id },
        select: { status: true },
      }),
      this.prisma.enrollment.findMany({
        where: {
          academicYearId: yearId,
          sectionId,
          status: { in: ['ENROLLED', 'COMPLETED'] },
        },
        select: {
          id: true,
          rollNo: true,
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
      this.prisma.reportRemark.findMany({
        where: {
          academicYearId: yearId,
          scopeKey: ctx.scopeKey,
          enrollment: { sectionId },
        },
        select: { enrollmentId: true, remark: true, updatedAt: true },
      }),
    ]);
    const remarkBy = new Map(remarks.map((r) => [r.enrollmentId, r] as const));
    const students = enrollments
      .map((e) => ({
        enrollmentId: e.id,
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        name: displayName(e.student),
        rollNo: e.rollNo,
        remark: remarkBy.get(e.id)?.remark ?? null,
        updatedAt: remarkBy.get(e.id)?.updatedAt.toISOString() ?? null,
      }))
      .sort(
        (a, b) =>
          (a.rollNo ?? Number.MAX_SAFE_INTEGER) -
            (b.rollNo ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      );

    const open =
      ctx.yearStatus !== 'CLOSED' &&
      exam.status !== 'DRAFT' &&
      (exam.status !== 'PUBLISHED' || rights.canWriteAny);
    return {
      academicYearId: yearId,
      sectionId,
      scope: ctx.scope,
      exam: {
        id: ctx.gateExam.id,
        name: ctx.gateExam.name,
        status: exam.status,
      },
      editableByMe: rights.canWrite && open,
      counts: {
        total: students.length,
        written: students.filter((s) => s.remark !== null).length,
      },
      students,
    };
  }
}
