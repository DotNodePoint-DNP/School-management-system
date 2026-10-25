import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClassesService } from '../classes/classes.service.js';
import type { CopyCurriculumDto } from './dto/copy-curriculum.dto.js';
import type { ReplaceClassSubjectsDto } from './dto/replace-class-subjects.dto.js';
import { SubjectsService } from './subjects.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

export interface CurriculumResponse {
  academicYearId: string;
  classId: string;
  subjects: {
    subjectId: string;
    code: string;
    name: string;
    isActive: boolean;
    isCompulsory: boolean;
    creditHours: number | null;
  }[];
}

export interface CopyResult {
  copied: number;
  alreadyPresent: number;
  skippedInactive: number;
}

@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly classes: ClassesService,
    private readonly subjects: SubjectsService,
  ) {}

  /** Reading is allowed for any year, including closed ones. */
  async list(yearId: string, classId: string): Promise<CurriculumResponse> {
    const [year, cls] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: { id: true },
      }),
      this.prisma.schoolClass.findUnique({
        where: { id: classId },
        select: { id: true },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!cls) throw new NotFoundException('Class not found');

    const rows = await this.prisma.classSubject.findMany({
      where: { academicYearId: yearId, classId },
      orderBy: { subject: { code: 'asc' } },
      select: {
        isCompulsory: true,
        creditHours: true,
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });
    return {
      academicYearId: yearId,
      classId,
      subjects: rows.map((r) => ({
        subjectId: r.subject.id,
        code: r.subject.code,
        name: r.subject.name,
        isActive: r.subject.isActive,
        isCompulsory: r.isCompulsory,
        creditHours: r.creditHours?.toNumber() ?? null,
      })),
    };
  }

  async replace(
    yearId: string,
    classId: string,
    dto: ReplaceClassSubjectsDto,
    actor: AuthUser,
  ): Promise<CurriculumResponse> {
    const wanted = new Map(
      dto.subjects.map((s) => [s.subjectId, s.isCompulsory ?? true] as const),
    );
    if (wanted.size !== dto.subjects.length)
      throw new BadRequestException('A subject appears more than once');

    const summary = await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId); // rejects closed years
      await this.classes.lockActiveClassForUse(tx, classId); // rejects inactive classes
      const locked = await this.subjects.lockSubjectsShared(tx, [
        ...wanted.keys(),
      ]);
      if (locked.length !== wanted.size)
        throw new BadRequestException('One or more subjects do not exist');

      const existing = await tx.classSubject.findMany({
        where: { academicYearId: yearId, classId },
        select: { subjectId: true, isCompulsory: true },
      });
      const current = new Map(
        existing.map((e) => [e.subjectId, e.isCompulsory] as const),
      );

      // Inactive subjects can't be newly added, but one that is already mapped may stay.
      const inactive = locked.filter((s) => !s.isActive && !current.has(s.id));
      if (inactive.length > 0) {
        throw new ConflictException(
          `Inactive subjects cannot be added: ${inactive.map((s) => s.code).join(', ')}`,
        );
      }

      const toDelete = [...current.keys()].filter((id) => !wanted.has(id));
      const toCreate = [...wanted].filter(([id]) => !current.has(id));
      const toUpdate = [...wanted].filter(
        ([id, compulsory]) => current.has(id) && current.get(id) !== compulsory,
      );

      // Students' optional-subject choices must not be orphaned or invalidated.
      const becomingCompulsory = toUpdate
        .filter(([, compulsory]) => compulsory)
        .map(([id]) => id);
      const guarded = [...toDelete, ...becomingCompulsory];
      if (guarded.length > 0) {
        const chosen = await tx.studentSubjectChoice.count({
          where: {
            academicYearId: yearId,
            classId,
            subjectId: { in: guarded },
          },
        });
        if (chosen > 0) {
          throw new ConflictException(
            `${chosen} student choice(s) depend on subjects being removed or made compulsory. Clear those choices first.`,
          );
        }
      }

      if (toDelete.length > 0) {
        const assigned = await tx.teachingAssignment.count({
          where: {
            academicYearId: yearId,
            classId,
            subjectId: { in: toDelete },
          },
        });
        if (assigned > 0) {
          throw new ConflictException(
            `${assigned} teacher assignment(s) use the subjects being removed. Remove those assignments first.`,
          );
        }
        const inExams = await tx.examSubject.count({
          where: {
            academicYearId: yearId,
            classId,
            subjectId: { in: toDelete },
          },
        });
        if (inExams > 0) {
          throw new ConflictException(
            `${inExams} exam setup(s) use the subjects being removed. Remove them from the exams first.`,
          );
        }
        await tx.classSubject.deleteMany({
          where: {
            academicYearId: yearId,
            classId,
            subjectId: { in: toDelete },
          },
        });
      }

      if (toCreate.length > 0) {
        await tx.classSubject.createMany({
          data: toCreate.map(([subjectId, isCompulsory]) => ({
            academicYearId: yearId,
            classId,
            subjectId,
            isCompulsory,
          })),
        });
      }
      for (const [subjectId, isCompulsory] of toUpdate) {
        await tx.classSubject.update({
          where: {
            academicYearId_classId_subjectId: {
              academicYearId: yearId,
              classId,
              subjectId,
            },
          },
          data: { isCompulsory },
        });
      }
      return {
        added: toCreate.length,
        removed: toDelete.length,
        changed: toUpdate.length,
      };
    }, TX);

    await this.audit.record({
      actor,
      action: 'curriculum.updated',
      entityType: 'curriculum',
      entityId: `${yearId}:${classId}`,
      details: { ...summary, subjectCount: wanted.size },
    });
    return this.list(yearId, classId);
  }

  /**
   * Copies mappings from any year (open or closed) into an editable one.
   * Limitation: inactive flags are read in the same transaction but each class/subject isn't row-locked,
   * so a deactivation committed during the copy could slip through. It is visible and harmless.
   */
  async copy(
    destYearId: string,
    sourceYearId: string,
    dto: CopyCurriculumDto,
    actor: AuthUser,
  ): Promise<CopyResult> {
    if (destYearId === sourceYearId)
      throw new BadRequestException(
        'Source and destination must be different years',
      );

    const result = await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, destYearId);
      const source = await tx.academicYear.findUnique({
        where: { id: sourceYearId },
        select: { id: true },
      });
      if (!source)
        throw new NotFoundException('Source academic year not found');

      const rows = await tx.classSubject.findMany({
        where: {
          academicYearId: sourceYearId,
          ...(dto.classIds && dto.classIds.length > 0
            ? { classId: { in: dto.classIds } }
            : {}),
        },
        select: {
          classId: true,
          subjectId: true,
          isCompulsory: true,
          creditHours: true,
          schoolClass: { select: { isActive: true } },
          subject: { select: { isActive: true } },
        },
      });
      const usable = rows.filter(
        (r) => r.schoolClass.isActive && r.subject.isActive,
      );

      const created =
        usable.length > 0
          ? await tx.classSubject.createMany({
              data: usable.map((r) => ({
                academicYearId: destYearId,
                classId: r.classId,
                subjectId: r.subjectId,
                isCompulsory: r.isCompulsory,
                creditHours: r.creditHours,
              })),
              skipDuplicates: true,
            })
          : { count: 0 };
      return {
        copied: created.count,
        alreadyPresent: usable.length - created.count,
        skippedInactive: rows.length - usable.length,
      };
    }, TX);

    await this.audit.record({
      actor,
      action: 'curriculum.copied',
      entityType: 'academic_year',
      entityId: destYearId,
      details: { sourceYearId, classIds: dto.classIds ?? 'all', ...result },
    });
    return result;
  }

  async setCreditHours(
    yearId: string,
    classId: string,
    subjectId: string,
    creditHours: number | null,
    actor: AuthUser,
  ): Promise<CurriculumResponse> {
    await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId); // rejects closed years
      const updated = await tx.classSubject.updateMany({
        where: { academicYearId: yearId, classId, subjectId },
        data: { creditHours },
      });
      if (updated.count === 0)
        throw new NotFoundException(
          "This subject is not in the class's curriculum for this academic year",
        );
    }, TX);
    await this.audit.record({
      actor,
      action: 'curriculum.credit_hours_set',
      entityType: 'curriculum',
      entityId: `${yearId}:${classId}`,
      details: { subjectId, creditHours },
    });
    return this.list(yearId, classId);
  }
}
