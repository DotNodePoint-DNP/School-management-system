import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  adToBsString,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AttendanceSummaryService,
  type PeriodAttendance,
} from '../attendance/attendance-summary.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { SubjectResult } from '../exams/result-calculator.js';
import {
  ResultsService,
  type RunInfo,
  type StoredPayload,
} from '../exams/results.service.js';
import type { PrintBatch, SkippedDocument } from './document-contract.js';
import { PrintAssemblyService } from './print-assembly.service.js';

export interface ReportCardRequest {
  academicYearId: string;
  classId: string;
  /** One section, or leave out for the whole class (office roles only). */
  sectionId?: string;
  /** Specific students instead. */
  enrollmentIds?: string[];
  /** Omit for the combined (final) result; give an exam id for that exam's card. */
  examId?: string;
  /** A specific published version; omit for the latest. */
  version?: number;
  issuedOn?: string;
  issuedOnBs?: string;
  signatures?: 'auto' | 'line';
  order?: 'ROLL' | 'RANK';
  slots?: string[];
}

export interface ReportCardData {
  ref: string;
  /** A fingerprint of the frozen result, for spotting an altered or mismatched printout. Not a security feature on its own. */
  checksum: string;
  enrollmentId: string;
  student: {
    id: string;
    admissionNo: string;
    name: string;
    fullNameNp: string | null;
    gender: string;
    dateOfBirth: string;
    dateOfBirthBs: string | null;
  };
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
  rollNo: number | null;
  exam: { id: string; name: string } | null;
  run: RunInfo;
  result: {
    status: string;
    totalMarks: number | null;
    totalFull: number | null;
    percentage: number | null;
    gpa: number | null;
    creditBasis: StoredPayload['creditBasis'];
    sectionRank: number | null;
    classRank: number | null;
    sectionSize: number;
    classSize: number;
    failedSubjects: string[];
    missing: string[];
  };
  subjects: SubjectResult[];
  attendance: PeriodAttendance;
  remark: { text: string; updatedAt: string } | null;
}

const MAX_DOCUMENTS = 200;
const nepalDate = (d: Date): string =>
  new Date(d.getTime() + 345 * 60_000).toISOString().slice(0, 10);

