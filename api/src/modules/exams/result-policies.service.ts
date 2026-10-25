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
import type { SetResultPolicyDto } from './dto/result-policy.dto.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

export interface EffectivePolicy {
  /** EXPLICIT: set for this class. DEFAULT: the final exam at 100% with the default grade scale. */
  source: 'EXPLICIT' | 'DEFAULT';
  academicYearId: string;
  classId: string;
  gradeScale: { id: string; name: string };
  components: {
    examId: string;
    examName: string;
    sequence: number;
    status: string;
    weightPercent: number;
  }[];
}

const POLICY_SELECT = {
  gradeScale: { select: { id: true, name: true } },
  components: {
    select: {
      weightPercent: true,
      exam: { select: { id: true, name: true, sequence: true, status: true } },
    },
  },
} as const;

@Injectable()
export class ResultPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
  ) {}

  async list(yearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: yearId },
      select: { id: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    const rows = await this.prisma.resultPolicy.findMany({
      where: { academicYearId: yearId },
      orderBy: [
        { schoolClass: { sortOrder: 'asc' } },
        { schoolClass: { name: 'asc' } },
      ],
      select: {
        classId: true,
        schoolClass: { select: { name: true } },
        ...POLICY_SELECT,
      },
    });
    return rows.map((r) => ({
      classId: r.classId,
      className: r.schoolClass.name,
      gradeScale: r.gradeScale,
      components: [...r.components]
        .sort((a, b) => a.exam.sequence - b.exam.sequence)
        .map((c) => ({
          examId: c.exam.id,
          examName: c.exam.name,
          weightPercent: c.weightPercent.toNumber(),
        })),
    }));
  }

  /** The policy results will use for this class: the explicit one, or the default. Reused by result calculation. */
  async getEffective(
    yearId: string,
    classId: string,
  ): Promise<EffectivePolicy> {
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

    const policy = await this.prisma.resultPolicy.findUnique({
      where: { academicYearId_classId: { academicYearId: yearId, classId } },
      select: POLICY_SELECT,
    });
    if (policy) {
      return {
        source: 'EXPLICIT',
        academicYearId: yearId,
        classId,
        gradeScale: policy.gradeScale,
        components: [...policy.components]
          .sort((a, b) => a.exam.sequence - b.exam.sequence)
          .map((c) => ({
            examId: c.exam.id,
            examName: c.exam.name,
            sequence: c.exam.sequence,
            status: c.exam.status,
            weightPercent: c.weightPercent.toNumber(),
          })),
      };
    }

    const [finalExam, scale] = await Promise.all([
      this.prisma.exam.findFirst({
        where: { academicYearId: yearId, isFinal: true },
        select: { id: true, name: true, sequence: true, status: true },
      }),
      this.prisma.gradeScale.findFirst({
        where: { isDefault: true },
        select: { id: true, name: true },
      }),
    ]);
    if (!finalExam) {
      throw new NotFoundException(
        'No final exam is marked for this academic year. Mark one as final, or set a result policy for this class.',
      );
    }
    if (!scale)
      throw new ConflictException(
        'There is no default grade scale. Make one the default, or set a result policy for this class.',
      );
    return {
      source: 'DEFAULT',
      academicYearId: yearId,
      classId,
      gradeScale: scale,
      components: [
        {
          examId: finalExam.id,
          examName: finalExam.name,
          sequence: finalExam.sequence,
          status: finalExam.status,
          weightPercent: 100,
        },
      ],
    };
  }

  async set(
    yearId: string,
    classId: string,
    dto: SetResultPolicyDto,
    actor: AuthUser,
  ): Promise<EffectivePolicy> {
    const cents = dto.components.map((c) => Math.round(c.weightPercent * 100));
    const total = cents.reduce((a, b) => a + b, 0);
    if (total !== 10_000)
      throw new BadRequestException(
        `The weights must add up to exactly 100 (they add up to ${total / 100})`,
      );

    await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockYearShared(tx, yearId);
      if (year.status === 'CLOSED')
        throw new ConflictException(
          'This academic year is closed and can no longer be changed',
        );
      // Serialises changes to one class's policy, so two edits cannot interleave their components.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result_policy:${yearId}:${classId}`}))`;

      const cls = await tx.schoolClass.findUnique({
        where: { id: classId },
        select: { id: true },
      });
      if (!cls) throw new NotFoundException('Class not found');
      const scale = await tx.gradeScale.findUnique({
        where: { id: dto.gradeScaleId },
        select: { id: true },
      });
      if (!scale)
        throw new BadRequestException('That grade scale does not exist');

      const examIds = dto.components.map((c) => c.examId);
      const exams = await tx.exam.findMany({
        where: { id: { in: examIds }, academicYearId: yearId },
        select: { id: true, name: true, status: true },
      });
      if (exams.length !== examIds.length)
        throw new BadRequestException(
          'One or more exams do not exist in this academic year',
        );

      const existing = await tx.resultPolicy.findUnique({
        where: { academicYearId_classId: { academicYearId: yearId, classId } },
        select: {
          id: true,
          components: {
            select: { exam: { select: { name: true, status: true } } },
          },
        },
      });
      const published = [
        ...exams,
        ...(existing?.components.map((c) => c.exam) ?? []),
      ].find((e) => e.status === 'PUBLISHED');
      if (published)
        throw new ConflictException(
          `Results based on the published exam "${published.name}" are frozen`,
        );

      const policy = existing
        ? await tx.resultPolicy.update({
            where: { id: existing.id },
            data: { gradeScaleId: dto.gradeScaleId },
            select: { id: true },
          })
        : await tx.resultPolicy.create({
            data: {
              academicYearId: yearId,
              classId,
              gradeScaleId: dto.gradeScaleId,
            },
            select: { id: true },
          });
      await tx.resultComponent.deleteMany({ where: { policyId: policy.id } });
      await tx.resultComponent.createMany({
        data: dto.components.map((c) => ({
          policyId: policy.id,
          academicYearId: yearId,
          examId: c.examId,
          weightPercent: c.weightPercent,
        })),
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'result_policy.set',
        entityType: 'result_policy',
        entityId: policy.id,
        details: {
          academicYearId: yearId,
          classId,
          gradeScaleId: dto.gradeScaleId,
          weights: dto.components.map((c) => c.weightPercent),
        },
      });
    }, TX);
    return this.getEffective(yearId, classId);
  }

  /** Reverts the class to the default policy. */
  async remove(
    yearId: string,
    classId: string,
    actor: AuthUser,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const year = await this.years.lockYearShared(tx, yearId);
      if (year.status === 'CLOSED')
        throw new ConflictException(
          'This academic year is closed and can no longer be changed',
        );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result_policy:${yearId}:${classId}`}))`;

      const existing = await tx.resultPolicy.findUnique({
        where: { academicYearId_classId: { academicYearId: yearId, classId } },
        select: {
          id: true,
          components: {
            select: { exam: { select: { name: true, status: true } } },
          },
        },
      });
      if (!existing)
        throw new NotFoundException('This class has no explicit result policy');
      const published = existing.components.find(
        (c) => c.exam.status === 'PUBLISHED',
      );
      if (published)
        throw new ConflictException(
          `Results based on the published exam "${published.exam.name}" are frozen`,
        );

      await tx.resultComponent.deleteMany({ where: { policyId: existing.id } });
      await tx.resultPolicy.delete({ where: { id: existing.id } });
      await this.audit.recordIn(tx, {
        actor,
        action: 'result_policy.deleted',
        entityType: 'result_policy',
        entityId: existing.id,
        details: { academicYearId: yearId, classId },
      });
    }, TX);
  }
}
