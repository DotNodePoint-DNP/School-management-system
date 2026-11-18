import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  dateParts,
  isoToDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { SetExamReleaseDto } from './dto/exam-release.dto.js';
import { ResultPoliciesService } from './result-policies.service.js';

const TX = { maxWait: 15_000, timeout: 30_000 } as const;

const released = (
  exam: { status: string; parentReleaseOn: Date | null },
  today: string,
): boolean =>
  exam.status === 'PUBLISHED' &&
  exam.parentReleaseOn !== null &&
  toIsoDate(exam.parentReleaseOn) <= today;

@Injectable()
export class ExamReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policies: ResultPoliciesService,
  ) {}

  async set(examId: string, dto: SetExamReleaseDto, actor: AuthUser) {
    const wantsClear = dto.clear === true;
    const date = resolveDate('releaseOn', dto.releaseOn, dto.releaseOnBs);
    if (wantsClear === (date !== undefined))
      throw new BadRequestException(
        'Give a release date, or clear: true to withdraw the release',
      );
    const today = todayIso();
    if (date && date < today)
      throw new BadRequestException(
        'The release date cannot be in the past. Use today to release now.',
      );

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM exams WHERE id = ${examId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Exam not found');
      const exam = await tx.exam.findUniqueOrThrow({
        where: { id: examId },
        select: { status: true, parentReleaseOn: true },
      });
      if (exam.status !== 'PUBLISHED')
        throw new ConflictException(
          'Results can be released to parents only after the exam has been published',
        );

      const current = exam.parentReleaseOn
        ? toIsoDate(exam.parentReleaseOn)
        : null;
      const next = wantsClear ? null : (date as string);
      if (next === current) throw new BadRequestException('Nothing to change');
      const recall =
        current !== null &&
        current <= today &&
        !(next !== null && next <= today);
      if (recall && !dto.reason)
        throw new BadRequestException(
          'Withdrawing or postponing a release that parents can already see needs a reason (at least 10 characters)',
        );

      await tx.exam.update({
        where: { id: examId },
        data: { parentReleaseOn: next ? isoToDate(next) : null },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'exam.release_set',
        entityType: 'exam',
        entityId: examId,
        details: {
          releaseOn: next,
          recalled: recall,
          ...(recall ? { reason: dto.reason } : {}),
        },
      });
    }, TX);
    return this.get(examId);
  }

  async get(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        name: true,
        sequence: true,
        isFinal: true,
        status: true,
        parentReleaseOn: true,
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return this.view(exam, todayIso());
  }

  async list(yearId: string) {
    if (
      !(await this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Academic year not found');
    const exams = await this.prisma.exam.findMany({
      where: { academicYearId: yearId },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        name: true,
        sequence: true,
        isFinal: true,
        status: true,
        parentReleaseOn: true,
      },
    });
    const today = todayIso();
    return exams.map((e) => this.view(e, today));
  }

  /** Which of these exams parents can see today. */
  async releasedExamIds(
    examIds: string[],
    today = todayIso(),
  ): Promise<Set<string>> {
    if (examIds.length === 0) return new Set();
    const exams = await this.prisma.exam.findMany({
      where: { id: { in: examIds } },
      select: { id: true, status: true, parentReleaseOn: true },
    });
    return new Set(exams.filter((e) => released(e, today)).map((e) => e.id));
  }

  async isExamReleased(
    examId: string,
    yearId: string,
    today = todayIso(),
  ): Promise<boolean> {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, academicYearId: yearId },
      select: { status: true, parentReleaseOn: true },
    });
    return exam !== null && released(exam, today);
  }

  /** The combined result is visible only when every exam in the class's result policy is visible. */
  async isFinalReleased(
    yearId: string,
    classId: string,
    today = todayIso(),
  ): Promise<boolean> {
    let ids: string[];
    try {
      ids = (await this.policies.getEffective(yearId, classId)).components.map(
        (c) => c.examId,
      );
    } catch (error) {
      if (error instanceof HttpException) return false; // no policy and no final exam yet
      throw error;
    }
    if (ids.length === 0) return false;
    const visible = await this.releasedExamIds(ids, today);
    return ids.every((id) => visible.has(id));
  }

  private view(
    e: {
      id: string;
      name: string;
      sequence: number;
      isFinal: boolean;
      status: string;
      parentReleaseOn: Date | null;
    },
    today: string,
  ) {
    const on = e.parentReleaseOn ? dateParts(e.parentReleaseOn) : null;
    return {
      id: e.id,
      name: e.name,
      sequence: e.sequence,
      isFinal: e.isFinal,
      status: e.status,
      releaseOn: on?.ad ?? null,
      releaseOnBs: on?.bs ?? null,
      visibleToParents: released(e, today),
    };
  }
}