@Injectable()
export class ReportCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly results: ResultsService,
    private readonly attendance: AttendanceSummaryService,
    private readonly assembly: PrintAssemblyService,
  ) {}

  /** A print batch for a section, a class, or chosen students. Needs a print permission. */
  async build(
    req: ReportCardRequest,
    actor: AuthUser,
  ): Promise<PrintBatch<'REPORT_CARD', ReportCardData>> {
    const canPrint =
      actor.permissions.includes('reportcards:print') ||
      actor.permissions.includes('reportcards:print-signed');
    if (!canPrint)
      throw new ForbiddenException(
        'You do not have permission to print report cards',
      );

    const c = await this.collect(req, actor);
    const mayUseDigital = actor.permissions.includes(
      'reportcards:print-signed',
    );
    const forceLine = req.signatures === 'line' || !mayUseDigital;
    const envelope = await this.assembly.envelope({
      academicYearId: req.academicYearId,
      sectionIds: c.sectionIds,
      issuedOn: c.issuedOn,
      forceLine,
      slots: req.slots,
    });
    if (!mayUseDigital && req.signatures !== 'line') {
      envelope.warnings.push(
        'Digital signatures are only included for people allowed to print signed documents; blank signature lines are used.',
      );
    }

    await this.audit.record({
      actor,
      action: 'reportcards.printed',
      entityType: 'result_run',
      entityId: c.runId,
      details: {
        classId: req.classId,
        sectionId: req.sectionId ?? null,
        scope: c.scope,
        version: c.version,
        count: c.documents.length,
        signatures: forceLine ? 'line' : 'digital',
      },
    });
    return {
      kind: 'REPORT_CARD',
      ...envelope,
      warnings: [...envelope.warnings, ...c.warnings],
      documents: c.documents,
      skipped: c.skipped,
    };
  }

  /** One student's card as data, for the screen. Same access rules as viewing results. */
  async single(
    enrollmentId: string,
    q: { examId?: string; version?: number },
    actor: AuthUser,
  ): Promise<ReportCardData> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { academicYearId: true, classId: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    const c = await this.collect(
      {
        academicYearId: enrollment.academicYearId,
        classId: enrollment.classId,
        enrollmentIds: [enrollmentId],
        examId: q.examId,
        version: q.version,
      },
      actor,
    );
    const doc = c.documents[0];
    if (!doc)
      throw new NotFoundException(
        'This student has no complete result in that run yet',
      );
    return doc;
  }

  private async collect(req: ReportCardRequest, actor: AuthUser) {
    const today = todayIso();
    const issuedOn =
      resolveDate('issuedOn', req.issuedOn, req.issuedOnBs) ?? today;
    if (issuedOn > today)
      throw new BadRequestException('The issue date cannot be in the future');

    const run = await this.results.latestRun(
      req.academicYearId,
      req.classId,
      req.examId,
      req.version,
    );
    const info = this.results.runInfo(run);
    const first = await this.prisma.resultRun.findFirstOrThrow({
      where: {
        academicYearId: req.academicYearId,
        classId: req.classId,
        scopeKey: run.scopeKey,
      },
      orderBy: { version: 'asc' },
      select: { createdAt: true },
    });
    const publishedOn = nepalDate(first.createdAt);
    if (issuedOn < publishedOn)
      throw new BadRequestException(
        `The issue date is before these results were published (${publishedOn})`,
      );

    const rows = await this.prisma.resultRow.findMany({
      where: {
        runId: run.id,
        ...(req.sectionId ? { sectionId: req.sectionId } : {}),
        ...(req.enrollmentIds
          ? { enrollmentId: { in: req.enrollmentIds } }
          : {}),
      },
    });
    if (req.enrollmentIds && rows.length !== new Set(req.enrollmentIds).size)
      throw new NotFoundException('Some students are not part of this result');

    // Office roles may read any section; class teachers only their own.
    if (!actor.permissions.includes('results:read-all')) {
      const sections = [...new Set(rows.map((r) => r.sectionId))];
      if (sections.length === 0)
        await this.results.assertCanRead(
          req.academicYearId,
          req.sectionId ?? null,
          actor,
        );
      for (const sectionId of sections)
        await this.results.assertCanRead(req.academicYearId, sectionId, actor);
    }
    if (rows.length > MAX_DOCUMENTS)
      throw new BadRequestException(
        `A batch can hold at most ${MAX_DOCUMENTS} report cards. Print by section.`,
      );

    const ids = rows.map((r) => r.enrollmentId);
    const [enrollments, cls, year, sizes, remarks, period] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { id: { in: ids } },
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
              fullNameNp: true,
              gender: true,
              dateOfBirth: true,
            },
          },
          section: { select: { id: true, name: true } },
        },
      }),
      this.prisma.schoolClass.findUniqueOrThrow({
        where: { id: req.classId },
        select: { name: true },
      }),
      this.prisma.academicYear.findUniqueOrThrow({
        where: { id: req.academicYearId },
        select: { name: true },
      }),
      this.prisma.resultRow.groupBy({
        by: ['sectionId'],
        where: { runId: run.id, status: { not: 'INCOMPLETE' } },
        _count: { _all: true },
      }),
      this.prisma.reportRemark.findMany({
        where: { scopeKey: run.scopeKey, enrollmentId: { in: ids } },
        select: { enrollmentId: true, remark: true, updatedAt: true },
      }),
      this.periodFor(req.academicYearId, run.examId, issuedOn),
    ]);
    const attendance = await this.attendance.forEnrollments(
      ids,
      period.from,
      period.to,
    );

    const byEnrollment = new Map(enrollments.map((e) => [e.id, e] as const));
    const sectionSize = new Map(
      sizes.map((s) => [s.sectionId, s._count._all] as const),
    );
    const classSize = sizes.reduce((n, s) => n + s._count._all, 0);
    const remarkBy = new Map(remarks.map((r) => [r.enrollmentId, r] as const));
    const exam = run.examId
      ? { id: run.examId, name: info.components[0]?.examName ?? '' }
      : null;

    const skipped: SkippedDocument[] = [];
    const documents: ReportCardData[] = [];
    for (const row of rows) {
      const e = byEnrollment.get(row.enrollmentId);
      if (!e) continue;
      if (row.status === 'INCOMPLETE') {
        skipped.push({
          enrollmentId: row.enrollmentId,
          admissionNo: e.student.admissionNo,
          reason: 'INCOMPLETE',
        });
        continue;
      }
      const payload = row.payload as unknown as StoredPayload;
      const dob = toIsoDate(e.student.dateOfBirth);
      const remark = remarkBy.get(row.enrollmentId);
      documents.push({
        ref: `${e.student.admissionNo}/${run.scopeKey === 'POLICY' ? 'FINAL' : 'EXAM'}/v${run.version}`,
        checksum: this.checksum(run.id, row, payload),
        enrollmentId: row.enrollmentId,
        student: {
          id: e.student.id,
          admissionNo: e.student.admissionNo,
          name: displayName(e.student),
          fullNameNp: e.student.fullNameNp,
          gender: e.student.gender,
          dateOfBirth: dob,
          dateOfBirthBs: adToBsString(dob),
        },
        academicYear: { id: req.academicYearId, name: year.name },
        class: { id: req.classId, name: cls.name },
        section: { id: e.section.id, name: e.section.name },
        rollNo: e.rollNo,
        exam,
        run: info,
        result: {
          status: row.status,
          totalMarks: row.totalMarks?.toNumber() ?? null,
          totalFull: row.totalFull?.toNumber() ?? null,
          percentage: row.percentage?.toNumber() ?? null,
          gpa: row.gpa?.toNumber() ?? null,
          creditBasis: payload.creditBasis,
          sectionRank: row.sectionRank,
          classRank: row.classRank,
          sectionSize: sectionSize.get(row.sectionId) ?? 0,
          classSize,
          failedSubjects: payload.failedSubjects,
          missing: payload.missing,
        },
        subjects: payload.subjects,
        attendance: attendance.get(row.enrollmentId) as PeriodAttendance,
        remark: remark
          ? { text: remark.remark, updatedAt: remark.updatedAt.toISOString() }
          : null,
      });
    }

    documents.sort(
      req.order === 'RANK'
        ? (a, b) =>
            (a.result.classRank ?? Number.MAX_SAFE_INTEGER) -
              (b.result.classRank ?? Number.MAX_SAFE_INTEGER) ||
            a.student.name.localeCompare(b.student.name)
        : (a, b) =>
            a.section.name.localeCompare(b.section.name) ||
            (a.rollNo ?? Number.MAX_SAFE_INTEGER) -
              (b.rollNo ?? Number.MAX_SAFE_INTEGER) ||
            a.student.name.localeCompare(b.student.name),
    );
    return {
      runId: run.id,
      version: run.version,
      scope: run.scopeKey === 'POLICY' ? 'POLICY' : 'EXAM',
      issuedOn,
      documents,
      skipped,
      sectionIds: [...new Set(documents.map((d) => d.section.id))],
      warnings:
        skipped.length > 0
          ? [
              `${skipped.length} student(s) were left out because their result is incomplete`,
            ]
          : [],
    };
  }

  /** The exam's term if it has one, otherwise the whole academic year; never past the issue date. */
  private async periodFor(
    yearId: string,
    examId: string | null,
    issuedOn: string,
  ): Promise<{ from: string; to: string }> {
    const year = await this.prisma.academicYear.findUniqueOrThrow({
      where: { id: yearId },
      select: { startDate: true, endDate: true },
    });
    let from = toIsoDate(year.startDate);
    let to = toIsoDate(year.endDate);
    if (examId) {
      const exam = await this.prisma.exam.findUnique({
        where: { id: examId },
        select: { term: { select: { startDate: true, endDate: true } } },
      });
      if (exam?.term) {
        from = toIsoDate(exam.term.startDate);
        to = toIsoDate(exam.term.endDate);
      }
    }
    return { from, to: to > issuedOn ? issuedOn : to };
  }

  private checksum(
    runId: string,
    row: {
      enrollmentId: string;
      status: string;
      totalMarks: unknown;
      totalFull: unknown;
      percentage: unknown;
      gpa: unknown;
      sectionRank: number | null;
      classRank: number | null;
    },
    payload: StoredPayload,
  ): string {
    const material = [
      runId,
      row.enrollmentId,
      row.status,
      String(row.totalMarks),
      String(row.totalFull),
      String(row.percentage),
      String(row.gpa),
      row.sectionRank,
      row.classRank,
      ...payload.subjects.map(
        (s) => `${s.code}:${s.status}:${s.percentage}:${s.grade}`,
      ),
    ].join('|');
    return createHash('sha256')
      .update(material)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();
  }
}
