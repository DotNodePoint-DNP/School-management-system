import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isoToDate, todayIso, toIsoDate } from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { EnrollmentsService } from '../students/enrollments.service.js';
import type {
  ApplyPromotionDto,
  FinalizeRollsDto,
} from './dto/promotion-apply.dto.js';
import { PromotionService } from './promotion.service.js';

type Tx = Prisma.TransactionClient;
// Short set-based transactions, but remote round trips are slow, so the limits are generous.
const TX = { maxWait: 15_000, timeout: 180_000 } as const;
const BIG = Number.MAX_SAFE_INTEGER;

export type BlockReason =
  | 'STALE_RESULT'
  | 'NOT_ENROLLED'
  | 'STUDENT_NOT_ACTIVE'
  | 'NEEDS_SECTION'
  | 'DESTINATION_INACTIVE'
  | 'ALREADY_ENROLLED_NEXT_YEAR'
  | 'SECTION_FULL'
  | 'NOT_FINAL_CLASS';

export interface Blocked {
  enrollmentId: string;
  admissionNo: string;
  reason: BlockReason;
}
export interface ChunkResult {
  sectionId: string;
  moved: number;
  graduated: number;
  blocked: Blocked[];
  optionalCarried: number;
  optionalDropped: number;
}
export interface ApplyResponse {
  status: 'DRAFT' | 'APPLYING' | 'APPLIED';
  /** Decisions not applied yet (including held students). */
  remaining: number;
  totals: {
    moved: number;
    graduated: number;
    blocked: number;
    optionalCarried: number;
    optionalDropped: number;
  };
  chunks: ChunkResult[];
  errors: { sectionId: string; message: string }[];
}

interface RunRef {
  id: string;
  fromYearId: string;
  toYearId: string;
}

