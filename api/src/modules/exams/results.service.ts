import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ATTENDANCE_STATUSES,
  ATTENDED_STATUSES,
  type AttendanceStatusValue,
} from '../../common/constants/attendance.js';
import { adToBsString, toIsoDate } from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  computeResults,
  type CalcBand,
  type CalcComponent,
  type CalcInput,
  type CalcOutput,
  type StudentResult,
  type SubjectResult,
} from './result-calculator.js';

type Tx = Prisma.TransactionClient;
type Db = Pick<
  Tx,
  | 'classSubject'
  | 'examSubject'
  | 'enrollment'
  | 'mark'
  | 'resultPolicy'
  | 'exam'
  | 'gradeScale'
  | 'resultRun'
  | 'resultRow'
>;

const SCALE_SELECT = {
  id: true,
  name: true,
  bands: {
    orderBy: { minPercent: 'desc' },
    select: {
      grade: true,
      minPercent: true,
      gradePoint: true,
      description: true,
      isPass: true,
    },
  },
} satisfies Prisma.GradeScaleSelect;
type ScaleRow = Prisma.GradeScaleGetPayload<{ select: typeof SCALE_SELECT }>;

const STUDENT_SELECT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullNameNp: true,
  dateOfBirth: true,
  gender: true,
} satisfies Prisma.StudentSelect;

interface StoredScale {
  id: string;
  name: string;
  bands: CalcBand[];
}
interface StoredPayload {
  subjects: SubjectResult[];
  missing: string[];
  failedSubjects: string[];
  creditBasis: 'CREDIT_HOURS' | 'EQUAL';
}
interface StudentMeta {
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
  dateOfBirth: Date;
  gender: string;
}
interface Computed {
  output: CalcOutput;
  meta: Map<string, StudentMeta>;
}
interface EffectivePolicy {
  source: 'EXPLICIT' | 'DEFAULT';
  scale: StoredScale;
  components: (CalcComponent & { status: string })[];
}

