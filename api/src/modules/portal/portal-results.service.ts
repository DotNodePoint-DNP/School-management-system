import { Injectable, NotFoundException } from '@nestjs/common';
import { todayIso } from '../../common/utils/bs-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ReportCardService } from '../documents/report-card.service.js';
import { ExamReleaseService } from '../exams/exam-release.service.js';
import { PortalAccessService } from './portal-access.service.js';

export interface ResultItem {
  enrollmentId: string;
  academicYear: { id: string; name: string };
  className: string;
  scope: 'EXAM' | 'FINAL';
  exam: { id: string; name: string } | null;
  version: number;
  revised: boolean;
  status: 'PASS' | 'FAIL';
  percentage: number | null;
  gpa: number | null;
  classRank: number | null;
  sectionRank: number | null;
}

@Injectable()
export class PortalResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly release: ExamReleaseService,
    private readonly reportCards: ReportCardService,
  ) {}

  async list(actor: AuthUser, studentId: string): Promise<ResultItem[]> {
    await this.access.requireChild(actor, studentId);
    return (await this.listForStudents([studentId])).get(studentId) ?? [];
  }

  /** Released results only, newest first. Nothing unpublished or unreleased is ever returned. */
  async listForStudents(
    studentIds: string[],
  ): Promise<Map<string, ResultItem[]>> {
    const out = new Map<string, ResultItem[]>(studentIds.map((id) => [id, []]));
    if (studentIds.length === 0) return out;
    const today = todayIso();
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds } },
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
        classId: true,
        academicYear: { select: { id: true, name: true, startDate: true } },
        section: { select: { schoolClass: { select: { name: true } } } },
      },
    });
    if (enrollments.length === 0) return out;

    const runs = await this.prisma.resultRun.findMany({
      where: {
        OR: enrollments.map((e) => ({
          academicYearId: e.academicYearId,
          classId: e.classId,
        })),
      },
      orderBy: [
        { academicYearId: 'asc' },
        { classId: 'asc' },
        { scopeKey: 'asc' },
        { version: 'desc' },
      ],
      distinct: ['academicYearId', 'classId', 'scopeKey'],
      select: {
        id: true,
        academicYearId: true,
        classId: true,
        scopeKey: true,
        version: true,
        examId: true,
      },
    });
    const rows = await this.prisma.resultRow.findMany({
      where: {
        runId: { in: runs.map((r) => r.id) },
        enrollmentId: { in: enrollments.map((e) => e.id) },
        status: { not: 'INCOMPLETE' },
      },
      select: {
        runId: true,
        enrollmentId: true,
        status: true,
        percentage: true,
        gpa: true,
        classRank: true,
        sectionRank: true,
      },
    });

    const examIds = [
      ...new Set(runs.flatMap((r) => (r.examId ? [r.examId] : []))),
    ];
    const [visible, exams] = await Promise.all([
      this.release.releasedExamIds(examIds, today),
      examIds.length === 0
        ? Promise.resolve([])
        : this.prisma.exam.findMany({
            where: { id: { in: examIds } },
            select: { id: true, name: true, sequence: true },
          }),
    ]);
    const examBy = new Map(exams.map((e) => [e.id, e] as const));
    const finals = new Map<string, boolean>();
    for (const r of runs) {
      if (r.scopeKey !== 'POLICY') continue;
      const key = `${r.academicYearId}:${r.classId}`;
      if (!finals.has(key))
        finals.set(
          key,
          await this.release.isFinalReleased(
            r.academicYearId,
            r.classId,
            today,
          ),
        );
    }
    const runBy = new Map(runs.map((r) => [r.id, r] as const));
    const byEnrollment = new Map(enrollments.map((e) => [e.id, e] as const));

    const sortable = new Map<
      string,
      { item: ResultItem; year: number; order: number }[]
    >();
    for (const row of rows) {
      const run = runBy.get(row.runId);
      const e = byEnrollment.get(row.enrollmentId);
      if (!run || !e || (row.status !== 'PASS' && row.status !== 'FAIL'))
        continue;
      const isFinal = run.scopeKey === 'POLICY';
      if (
        isFinal
          ? !finals.get(`${run.academicYearId}:${run.classId}`)
          : !(run.examId && visible.has(run.examId))
      )
        continue;
      const exam = run.examId ? examBy.get(run.examId) : undefined;
      const item: ResultItem = {
        enrollmentId: e.id,
        academicYear: { id: e.academicYear.id, name: e.academicYear.name },
        className: e.section.schoolClass.name,
        scope: isFinal ? 'FINAL' : 'EXAM',
        exam: exam ? { id: exam.id, name: exam.name } : null,
        version: run.version,
        revised: run.version > 1,
        status: row.status,
        percentage: row.percentage?.toNumber() ?? null,
        gpa: row.gpa?.toNumber() ?? null,
        classRank: row.classRank,
        sectionRank: row.sectionRank,
      };
      sortable.set(e.studentId, [
        ...(sortable.get(e.studentId) ?? []),
        {
          item,
          year: e.academicYear.startDate.getTime(),
          order: isFinal ? Number.MAX_SAFE_INTEGER : (exam?.sequence ?? 0),
        },
      ]);
    }
    for (const [studentId, list] of sortable)
      out.set(
        studentId,
        list
          .sort((a, b) => b.year - a.year || b.order - a.order)
          .map((x) => x.item),
      );
    return out;
  }

  /** A full report card, once it has been released. Another family's child, or a result not yet released, is "not found". */
  async reportCard(
    actor: AuthUser,
    studentId: string,
    q: { enrollmentId?: string; examId?: string },
  ) {
    await this.access.requireChild(actor, studentId);
    const enrollment = await this.access.requireEnrollment(
      studentId,
      q.enrollmentId,
    );
    const today = todayIso();
    const ok = q.examId
      ? await this.release.isExamReleased(
          q.examId,
          enrollment.academicYearId,
          today,
        )
      : await this.release.isFinalReleased(
          enrollment.academicYearId,
          enrollment.classId,
          today,
        );
    if (!ok)
      throw new NotFoundException('There is no released result here yet');
    return this.reportCards.forParent(enrollment.id, { examId: q.examId });
  }
}