@Injectable()
export class PromotionApplyService {
  private readonly logger = new Logger(PromotionApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly promotion: PromotionService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  // ---------------------------------------------------------------- apply

  /** Safe to run again: students already moved are skipped, and blocked ones are reported afresh. */
  async apply(
    fromYearId: string,
    dto: ApplyPromotionDto,
    actor: AuthUser,
  ): Promise<ApplyResponse> {
    const run = await this.promotion.findRun(fromYearId, dto.toYearId);
    if (run.status === 'APPLIED')
      throw new ConflictException(
        'This promotion plan has already been fully applied',
      );

    const [from, to] = await Promise.all([
      this.prisma.academicYear.findUniqueOrThrow({
        where: { id: run.fromYearId },
        select: { name: true, status: true, endDate: true },
      }),
      this.prisma.academicYear.findUniqueOrThrow({
        where: { id: run.toYearId },
        select: { status: true },
      }),
    ]);
    if (from.status !== 'ACTIVE')
      throw new ConflictException(
        `Promotion applies to the active academic year (this one is ${from.status.toLowerCase()})`,
      );
    if (to.status !== 'PLANNED')
      throw new ConflictException(
        `The next academic year must still be planned (this one is ${to.status.toLowerCase()})`,
      );
    const endsOn = toIsoDate(from.endDate);
    if (todayIso() < endsOn && !dto.acknowledgeEarly) {
      throw new ConflictException(
        `${from.name} does not end until ${endsOn}. Applying now completes these students' enrollments, so attendance and marks entry for them stop. Send acknowledgeEarly: true to apply anyway.`,
      );
    }
    await this.prisma.promotionRun.updateMany({
      where: { id: run.id, status: 'DRAFT' },
      data: { status: 'APPLYING' },
    });

    const pending = await this.prisma.promotionDecision.findMany({
      where: {
        runId: run.id,
        appliedAt: null,
        action: { not: 'HOLD' },
        ...(dto.classId ? { fromClassId: dto.classId } : {}),
      },
      select: { fromSectionId: true },
      distinct: ['fromSectionId'],
    });
    const sections = await this.prisma.section.findMany({
      where: { id: { in: pending.map((p) => p.fromSectionId) } },
      select: {
        id: true,
        name: true,
        schoolClass: { select: { sortOrder: true, name: true } },
      },
    });
    // Lower classes first, then by section name: a stable order, so capacity goes to the same students every time.
    sections.sort(
      (a, b) =>
        a.schoolClass.sortOrder - b.schoolClass.sortOrder ||
        a.schoolClass.name.localeCompare(b.schoolClass.name) ||
        a.name.localeCompare(b.name),
    );
    const completedOn = todayIso() < endsOn ? todayIso() : endsOn;

    const chunks: ChunkResult[] = [];
    const errors: { sectionId: string; message: string }[] = [];
    for (const section of sections) {
      try {
        chunks.push(
          await this.applyChunk(run, section.id, from.name, completedOn, actor),
        );
      } catch (error) {
        const message =
          error instanceof HttpException
            ? error.message
            : 'An unexpected error stopped this section. Run apply again.';
        if (!(error instanceof HttpException))
          this.logger.error(
            `Promotion chunk failed: ${error instanceof Error ? error.stack : String(error)}`,
          );
        errors.push({ sectionId: section.id, message });
      }
    }

    const remaining = await this.prisma.promotionDecision.count({
      where: { runId: run.id, appliedAt: null },
    });
    let status: ApplyResponse['status'] = 'APPLYING';
    if (remaining === 0 && errors.length === 0) {
      await this.prisma.promotionRun.update({
        where: { id: run.id },
        data: { status: 'APPLIED', appliedAt: new Date() },
      });
      status = 'APPLIED';
    }
    const sum = (pick: (c: ChunkResult) => number): number =>
      chunks.reduce((n, c) => n + pick(c), 0);
    return {
      status,
      remaining,
      chunks,
      errors,
      totals: {
        moved: sum((c) => c.moved),
        graduated: sum((c) => c.graduated),
        blocked: sum((c) => c.blocked.length),
        optionalCarried: sum((c) => c.optionalCarried),
        optionalDropped: sum((c) => c.optionalDropped),
      },
    };
  }

  /** One source section, in one transaction. Business problems block individual students; only surprises throw. */
  private async applyChunk(
    run: RunRef,
    sectionId: string,
    fromYearName: string,
    completedOn: string,
    actor: AuthUser,
  ): Promise<ChunkResult> {
    return this.prisma.$transaction(async (tx) => {
      // Lock order: the plan, the year ending (shared), the next year (exclusive), then the destination sections.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${run.fromYearId}:${run.toYearId}`}))`;
      const from = await this.years.lockYearShared(tx, run.fromYearId);
      if (from.status !== 'ACTIVE')
        throw new ConflictException(
          'The academic year being closed is no longer active',
        );
      const to = await this.years.lockWritableYear(tx, run.toYearId);
      if (to.status !== 'PLANNED')
        throw new ConflictException(
          'The next academic year is no longer planned',
        );

      const decisions = await tx.promotionDecision.findMany({
        where: {
          runId: run.id,
          fromSectionId: sectionId,
          appliedAt: null,
          action: { not: 'HOLD' },
        },
        select: {
          enrollmentId: true,
          fromClassId: true,
          action: true,
          toClassId: true,
          toSectionId: true,
          resultVersion: true,
          classRank: true,
          enrollment: {
            select: {
              studentId: true,
              status: true,
              student: { select: { admissionNo: true, status: true } },
            },
          },
        },
      });
      const result: ChunkResult = {
        sectionId,
        moved: 0,
        graduated: 0,
        blocked: [],
        optionalCarried: 0,
        optionalDropped: 0,
      };
      const first = decisions[0];
      if (!first) return result;
      type Decision = (typeof decisions)[number];
      const block = (d: Decision, reason: BlockReason): void => {
        result.blocked.push({
          enrollmentId: d.enrollmentId,
          admissionNo: d.enrollment.student.admissionNo,
          reason,
        });
      };

      const [latest, fromClass] = await Promise.all([
        this.promotion.latestRuns(tx, run.fromYearId, [first.fromClassId]),
        tx.schoolClass.findUniqueOrThrow({
          where: { id: first.fromClassId },
          select: { nextClassId: true },
        }),
      ]);
      const version = latest.get(first.fromClassId)?.version ?? 0;

      const ok: Decision[] = [];
      for (const d of decisions) {
        if ((d.resultVersion ?? 0) !== version) block(d, 'STALE_RESULT');
        else if (d.enrollment.status !== 'ENROLLED') block(d, 'NOT_ENROLLED');
        else if (d.enrollment.student.status !== 'ACTIVE')
          block(d, 'STUDENT_NOT_ACTIVE');
        else if (d.action === 'GRADUATE' && fromClass.nextClassId !== null)
          block(d, 'NOT_FINAL_CLASS');
        else if (
          (d.action === 'PROMOTE' || d.action === 'REPEAT') &&
          !d.toSectionId
        )
          block(d, 'NEEDS_SECTION');
        else ok.push(d);
      }
      const graduates = ok.filter((d) => d.action === 'GRADUATE');
      const movers = ok.filter((d) => d.action !== 'GRADUATE');

      // Destination sections: lock, then count seats. Students already enrolled in the next year are a clash.
      const destIds = [
        ...new Set(movers.map((d) => d.toSectionId as string)),
      ].sort();
      const locked =
        destIds.length === 0
          ? []
          : await tx.$queryRaw<
              {
                id: string;
                classId: string;
                isActive: boolean;
                capacity: number | null;
                classActive: boolean;
              }[]
            >`
            SELECT s.id, s.class_id AS "classId", s.is_active AS "isActive", s.capacity, c.is_active AS "classActive"
            FROM sections s JOIN classes c ON c.id = s.class_id
            WHERE s.id IN (${Prisma.join(destIds.map((id) => Prisma.sql`${id}::uuid`))})
            ORDER BY s.id FOR UPDATE OF s`;
      const [taken, clashes] = await Promise.all([
        destIds.length === 0
          ? Promise.resolve([])
          : tx.enrollment.groupBy({
              by: ['sectionId'],
              where: {
                academicYearId: run.toYearId,
                sectionId: { in: destIds },
                status: 'ENROLLED',
              },
              _count: { _all: true },
            }),
        movers.length === 0
          ? Promise.resolve([])
          : tx.enrollment.findMany({
              where: {
                academicYearId: run.toYearId,
                studentId: { in: movers.map((d) => d.enrollment.studentId) },
              },
              select: { studentId: true },
            }),
      ]);
      const clash = new Set(clashes.map((c) => c.studentId));
      const sectionBy = new Map(locked.map((s) => [s.id, s] as const));
      const seats = new Map(
        locked.map(
          (s) =>
            [
              s.id,
              s.capacity === null
                ? Infinity
                : s.capacity -
                  (taken.find((t) => t.sectionId === s.id)?._count._all ?? 0),
            ] as const,
        ),
      );

      const accepted: Decision[] = [];
      for (const d of [...movers].sort(
        (a, b) => (a.classRank ?? BIG) - (b.classRank ?? BIG),
      )) {
        const s = sectionBy.get(d.toSectionId as string);
        if (!s || !s.isActive || !s.classActive || s.classId !== d.toClassId)
          block(d, 'DESTINATION_INACTIVE');
        else if (clash.has(d.enrollment.studentId))
          block(d, 'ALREADY_ENROLLED_NEXT_YEAR');
        else if ((seats.get(s.id) ?? 0) <= 0) block(d, 'SECTION_FULL');
        else {
          seats.set(s.id, (seats.get(s.id) ?? 0) - 1);
          accepted.push(d);
        }
      }

      // ---- writes, all set-based
      const newIds = new Map(
        accepted.map((d) => [d.enrollmentId, randomUUID()] as const),
      );
      if (accepted.length > 0) {
        await tx.enrollment.createMany({
          data: accepted.map((d) => ({
            id: newIds.get(d.enrollmentId) as string,
            studentId: d.enrollment.studentId,
            academicYearId: run.toYearId,
            classId: d.toClassId as string,
            sectionId: d.toSectionId as string,
            status: 'ENROLLED' as const,
          })),
        });
      }
      const completeIds = [...accepted, ...graduates].map(
        (d) => d.enrollmentId,
      );
      if (completeIds.length > 0) {
        const done = await tx.enrollment.updateMany({
          where: { id: { in: completeIds }, status: 'ENROLLED' },
          data: {
            status: 'COMPLETED',
            statusChangedOn: isoToDate(completedOn),
          },
        });
        if (done.count !== completeIds.length)
          throw new ConflictException(
            'Some students changed while the promotion was running. Run it again.',
          );
      }
      if (graduates.length > 0) {
        const done = await tx.student.updateMany({
          where: {
            id: { in: graduates.map((d) => d.enrollment.studentId) },
            status: 'ACTIVE',
          },
          data: {
            status: 'GRADUATED',
            statusChangedOn: isoToDate(completedOn),
            statusNote: `Graduated at the end of ${fromYearName}`,
          },
        });
        if (done.count !== graduates.length)
          throw new ConflictException(
            'Some students changed while the promotion was running. Run it again.',
          );
      }

      // Optional subjects follow the student where the next class offers them; compulsory ones need no choice.
      if (accepted.length > 0) {
        const old = await tx.studentSubjectChoice.findMany({
          where: { enrollmentId: { in: accepted.map((d) => d.enrollmentId) } },
          select: { enrollmentId: true, subjectId: true },
        });
        if (old.length > 0) {
          const destClasses = [
            ...new Set(accepted.map((d) => d.toClassId as string)),
          ];
          const offered = await tx.classSubject.findMany({
            where: {
              academicYearId: run.toYearId,
              classId: { in: destClasses },
            },
            select: { classId: true, subjectId: true, isCompulsory: true },
          });
          const optional = new Set(
            offered
              .filter((o) => !o.isCompulsory)
              .map((o) => `${o.classId}:${o.subjectId}`),
          );
          const compulsory = new Set(
            offered
              .filter((o) => o.isCompulsory)
              .map((o) => `${o.classId}:${o.subjectId}`),
          );
          const byOld = new Map(
            accepted.map((d) => [d.enrollmentId, d] as const),
          );
          const rows: {
            enrollmentId: string;
            subjectId: string;
            academicYearId: string;
            classId: string;
          }[] = [];
          for (const choice of old) {
            const d = byOld.get(choice.enrollmentId) as Decision;
            const key = `${d.toClassId}:${choice.subjectId}`;
            if (optional.has(key)) {
              rows.push({
                enrollmentId: newIds.get(choice.enrollmentId) as string,
                subjectId: choice.subjectId,
                academicYearId: run.toYearId,
                classId: d.toClassId as string,
              });
            } else if (!compulsory.has(key)) {
              result.optionalDropped += 1; // the next class does not offer it: the clerk chooses again
            }
          }
          if (rows.length > 0)
            await tx.studentSubjectChoice.createMany({ data: rows });
          result.optionalCarried = rows.length;
        }
      }

      if (accepted.length > 0) {
        const values = Prisma.join(
          accepted.map(
            (d) =>
              Prisma.sql`(${d.enrollmentId}::uuid, ${newIds.get(d.enrollmentId) as string}::uuid)`,
          ),
        );
        await tx.$executeRaw`
          UPDATE promotion_decisions AS d
          SET new_enrollment_id = v.new_id, applied_at = now(), updated_at = now()
          FROM (VALUES ${values}) AS v(old_id, new_id)
          WHERE d.run_id = ${run.id}::uuid AND d.enrollment_id = v.old_id`;
      }
      if (graduates.length > 0) {
        await tx.promotionDecision.updateMany({
          where: {
            runId: run.id,
            enrollmentId: { in: graduates.map((d) => d.enrollmentId) },
          },
          data: { appliedAt: new Date() },
        });
      }

      result.moved = accepted.length;
      result.graduated = graduates.length;
      if (result.moved + result.graduated + result.blocked.length > 0) {
        // Counts only: no names in the audit log.
        await this.audit.recordIn(tx, {
          actor,
          action: 'promotion.applied',
          entityType: 'promotion_run',
          entityId: run.id,
          details: {
            sectionId,
            moved: result.moved,
            graduated: result.graduated,
            blocked: result.blocked.length,
            optionalCarried: result.optionalCarried,
            optionalDropped: result.optionalDropped,
          },
        });
      }
      return result;
    }, TX);
  }

  // ---------------------------------------------------------------- roll numbers

  /**
   * Gives every new section its roll numbers: promoted students by their previous class rank, then repeaters by rank,
   * then everyone else (pre-registered or admitted later) in their existing order. Repeatable: it recomputes the same order.
   */
  async finalizeRolls(
    fromYearId: string,
    dto: FinalizeRollsDto,
    actor: AuthUser,
  ) {
    const run = await this.promotion.findRun(fromYearId, dto.toYearId);
    const targets = await this.prisma.promotionDecision.findMany({
      where: {
        runId: run.id,
        appliedAt: { not: null },
        toSectionId: dto.sectionId ?? { not: null },
      },
      select: { toSectionId: true },
      distinct: ['toSectionId'],
    });
    if (targets.length === 0)
      throw new NotFoundException(
        dto.sectionId
          ? 'No moved students were placed in that section'
          : 'No students have been moved yet',
      );

    const sections: {
      sectionId: string;
      sectionName: string;
      className: string;
      students: number;
    }[] = [];
    for (const { toSectionId } of targets) {
      const sectionId = toSectionId as string;
      sections.push(
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${run.fromYearId}:${run.toYearId}`}))`;
          await this.years.lockWritableYear(tx, run.toYearId); // rejects a closed year
          await this.enrollments.lockSection(tx, sectionId);

          const current = await tx.enrollment.findMany({
            where: {
              academicYearId: run.toYearId,
              sectionId,
              status: 'ENROLLED',
            },
            select: {
              id: true,
              rollNo: true,
              createdAt: true,
              student: {
                select: { firstName: true, middleName: true, lastName: true },
              },
            },
          });
          const planned = await tx.promotionDecision.findMany({
            where: {
              runId: run.id,
              newEnrollmentId: { in: current.map((e) => e.id) },
            },
            select: { newEnrollmentId: true, action: true, classRank: true },
          });
          const planBy = new Map(
            planned.map((p) => [p.newEnrollmentId as string, p] as const),
          );
          const group = (id: string): number =>
            planBy.get(id)?.action === 'PROMOTE'
              ? 0
              : planBy.get(id)?.action === 'REPEAT'
                ? 1
                : 2;
          const name = (e: (typeof current)[number]): string =>
            displayName(e.student);
          const ordered = [...current].sort((a, b) => {
            const ga = group(a.id);
            const gb = group(b.id);
            if (ga !== gb) return ga - gb;
            if (ga < 2) {
              const diff =
                (planBy.get(a.id)?.classRank ?? BIG) -
                (planBy.get(b.id)?.classRank ?? BIG);
              return diff !== 0 ? diff : name(a).localeCompare(name(b));
            }
            const byRoll = (a.rollNo ?? BIG) - (b.rollNo ?? BIG);
            return byRoll !== 0
              ? byRoll
              : a.createdAt.getTime() - b.createdAt.getTime() ||
                  name(a).localeCompare(name(b));
          });
          if (ordered.length > 0)
            await this.enrollments.applyRollOrder(
              tx,
              run.toYearId,
              sectionId,
              ordered.map((e) => e.id),
            );

          const info = await tx.section.findUniqueOrThrow({
            where: { id: sectionId },
            select: { name: true, schoolClass: { select: { name: true } } },
          });
          await this.audit.recordIn(tx, {
            actor,
            action: 'promotion.rolls_assigned',
            entityType: 'section',
            entityId: sectionId,
            details: { students: ordered.length },
          });
          return {
            sectionId,
            sectionName: info.name,
            className: info.schoolClass.name,
            students: ordered.length,
          };
        }, TX),
      );
    }
    return { sections };
  }

  // ---------------------------------------------------------------- undo

  /** Moves one student back. Only while the next year is still planned and nothing depends on the new enrollment. */
  async undo(
    fromYearId: string,
    enrollmentId: string,
    actor: AuthUser,
    toYearId?: string,
  ) {
    const run = await this.promotion.findRun(fromYearId, toYearId);
    const action = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${run.fromYearId}:${run.toYearId}`}))`;
      const from = await this.years.lockYearShared(tx, run.fromYearId);
      if (from.status !== 'ACTIVE')
        throw new ConflictException(
          'That academic year is closed, so moves can no longer be undone here',
        );
      const to = await this.years.lockWritableYear(tx, run.toYearId);
      if (to.status !== 'PLANNED')
        throw new ConflictException(
          'Undo is only possible while the next academic year is still planned',
        );

      const dec = await tx.promotionDecision.findUnique({
        where: { runId_enrollmentId: { runId: run.id, enrollmentId } },
      });
      if (!dec)
        throw new NotFoundException(
          'This student is not part of the promotion plan',
        );
      if (!dec.appliedAt)
        throw new ConflictException('This student has not been moved yet');
      const key = { runId_enrollmentId: { runId: run.id, enrollmentId } };

      if (dec.action === 'GRADUATE') {
        const old = await tx.enrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
          select: { studentId: true },
        });
        const reverted = await tx.student.updateMany({
          where: { id: old.studentId, status: 'GRADUATED' },
          data: { status: 'ACTIVE', statusChangedOn: null, statusNote: null },
        });
        if (reverted.count !== 1)
          throw new ConflictException(
            "This student's status was changed after graduating, so it cannot be undone here",
          );
        await tx.promotionDecision.update({
          where: key,
          data: { appliedAt: null },
        });
      } else {
        const newId = dec.newEnrollmentId as string;
        const [attendance, marks, remarks] = await Promise.all([
          tx.attendanceRecord.count({ where: { enrollmentId: newId } }),
          tx.mark.count({ where: { enrollmentId: newId } }),
          tx.reportRemark.count({ where: { enrollmentId: newId } }),
        ]);
        if (attendance + marks + remarks > 0)
          throw new ConflictException(
            'The new enrollment already has attendance, marks or remarks, so it cannot be undone',
          );
        await tx.promotionDecision.update({
          where: key,
          data: { newEnrollmentId: null, appliedAt: null },
        });
        await tx.enrollment.delete({ where: { id: newId } }); // its optional-subject choices go with it
      }

      const restored = await tx.enrollment.updateMany({
        where: { id: enrollmentId, status: 'COMPLETED' },
        data: { status: 'ENROLLED', statusChangedOn: null },
      });
      if (restored.count !== 1)
        throw new ConflictException(
          'The original enrollment is not in a state that can be restored',
        );
      await tx.promotionRun.updateMany({
        where: { id: run.id, status: 'APPLIED' },
        data: { status: 'APPLYING', appliedAt: null },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'promotion.undone',
        entityType: 'promotion_run',
        entityId: run.id,
        details: { was: dec.action },
      });
      return dec.action;
    }, TX);
    return { enrollmentId, undone: action };
  }
}