const toScale = (s: ScaleRow): StoredScale => ({
  id: s.id,
  name: s.name,
  bands: s.bands.map((b) => ({
    grade: b.grade,
    minPercent: b.minPercent.toNumber(),
    gradePoint: b.gradePoint.toNumber(),
    description: b.description,
    isPass: b.isPass,
  })),
});
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const scopeOf = (examId?: string): string =>
  examId ? `EXAM:${examId}` : 'POLICY';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- publishing hooks (run inside the caller's transaction)

  /**
   * Called inside the exam-publish transaction, after the exam is marked PUBLISHED.
   * Freezes this exam's result for every class that sat it, and the combined result of any class whose policy this exam completes.
   */
  async publishForExam(
    tx: Tx,
    examId: string,
    actor: AuthUser,
  ): Promise<{ runs: number; incompleteStudents: number }> {
    const exam = await tx.exam.findUniqueOrThrow({
      where: { id: examId },
      select: { name: true, academicYearId: true },
    });
    const classes = await tx.examSubject.findMany({
      where: { examId },
      select: { classId: true },
      distinct: ['classId'],
    });
    let runs = 0;
    let incompleteStudents = 0;

    for (const { classId } of [...classes].sort((a, b) =>
      a.classId.localeCompare(b.classId),
    )) {
      // Serialises with other publishes and corrections for this class, so each sees the other's committed state.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result_run:${exam.academicYearId}:${classId}`}))`;

      const own = await this.createRun(tx, {
        yearId: exam.academicYearId,
        classId,
        scopeKey: scopeOf(examId),
        examId,
        components: [{ examId, examName: exam.name, weightPercent: 100 }],
        scale: await this.scaleFor(tx, exam.academicYearId, classId),
        actor,
        revised: false,
      });
      runs += 1;
      incompleteStudents += own.incomplete;

      const policy = await this.effectivePolicy(
        tx,
        exam.academicYearId,
        classId,
      );
      const completes =
        policy &&
        policy.components.some((c) => c.examId === examId) &&
        policy.components.every((c) => c.status === 'PUBLISHED');
      if (policy && completes) {
        const combined = await this.createRun(tx, {
          yearId: exam.academicYearId,
          classId,
          scopeKey: 'POLICY',
          examId: null,
          components: policy.components.map(
            ({ examId: id, examName, weightPercent }) => ({
              examId: id,
              examName,
              weightPercent,
            }),
          ),
          scale: policy.scale,
          actor,
          revised: false,
        });
        runs += 1;
        incompleteStudents += combined.incomplete;
      }
    }
    return { runs, incompleteStudents };
  }

  /** Called inside a marks-correction transaction on a PUBLISHED exam. New versions reuse the original scale and weights. */
  async reviseForCorrection(
    tx: Tx,
    examId: string,
    classId: string,
    reason: string,
    actor: AuthUser,
  ): Promise<void> {
    const exam = await tx.exam.findUniqueOrThrow({
      where: { id: examId },
      select: { academicYearId: true },
    });
    const yearId = exam.academicYearId;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result_run:${yearId}:${classId}`}))`;

    let revisions = 0;
    const latest = (scopeKey: string) =>
      tx.resultRun.findFirst({
        where: { academicYearId: yearId, classId, scopeKey },
        orderBy: { version: 'desc' },
      });
    const revise = async (
      prev: NonNullable<Awaited<ReturnType<typeof latest>>>,
      examScope: string | null,
    ): Promise<void> => {
      await this.createRun(tx, {
        yearId,
        classId,
        scopeKey: prev.scopeKey,
        examId: examScope,
        components: prev.components as unknown as CalcComponent[],
        scale: prev.gradeScale as unknown as StoredScale,
        actor,
        revised: true,
        reason,
      });
      revisions += 1;
    };

    const ownRun = await latest(scopeOf(examId));
    if (ownRun) await revise(ownRun, examId);
    const policyRun = await latest('POLICY');
    if (
      policyRun &&
      (policyRun.components as unknown as CalcComponent[]).some(
        (c) => c.examId === examId,
      )
    )
      await revise(policyRun, null);

    await this.audit.recordIn(tx, {
      actor,
      action: 'results.revised',
      entityType: 'exam',
      entityId: examId,
      details: { classId, versions: revisions },
    });
  }

  // ---------------------------------------------------------------- reads

  /** Live calculation for review before publishing. Writes nothing. */
  async preview(yearId: string, classId: string, examId: string | undefined) {
    await this.assertYearAndClass(yearId, classId);
    let components: (CalcComponent & { status: string })[];
    let scale: StoredScale;
    let source: 'EXAM' | 'EXPLICIT' | 'DEFAULT';

    if (examId) {
      const exam = await this.prisma.exam.findFirst({
        where: { id: examId, academicYearId: yearId },
        select: { id: true, name: true, status: true },
      });
      if (!exam)
        throw new NotFoundException('Exam not found in this academic year');
      components = [
        {
          examId,
          examName: exam.name,
          weightPercent: 100,
          status: exam.status,
        },
      ];
      scale = await this.scaleFor(this.prisma, yearId, classId);
      source = 'EXAM';
    } else {
      const policy = await this.effectivePolicy(this.prisma, yearId, classId);
      if (!policy)
        throw new NotFoundException(
          'No final exam is marked for this academic year, and the class has no result policy.',
        );
      ({ components, scale, source } = policy);
    }

    const { output, meta } = await this.compute(
      this.prisma,
      yearId,
      classId,
      components,
      scale.bands,
    );
    const students = output.students
      .map((s) => this.present(s, meta.get(s.enrollmentId), true))
      .sort(byRank);
    return {
      source,
      academicYearId: yearId,
      classId,
      gradeScale: { id: scale.id, name: scale.name },
      components,
      warnings: output.warnings,
      summary: {
        students: students.length,
        pass: students.filter((s) => s.status === 'PASS').length,
        fail: students.filter((s) => s.status === 'FAIL').length,
        incomplete: students.filter((s) => s.status === 'INCOMPLETE').length,
      },
      students,
    };
  }

  /** The published result (latest version unless one is given). Office roles see the class; class teachers only their section. */
  async list(
    yearId: string,
    classId: string,
    q: { examId?: string; sectionId?: string; version?: number },
    actor: AuthUser,
  ) {
    await this.assertCanRead(yearId, q.sectionId ?? null, actor);
    await this.assertYearAndClass(yearId, classId);
    const run = await this.findRun(
      this.prisma,
      yearId,
      classId,
      scopeOf(q.examId),
      q.version,
    );
    const rows = await this.prisma.resultRow.findMany({
      where: {
        runId: run.id,
        ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      },
    });
    const meta = await this.metaFor(
      this.prisma,
      rows.map((r) => r.enrollmentId),
    );

    const students = rows
      .map((r) => {
        const payload = r.payload as unknown as StoredPayload;
        const m = meta.get(r.enrollmentId);
        return {
          enrollmentId: r.enrollmentId,
          studentId: m?.studentId ?? null,
          admissionNo: m?.admissionNo ?? null,
          name: m?.name ?? null,
          rollNo: m?.rollNo ?? null,
          sectionId: r.sectionId,
          status: r.status,
          percentage: r.percentage?.toNumber() ?? null,
          totalMarks: r.totalMarks?.toNumber() ?? null,
          totalFull: r.totalFull?.toNumber() ?? null,
          gpa: r.gpa?.toNumber() ?? null,
          sectionRank: r.sectionRank,
          classRank: r.classRank,
          failedSubjects: payload.failedSubjects,
          missing: payload.missing,
        };
      })
      .sort(byRank);
    return { run: this.runInfo(run), students };
  }

  async runs(yearId: string, classId: string, examId?: string) {
    await this.assertYearAndClass(yearId, classId);
    const runs = await this.prisma.resultRun.findMany({
      where: { academicYearId: yearId, classId, scopeKey: scopeOf(examId) },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        revised: true,
        reason: true,
        createdAt: true,
        createdById: true,
        warnings: true,
      },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(runs.map((r) => r.createdById))] } },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName] as const));
    return runs.map((r) => ({
      version: r.version,
      revised: r.revised,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      createdByName: name.get(r.createdById) ?? null,
      warnings: r.warnings,
    }));
  }

  /**
   * The order in which next year's roll numbers should be assigned: the final-result ranking.
   * Ties share a rank here, so they are ordered by name to give every student a distinct position.
   * Promotion will feed this list to applyRollOrder.
   */
  async rollOrder(yearId: string, classId: string, sectionId?: string) {
    await this.assertYearAndClass(yearId, classId);
    const run = await this.findRun(this.prisma, yearId, classId, 'POLICY');
    const rows = await this.prisma.resultRow.findMany({
      where: { runId: run.id, ...(sectionId ? { sectionId } : {}) },
    });
    const meta = await this.metaFor(
      this.prisma,
      rows.map((r) => r.enrollmentId),
    );
    const rankOf = (r: (typeof rows)[number]): number =>
      (sectionId ? r.sectionRank : r.classRank) ?? Number.MAX_SAFE_INTEGER;

    const order = rows
      .map((r) => ({ row: r, m: meta.get(r.enrollmentId) }))
      .sort(
        (a, b) =>
          rankOf(a.row) - rankOf(b.row) ||
          (a.m?.name ?? '').localeCompare(b.m?.name ?? '') ||
          (a.m?.admissionNo ?? '').localeCompare(b.m?.admissionNo ?? ''),
      )
      .map(({ row, m }, i) => ({
        position: i + 1,
        enrollmentId: row.enrollmentId,
        studentId: m?.studentId ?? null,
        admissionNo: m?.admissionNo ?? null,
        name: m?.name ?? null,
        rank: (sectionId ? row.sectionRank : row.classRank) ?? null,
        status: row.status,
      }));
    return {
      version: run.version,
      scope: sectionId ? 'SECTION' : 'CLASS',
      order,
    };
  }

  /** Everything a printed report card needs. Attendance is live (to date), not frozen. */
  async reportCard(
    enrollmentId: string,
    q: { examId?: string; version?: number },
    actor: AuthUser,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        academicYearId: true,
        classId: true,
        sectionId: true,
        rollNo: true,
        student: { select: STUDENT_SELECT },
        section: {
          select: { name: true, schoolClass: { select: { name: true } } },
        },
        academicYear: { select: { name: true } },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const run = await this.findRun(
      this.prisma,
      enrollment.academicYearId,
      enrollment.classId,
      scopeOf(q.examId),
      q.version,
    );
    const row = await this.prisma.resultRow.findUnique({
      where: { runId_enrollmentId: { runId: run.id, enrollmentId } },
    });
    if (!row)
      throw new NotFoundException('This student is not part of that result');
    await this.assertCanRead(enrollment.academicYearId, row.sectionId, actor);

    const [classSize, sectionSize, attendance] = await Promise.all([
      this.prisma.resultRow.count({
        where: { runId: run.id, status: { not: 'INCOMPLETE' } },
      }),
      this.prisma.resultRow.count({
        where: {
          runId: run.id,
          sectionId: row.sectionId,
          status: { not: 'INCOMPLETE' },
        },
      }),
      this.attendanceFor(enrollmentId),
    ]);
    const payload = row.payload as unknown as StoredPayload;
    const dob = toIsoDate(enrollment.student.dateOfBirth);
    return {
      student: {
        id: enrollment.student.id,
        admissionNo: enrollment.student.admissionNo,
        name: displayName(enrollment.student),
        fullNameNp: enrollment.student.fullNameNp,
        gender: enrollment.student.gender,
        dateOfBirth: dob,
        dateOfBirthBs: adToBsString(dob),
      },
      academicYear: {
        id: enrollment.academicYearId,
        name: enrollment.academicYear.name,
      },
      class: {
        id: enrollment.classId,
        name: enrollment.section.schoolClass.name,
      },
      section: { id: row.sectionId, name: enrollment.section.name },
      rollNo: enrollment.rollNo,
      run: this.runInfo(run),
      result: {
        status: row.status,
        totalMarks: row.totalMarks?.toNumber() ?? null,
        totalFull: row.totalFull?.toNumber() ?? null,
        percentage: row.percentage?.toNumber() ?? null,
        gpa: row.gpa?.toNumber() ?? null,
        creditBasis: payload.creditBasis,
        sectionRank: row.sectionRank,
        classRank: row.classRank,
        sectionSize,
        classSize,
        failedSubjects: payload.failedSubjects,
        missing: payload.missing,
      },
      subjects: payload.subjects,
      attendance,
    };
  }

  // ---------------------------------------------------------------- internals

  private async createRun(
    tx: Tx,
    p: {
      yearId: string;
      classId: string;
      scopeKey: string;
      examId: string | null;
      components: CalcComponent[];
      scale: StoredScale;
      actor: AuthUser;
      revised: boolean;
      reason?: string;
    },
  ): Promise<{ version: number; incomplete: number }> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result_run:${p.yearId}:${p.classId}`}))`;
    const prev = await tx.resultRun.findFirst({
      where: {
        academicYearId: p.yearId,
        classId: p.classId,
        scopeKey: p.scopeKey,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    // A revision keeps the original population: students who joined later are not retroactively added.
    const population = prev
      ? new Set(
          (
            await tx.resultRow.findMany({
              where: { runId: prev.id },
              select: { enrollmentId: true },
            })
          ).map((r) => r.enrollmentId),
        )
      : undefined;

    const { output } = await this.compute(
      tx,
      p.yearId,
      p.classId,
      p.components,
      p.scale.bands,
      population,
    );
    const run = await tx.resultRun.create({
      data: {
        academicYearId: p.yearId,
        classId: p.classId,
        scopeKey: p.scopeKey,
        examId: p.examId,
        version: (prev?.version ?? 0) + 1,
        revised: p.revised,
        reason: p.reason,
        createdById: p.actor.id,
        gradeScale: json(p.scale),
        components: json(p.components),
        warnings: json(output.warnings),
      },
      select: { id: true, version: true },
    });
    if (output.students.length > 0) {
      await tx.resultRow.createMany({
        data: output.students.map((s) => ({
          runId: run.id,
          enrollmentId: s.enrollmentId,
          sectionId: s.sectionId,
          status: s.status,
          totalMarks: s.totalMarks,
          totalFull: s.totalFull,
          percentage: s.percentage,
          gpa: s.gpa,
          sectionRank: s.sectionRank,
          classRank: s.classRank,
          payload: json({
            subjects: s.subjects,
            missing: s.missing,
            failedSubjects: s.failedSubjects,
            creditBasis: s.creditBasis,
          } satisfies StoredPayload),
        })),
      });
    }
    return {
      version: run.version,
      incomplete: output.students.filter((s) => s.status === 'INCOMPLETE')
        .length,
    };
  }

  private async compute(
    db: Db,
    yearId: string,
    classId: string,
    components: CalcComponent[],
    bands: CalcBand[],
    population?: Set<string>,
  ): Promise<Computed> {
    const examIds = components.map((c) => c.examId);
    const [curriculum, setups, enrollments, marks] = await Promise.all([
      db.classSubject.findMany({
        where: { academicYearId: yearId, classId },
        orderBy: { subject: { code: 'asc' } },
        select: {
          isCompulsory: true,
          creditHours: true,
          subject: { select: { id: true, code: true, name: true } },
        },
      }),
      db.examSubject.findMany({
        where: { examId: { in: examIds }, classId },
        select: {
          examId: true,
          subjectId: true,
          fullTheory: true,
          passTheory: true,
          fullPractical: true,
          passPractical: true,
        },
      }),
      db.enrollment.findMany({
        where: {
          academicYearId: yearId,
          classId,
          ...(population
            ? { id: { in: [...population] } }
            : {
                status: {
                  in: ['ENROLLED', 'COMPLETED'] as ('ENROLLED' | 'COMPLETED')[],
                },
              }),
        },
        select: {
          id: true,
          sectionId: true,
          rollNo: true,
          subjectChoices: { select: { subjectId: true } },
          student: { select: STUDENT_SELECT },
        },
      }),
      db.mark.findMany({
        where: {
          academicYearId: yearId,
          classId,
          sheet: { examId: { in: examIds } },
        },
        select: {
          enrollmentId: true,
          theory: true,
          practical: true,
          absent: true,
          sheet: { select: { examId: true, subjectId: true } },
        },
      }),
    ]);

    const input: CalcInput = {
      bands,
      components,
      subjects: curriculum.map((c) => ({
        subjectId: c.subject.id,
        code: c.subject.code,
        name: c.subject.name,
        isCompulsory: c.isCompulsory,
        creditHours: c.creditHours?.toNumber() ?? null,
      })),
      setups: setups.map((s) => ({
        examId: s.examId,
        subjectId: s.subjectId,
        fullTheory: s.fullTheory.toNumber(),
        passTheory: s.passTheory.toNumber(),
        fullPractical: s.fullPractical?.toNumber() ?? null,
        passPractical: s.passPractical?.toNumber() ?? null,
      })),
      students: enrollments.map((e) => ({
        enrollmentId: e.id,
        sectionId: e.sectionId,
        optionalSubjectIds: e.subjectChoices.map((c) => c.subjectId),
      })),
      marks: marks.map((m) => ({
        examId: m.sheet.examId,
        subjectId: m.sheet.subjectId,
        enrollmentId: m.enrollmentId,
        theory: m.theory?.toNumber() ?? null,
        practical: m.practical?.toNumber() ?? null,
        absent: m.absent,
      })),
    };
    const meta = new Map(
      enrollments.map(
        (e) =>
          [
            e.id,
            {
              studentId: e.student.id,
              admissionNo: e.student.admissionNo,
              name: displayName(e.student),
              fullNameNp: e.student.fullNameNp,
              rollNo: e.rollNo,
              dateOfBirth: e.student.dateOfBirth,
              gender: e.student.gender,
            } satisfies StudentMeta,
          ] as const,
      ),
    );
    return { output: computeResults(input), meta };
  }

  private async scaleFor(
    db: Db,
    yearId: string,
    classId: string,
  ): Promise<StoredScale> {
    const policy = await db.resultPolicy.findUnique({
      where: { academicYearId_classId: { academicYearId: yearId, classId } },
      select: { gradeScale: { select: SCALE_SELECT } },
    });
    const scale =
      policy?.gradeScale ??
      (await db.gradeScale.findFirst({
        where: { isDefault: true },
        select: SCALE_SELECT,
      }));
    if (!scale)
      throw new ConflictException(
        'There is no default grade scale. Make one the default, or set a result policy for this class.',
      );
    return toScale(scale);
  }

  /** The explicit policy, or the final exam at 100% with the default scale. Null when neither can be determined. */
  private async effectivePolicy(
    db: Db,
    yearId: string,
    classId: string,
  ): Promise<EffectivePolicy | null> {
    const policy = await db.resultPolicy.findUnique({
      where: { academicYearId_classId: { academicYearId: yearId, classId } },
      select: {
        gradeScale: { select: SCALE_SELECT },
        components: {
          select: {
            weightPercent: true,
            exam: {
              select: { id: true, name: true, sequence: true, status: true },
            },
          },
        },
      },
    });
    if (policy) {
      return {
        source: 'EXPLICIT',
        scale: toScale(policy.gradeScale),
        components: [...policy.components]
          .sort((a, b) => a.exam.sequence - b.exam.sequence)
          .map((c) => ({
            examId: c.exam.id,
            examName: c.exam.name,
            weightPercent: c.weightPercent.toNumber(),
            status: c.exam.status,
          })),
      };
    }
    const [finalExam, scale] = await Promise.all([
      db.exam.findFirst({
        where: { academicYearId: yearId, isFinal: true },
        select: { id: true, name: true, status: true },
      }),
      db.gradeScale.findFirst({
        where: { isDefault: true },
        select: SCALE_SELECT,
      }),
    ]);
    if (!finalExam || !scale) return null;
    return {
      source: 'DEFAULT',
      scale: toScale(scale),
      components: [
        {
          examId: finalExam.id,
          examName: finalExam.name,
          weightPercent: 100,
          status: finalExam.status,
        },
      ],
    };
  }

  private async findRun(
    db: Db,
    yearId: string,
    classId: string,
    scopeKey: string,
    version?: number,
  ) {
    const run = version
      ? await db.resultRun.findUnique({
          where: {
            academicYearId_classId_scopeKey_version: {
              academicYearId: yearId,
              classId,
              scopeKey,
              version,
            },
          },
        })
      : await db.resultRun.findFirst({
          where: { academicYearId: yearId, classId, scopeKey },
          orderBy: { version: 'desc' },
        });
    if (!run)
      throw new NotFoundException(
        'Results have not been published for this class yet',
      );
    return run;
  }

  private runInfo(run: {
    version: number;
    revised: boolean;
    reason: string | null;
    createdAt: Date;
    scopeKey: string;
    gradeScale: unknown;
    components: unknown;
    warnings: unknown;
  }) {
    const scale = run.gradeScale as StoredScale;
    return {
      scope: run.scopeKey === 'POLICY' ? 'POLICY' : 'EXAM',
      version: run.version,
      revised: run.revised,
      reason: run.reason,
      publishedAt: run.createdAt.toISOString(),
      gradeScale: { id: scale.id, name: scale.name, bands: scale.bands },
      components: run.components as CalcComponent[],
      warnings: run.warnings as string[],
    };
  }

  private present(
    s: StudentResult,
    m: StudentMeta | undefined,
    withSubjects: boolean,
  ) {
    return {
      enrollmentId: s.enrollmentId,
      studentId: m?.studentId ?? null,
      admissionNo: m?.admissionNo ?? null,
      name: m?.name ?? null,
      rollNo: m?.rollNo ?? null,
      sectionId: s.sectionId,
      status: s.status,
      percentage: s.percentage,
      totalMarks: s.totalMarks,
      totalFull: s.totalFull,
      gpa: s.gpa,
      creditBasis: s.creditBasis,
      sectionRank: s.sectionRank,
      classRank: s.classRank,
      failedSubjects: s.failedSubjects,
      missing: s.missing,
      ...(withSubjects ? { subjects: s.subjects } : {}),
    };
  }

  private async metaFor(
    db: Pick<Tx, 'enrollment'>,
    enrollmentIds: string[],
  ): Promise<Map<string, StudentMeta>> {
    const rows = await db.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, rollNo: true, student: { select: STUDENT_SELECT } },
    });
    return new Map(
      rows.map(
        (e) =>
          [
            e.id,
            {
              studentId: e.student.id,
              admissionNo: e.student.admissionNo,
              name: displayName(e.student),
              fullNameNp: e.student.fullNameNp,
              rollNo: e.rollNo,
              dateOfBirth: e.student.dateOfBirth,
              gender: e.student.gender,
            } satisfies StudentMeta,
          ] as const,
      ),
    );
  }

  private async attendanceFor(enrollmentId: string) {
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { enrollmentId },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      ATTENDANCE_STATUSES.map((s) => [s, 0]),
    ) as Record<AttendanceStatusValue, number>;
    for (const g of grouped) counts[g.status] = g._count._all;
    const daysRecorded = ATTENDANCE_STATUSES.reduce((n, s) => n + counts[s], 0);
    const attended = ATTENDED_STATUSES.reduce((n, s) => n + counts[s], 0);
    return {
      counts,
      daysRecorded,
      attended,
      percentage:
        daysRecorded === 0
          ? null
          : Math.round((attended / daysRecorded) * 1000) / 10,
    };
  }

  private async assertYearAndClass(
    yearId: string,
    classId: string,
  ): Promise<void> {
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
  }

  /** results:read-all sees everything; results:read only the sections the user is class teacher of. */
  private async assertCanRead(
    yearId: string,
    sectionId: string | null,
    actor: AuthUser,
  ): Promise<void> {
    if (actor.permissions.includes('results:read-all')) return;
    if (!actor.permissions.includes('results:read'))
      throw new ForbiddenException(
        'You do not have permission to view results',
      );
    if (!sectionId)
      throw new ForbiddenException(
        'Give a sectionId: you can view the results of sections where you are the class teacher',
      );
    const own = await this.prisma.classTeacherAssignment.count({
      where: {
        academicYearId: yearId,
        sectionId,
        staff: { userId: actor.id, status: 'ACTIVE' },
      },
    });
    if (own === 0)
      throw new ForbiddenException(
        'You can only view results of sections where you are the class teacher',
      );
  }
}

/** Ranked students first (by class rank), then the unranked; ties broken by name for a stable display. */
function byRank<T extends { classRank: number | null; name: string | null }>(
  a: T,
  b: T,
): number {
  return (
    (a.classRank ?? Number.MAX_SAFE_INTEGER) -
      (b.classRank ?? Number.MAX_SAFE_INTEGER) ||
    (a.name ?? '').localeCompare(b.name ?? '')
  );
}
