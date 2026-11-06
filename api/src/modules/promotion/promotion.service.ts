import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { todayIso, toIsoDate } from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  BuildProposalDto,
  UpdateDecisionDto,
} from './dto/promotion.dto.js';

type Tx = Prisma.TransactionClient;
// Remote database round trips are slow, so plans get generous transaction limits.
const TX = { maxWait: 15_000, timeout: 180_000 } as const;

export type PromotionActionValue = 'PROMOTE' | 'REPEAT' | 'GRADUATE' | 'HOLD';
type ResultStatusValue = 'PASS' | 'FAIL' | 'INCOMPLETE';

/** The default outcome for a result. It is a starting point only: any student can be changed by hand, with a note. */
export function proposedAction(
  status: ResultStatusValue | null,
  hasNextClass: boolean,
): PromotionActionValue {
  if (status === 'PASS') return hasNextClass ? 'PROMOTE' : 'GRADUATE';
  if (status === 'FAIL') return 'REPEAT';
  return 'HOLD'; // incomplete, or no published result
}

export interface ReadinessItem {
  code: string;
  blocking: boolean;
  classId: string | null;
  sectionId: string | null;
  message: string;
}
interface ClassCounts {
  promote: number;
  repeat: number;
  graduate: number;
  hold: number;
  applied: number;
  needsSection: number;
  stale: number;
}

export interface PromotionSummary {
  run: {
    id: string;
    status: 'DRAFT' | 'APPLYING' | 'APPLIED';
    fromYear: { id: string; name: string };
    toYear: { id: string; name: string };
    createdAt: string;
    appliedAt: string | null;
  };
  totals: {
    students: number;
    promote: number;
    repeat: number;
    graduate: number;
    hold: number;
    applied: number;
    needsSection: number;
    stale: number;
  };
  classes: {
    classId: string;
    className: string;
    sortOrder: number;
    nextClass: { id: string; name: string } | null;
    resultVersion: number | null;
    stale: boolean;
    counts: Omit<ClassCounts, 'stale'>;
  }[];
  readiness: ReadinessItem[];
  /** Present only in the response to building or refreshing the plan. */
  refresh?: {
    students: number;
    created: number;
    manualKept: number;
    resultChanged: number;
    removed: number;
  };
}

const DECISION_SELECT = {
  enrollmentId: true,
  fromClassId: true,
  fromSectionId: true,
  action: true,
  basis: true,
  resultStatus: true,
  percentage: true,
  classRank: true,
  sectionRank: true,
  resultVersion: true,
  note: true,
  appliedAt: true,
  enrollment: {
    select: {
      rollNo: true,
      section: { select: { id: true, name: true } },
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
  },
  toClass: { select: { id: true, name: true } },
  toSection: { select: { id: true, name: true } },
} satisfies Prisma.PromotionDecisionSelect;
type DecisionRow = Prisma.PromotionDecisionGetPayload<{
  select: typeof DECISION_SELECT;
}>;

interface Fresh {
  enrollmentId: string;
  fromClassId: string;
  fromSectionId: string;
  sectionName: string;
  action: PromotionActionValue;
  toClassId: string | null;
  toSectionId: string | null;
  resultStatus: ResultStatusValue | null;
  percentage: number | null;
  classRank: number | null;
  sectionRank: number | null;
  resultVersion: number | null;
}

@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
  ) {}

  // ---------------------------------------------------------------- build or refresh the plan

  async propose(
    fromYearId: string,
    dto: BuildProposalDto,
    actor: AuthUser,
  ): Promise<PromotionSummary> {
    if (fromYearId === dto.toYearId)
      throw new BadRequestException(
        'The next academic year must be a different year',
      );

    const refresh = await this.prisma.$transaction(async (tx) => {
      const from = await this.years.lockYearShared(tx, fromYearId);
      const to = await this.years.lockYearShared(tx, dto.toYearId);
      if (from.status !== 'ACTIVE') {
        throw new ConflictException(
          `A promotion plan is built from the active academic year (this one is ${from.status.toLowerCase()})`,
        );
      }
      if (to.status !== 'PLANNED') {
        throw new ConflictException(
          `The next academic year must still be planned (this one is ${to.status.toLowerCase()})`,
        );
      }
      if (toIsoDate(to.startDate) <= toIsoDate(from.endDate)) {
        throw new BadRequestException(
          'The next academic year must start after this one ends',
        );
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${fromYearId}:${dto.toYearId}`}))`;

      let run = await tx.promotionRun.findUnique({
        where: { fromYearId_toYearId: { fromYearId, toYearId: dto.toYearId } },
      });
      if (run?.status === 'APPLIED')
        throw new ConflictException(
          'This promotion plan has already been applied',
        );
      run ??= await tx.promotionRun.create({
        data: { fromYearId, toYearId: dto.toYearId, createdById: actor.id },
      });

      // Everyone currently enrolled in the year that is ending.
      const enrollments = await tx.enrollment.findMany({
        where: { academicYearId: fromYearId, status: 'ENROLLED' },
        select: {
          id: true,
          classId: true,
          sectionId: true,
          section: { select: { name: true } },
        },
      });
      const classIds = [...new Set(enrollments.map((e) => e.classId))];
      const [classes, latest] = await Promise.all([
        tx.schoolClass.findMany({
          where: { id: { in: classIds } },
          select: {
            id: true,
            nextClassId: true,
            nextClass: { select: { isActive: true } },
          },
        }),
        this.latestRuns(tx, fromYearId, classIds),
      ]);
      const rows =
        latest.size === 0
          ? []
          : await tx.resultRow.findMany({
              where: { runId: { in: [...latest.values()].map((r) => r.id) } },
              select: {
                runId: true,
                enrollmentId: true,
                status: true,
                percentage: true,
                classRank: true,
                sectionRank: true,
              },
            });
      const rowBy = new Map(
        rows.map((r) => [`${r.runId}:${r.enrollmentId}`, r] as const),
      );
      const classBy = new Map(classes.map((c) => [c.id, c] as const));

      const fresh: Fresh[] = enrollments.map((e) => {
        const cls = classBy.get(e.classId);
        const result = latest.get(e.classId);
        const row = result ? rowBy.get(`${result.id}:${e.id}`) : undefined;
        const status = row?.status ?? null;
        let action = proposedAction(status, cls?.nextClassId != null);
        let toClassId: string | null = null;
        if (action === 'PROMOTE') {
          if (cls?.nextClass?.isActive) toClassId = cls.nextClassId;
          else action = 'HOLD'; // the next class is inactive: shown as a warning, nothing is moved
        }
        if (action === 'REPEAT') toClassId = e.classId;
        return {
          enrollmentId: e.id,
          fromClassId: e.classId,
          fromSectionId: e.sectionId,
          sectionName: e.section.name,
          action,
          toClassId,
          toSectionId: null,
          resultStatus: status,
          percentage: row?.percentage?.toNumber() ?? null,
          classRank: row?.classRank ?? null,
          sectionRank: row?.sectionRank ?? null,
          resultVersion: result?.version ?? null,
        };
      });

      // Destination section: the active section with the same name, if the destination class has one.
      const destIds = [
        ...new Set(fresh.flatMap((f) => (f.toClassId ? [f.toClassId] : []))),
      ];
      const sections =
        destIds.length === 0
          ? []
          : await tx.section.findMany({
              where: { classId: { in: destIds }, isActive: true },
              select: { id: true, classId: true, name: true },
            });
      const sectionBy = new Map(
        sections.map(
          (s) => [`${s.classId}:${s.name.toLowerCase()}`, s.id] as const,
        ),
      );
      for (const f of fresh)
        if (f.toClassId)
          f.toSectionId =
            sectionBy.get(`${f.toClassId}:${f.sectionName.toLowerCase()}`) ??
            null;

      // Already-moved students are never touched. Manual decisions are kept (only their result pins refresh).
      // Everything else, which came from results, is regenerated.
      const existing = await tx.promotionDecision.findMany({
        where: { runId: run.id },
        select: {
          enrollmentId: true,
          basis: true,
          appliedAt: true,
          resultStatus: true,
          percentage: true,
        },
      });
      const eligible = new Set(enrollments.map((e) => e.id));
      const applied = new Set(
        existing.filter((d) => d.appliedAt).map((d) => d.enrollmentId),
      );
      const manual = new Map(
        existing
          .filter(
            (d) =>
              !d.appliedAt &&
              d.basis === 'MANUAL' &&
              eligible.has(d.enrollmentId),
          )
          .map((d) => [d.enrollmentId, d] as const),
      );
      const removed = existing.filter(
        (d) => !d.appliedAt && !eligible.has(d.enrollmentId),
      ).length;

      await tx.promotionDecision.deleteMany({
        where: {
          runId: run.id,
          appliedAt: null,
          OR: [{ basis: 'RESULT' }, { enrollmentId: { notIn: [...eligible] } }],
        },
      });
      const toCreate = fresh.filter(
        (f) => !applied.has(f.enrollmentId) && !manual.has(f.enrollmentId),
      );
      if (toCreate.length > 0) {
        await tx.promotionDecision.createMany({
          data: toCreate.map((f) => ({
            runId: run.id,
            enrollmentId: f.enrollmentId,
            fromClassId: f.fromClassId,
            fromSectionId: f.fromSectionId,
            action: f.action,
            basis: 'RESULT' as const,
            toClassId: f.toClassId,
            toSectionId: f.toSectionId,
            resultStatus: f.resultStatus,
            percentage: f.percentage,
            classRank: f.classRank,
            sectionRank: f.sectionRank,
            resultVersion: f.resultVersion,
          })),
        });
      }

      let resultChanged = 0;
      for (const f of fresh) {
        const old = manual.get(f.enrollmentId);
        if (!old) continue;
        if (
          old.resultStatus !== f.resultStatus ||
          (old.percentage?.toNumber() ?? null) !== f.percentage
        )
          resultChanged += 1;
        await tx.promotionDecision.update({
          where: {
            runId_enrollmentId: { runId: run.id, enrollmentId: f.enrollmentId },
          },
          data: {
            resultStatus: f.resultStatus,
            percentage: f.percentage,
            classRank: f.classRank,
            sectionRank: f.sectionRank,
            resultVersion: f.resultVersion,
          },
        });
      }
      await tx.promotionRun.update({ where: { id: run.id }, data: {} }); // bumps updatedAt
      return {
        students: enrollments.length,
        created: toCreate.length,
        manualKept: manual.size,
        resultChanged,
        removed,
      };
    }, TX);

    // Counts only: no names and no notes in the audit log.
    await this.audit.record({
      actor,
      action: 'promotion.proposed',
      entityType: 'academic_year',
      entityId: fromYearId,
      details: { toYearId: dto.toYearId, ...refresh },
    });
    return { ...(await this.summary(fromYearId, dto.toYearId)), refresh };
  }

  // ---------------------------------------------------------------- read the plan

  async summary(
    fromYearId: string,
    toYearId?: string,
  ): Promise<PromotionSummary> {
    const run = await this.findRun(fromYearId, toYearId);
    const [fromYear, toYear, decisions] = await Promise.all([
      this.prisma.academicYear.findUniqueOrThrow({
        where: { id: run.fromYearId },
        select: { id: true, name: true, endDate: true },
      }),
      this.prisma.academicYear.findUniqueOrThrow({
        where: { id: run.toYearId },
        select: { id: true, name: true },
      }),
      this.prisma.promotionDecision.findMany({
        where: { runId: run.id },
        select: {
          fromClassId: true,
          action: true,
          toClassId: true,
          toSectionId: true,
          appliedAt: true,
          resultVersion: true,
        },
      }),
    ]);

    const fromIds = [...new Set(decisions.map((d) => d.fromClassId))];
    const destIds = [
      ...new Set(decisions.flatMap((d) => (d.toClassId ? [d.toClassId] : []))),
    ];
    const classes = await this.prisma.schoolClass.findMany({
      where: { id: { in: [...new Set([...fromIds, ...destIds])] } },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        nextClassId: true,
        nextClass: { select: { id: true, name: true, isActive: true } },
      },
    });
    const latest = await this.latestRuns(this.prisma, run.fromYearId, fromIds);
    const sections =
      destIds.length === 0
        ? []
        : await this.prisma.section.findMany({
            where: { classId: { in: destIds }, isActive: true },
            select: {
              id: true,
              name: true,
              classId: true,
              capacity: true,
              _count: {
                select: {
                  enrollments: {
                    where: { academicYearId: run.toYearId, status: 'ENROLLED' },
                  },
                },
              },
              classTeacherAssignments: {
                where: { academicYearId: run.toYearId },
                select: { staffId: true },
              },
            },
          });
    const curriculum =
      destIds.length === 0
        ? []
        : await this.prisma.classSubject.groupBy({
            by: ['classId'],
            where: { academicYearId: run.toYearId, classId: { in: destIds } },
            _count: { _all: true },
          });

    const classBy = new Map(classes.map((c) => [c.id, c] as const));
    const counts = new Map<string, ClassCounts>(
      fromIds.map(
        (id) =>
          [
            id,
            {
              promote: 0,
              repeat: 0,
              graduate: 0,
              hold: 0,
              applied: 0,
              needsSection: 0,
              stale: 0,
            },
          ] as const,
      ),
    );
    const incomingByClass = new Map<string, number>();
    const incomingBySection = new Map<string, number>();

    for (const d of decisions) {
      const c = counts.get(d.fromClassId) as ClassCounts;
      if (d.action === 'PROMOTE') c.promote += 1;
      else if (d.action === 'REPEAT') c.repeat += 1;
      else if (d.action === 'GRADUATE') c.graduate += 1;
      else c.hold += 1;
      if (d.appliedAt) {
        c.applied += 1;
        continue;
      }
      if ((d.action === 'PROMOTE' || d.action === 'REPEAT') && d.toClassId) {
        if (d.toSectionId === null) c.needsSection += 1;
        else
          incomingBySection.set(
            d.toSectionId,
            (incomingBySection.get(d.toSectionId) ?? 0) + 1,
          );
        incomingByClass.set(
          d.toClassId,
          (incomingByClass.get(d.toClassId) ?? 0) + 1,
        );
      }
      if ((d.resultVersion ?? 0) !== (latest.get(d.fromClassId)?.version ?? 0))
        c.stale += 1;
    }

    const readiness: ReadinessItem[] = [];
    const flag = (
      code: string,
      blocking: boolean,
      message: string,
      classId: string | null = null,
      sectionId: string | null = null,
    ): void => {
      readiness.push({ code, blocking, classId, sectionId, message });
    };
    const className = (id: string): string => classBy.get(id)?.name ?? id;

    if (todayIso() < toIsoDate(fromYear.endDate)) {
      flag(
        'EARLY',
        false,
        `${fromYear.name} ends on ${toIsoDate(fromYear.endDate)}. Applying earlier completes these students' enrollments, so attendance and marks entry for them stop.`,
      );
    }
    for (const id of fromIds) {
      const c = counts.get(id) as ClassCounts;
      const cls = classBy.get(id);
      if (!latest.has(id))
        flag(
          'NO_RESULT',
          false,
          `${className(id)} has no published combined result, so its students are held until results are published.`,
          id,
        );
      if (c.stale > 0)
        flag(
          'STALE_RESULT',
          true,
          `${className(id)}: results changed after this plan was built for ${c.stale} student(s). Refresh the plan.`,
          id,
        );
      if (c.needsSection > 0)
        flag(
          'NEEDS_SECTION',
          true,
          `${className(id)}: ${c.needsSection} student(s) have no destination section. Choose one for each.`,
          id,
        );
      if (cls?.nextClass && !cls.nextClass.isActive)
        flag(
          'NEXT_CLASS_INACTIVE',
          false,
          `${className(id)}'s next class "${cls.nextClass.name}" is inactive, so passing students are held.`,
          id,
        );
    }
    const curriculumBy = new Map(
      curriculum.map((c) => [c.classId, c._count._all] as const),
    );
    for (const [classId, incoming] of incomingByClass) {
      if (incoming > 0 && !curriculumBy.has(classId))
        flag(
          'NO_CURRICULUM',
          false,
          `${className(classId)} has no curriculum in ${toYear.name}. Copy it from the previous year.`,
          classId,
        );
    }
    for (const s of sections) {
      const incoming = incomingBySection.get(s.id) ?? 0;
      if (incoming === 0) continue;
      const label = `${className(s.classId)} ${s.name}`;
      if (s.capacity !== null && s._count.enrollments + incoming > s.capacity) {
        flag(
          'OVER_CAPACITY',
          true,
          `${label} has ${s.capacity} seat(s), ${s._count.enrollments} taken and ${incoming} incoming.`,
          s.classId,
          s.id,
        );
      }
      if (s.classTeacherAssignments.length === 0)
        flag(
          'NO_CLASS_TEACHER',
          false,
          `${label} has no class teacher in ${toYear.name}.`,
          s.classId,
          s.id,
        );
    }

    const all = [...counts.values()];
    const sum = (pick: (c: ClassCounts) => number): number =>
      all.reduce((n, c) => n + pick(c), 0);
    return {
      run: {
        id: run.id,
        status: run.status,
        fromYear: { id: fromYear.id, name: fromYear.name },
        toYear: { id: toYear.id, name: toYear.name },
        createdAt: run.createdAt.toISOString(),
        appliedAt: run.appliedAt?.toISOString() ?? null,
      },
      totals: {
        students: decisions.length,
        promote: sum((c) => c.promote),
        repeat: sum((c) => c.repeat),
        graduate: sum((c) => c.graduate),
        hold: sum((c) => c.hold),
        applied: sum((c) => c.applied),
        needsSection: sum((c) => c.needsSection),
        stale: sum((c) => c.stale),
      },
      classes: fromIds
        .map((id) => {
          const cls = classBy.get(id);
          const { stale, ...rest } = counts.get(id) as ClassCounts;
          return {
            classId: id,
            className: cls?.name ?? id,
            sortOrder: cls?.sortOrder ?? 0,
            nextClass: cls?.nextClass
              ? { id: cls.nextClass.id, name: cls.nextClass.name }
              : null,
            resultVersion: latest.get(id)?.version ?? null,
            stale: stale > 0,
            counts: rest,
          };
        })
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.className.localeCompare(b.className),
        ),
      readiness,
    };
  }

  /** Every student of one class, with the result behind the proposal and where they would go. */
  async classDecisions(
    fromYearId: string,
    classId: string,
    q: { toYearId?: string; sectionId?: string; order?: 'RANK' | 'ROLL' },
  ) {
    const run = await this.findRun(fromYearId, q.toYearId);
    const cls = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: {
        id: true,
        name: true,
        nextClass: { select: { id: true, name: true } },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const students = await this.rows(
      run.id,
      run.fromYearId,
      {
        fromClassId: classId,
        ...(q.sectionId ? { fromSectionId: q.sectionId } : {}),
      },
      q.order ?? 'RANK',
    );
    return {
      runId: run.id,
      status: run.status,
      class: { id: cls.id, name: cls.name, nextClass: cls.nextClass },
      students,
    };
  }

  // ---------------------------------------------------------------- edit one student's outcome

  async updateDecision(
    fromYearId: string,
    enrollmentId: string,
    dto: UpdateDecisionDto,
    actor: AuthUser,
    toYearId?: string,
  ) {
    const run = await this.findRun(fromYearId, toYearId);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${run.fromYearId}:${run.toYearId}`}))`;
      const state = await tx.promotionRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true },
      });
      if (state.status === 'APPLIED')
        throw new ConflictException(
          'This promotion plan has already been applied',
        );
      const dec = await tx.promotionDecision.findUnique({
        where: { runId_enrollmentId: { runId: run.id, enrollmentId } },
      });
      if (!dec)
        throw new NotFoundException(
          'This student is not part of the promotion plan',
        );
      if (dec.appliedAt)
        throw new ConflictException(
          'This student has already been moved. Undo that first to change the outcome.',
        );

      const fromClass = await tx.schoolClass.findUniqueOrThrow({
        where: { id: dec.fromClassId },
        select: { nextClassId: true },
      });
      const action = dto.action ?? dec.action;
      let toClassId: string | null = null;

      if (action === 'HOLD' || action === 'GRADUATE') {
        if (
          dto.toClassId !== undefined ||
          (dto.toSectionId !== undefined && dto.toSectionId !== null)
        ) {
          throw new BadRequestException(
            `A student who is ${action === 'HOLD' ? 'held' : 'graduating'} has no destination class or section`,
          );
        }
        if (action === 'GRADUATE' && fromClass.nextClassId !== null) {
          throw new BadRequestException(
            'Only students of a final class can graduate. Promote this student, or give the class no next class.',
          );
        }
      } else if (action === 'REPEAT') {
        if (dto.toClassId !== undefined && dto.toClassId !== dec.fromClassId)
          throw new BadRequestException(
            'A student who repeats stays in the same class',
          );
        toClassId = dec.fromClassId;
      } else {
        toClassId =
          dto.toClassId ??
          (dec.action === 'PROMOTE' ? dec.toClassId : fromClass.nextClassId);
        if (!toClassId)
          throw new BadRequestException(
            'This class has no next class. Choose the destination class (toClassId).',
          );
        if (toClassId === dec.fromClassId)
          throw new BadRequestException(
            'Promoting moves the student to a different class. Use REPEAT to stay in this class.',
          );
      }

      let toSectionId: string | null = null;
      if (toClassId) {
        const dest = await tx.schoolClass.findUnique({
          where: { id: toClassId },
          select: { isActive: true },
        });
        if (!dest)
          throw new BadRequestException('The destination class does not exist');
        if (!dest.isActive)
          throw new ConflictException('The destination class is inactive');

        if (dto.toSectionId === undefined) {
          toSectionId =
            toClassId === dec.toClassId
              ? dec.toSectionId
              : await this.sameNameSection(tx, toClassId, dec.fromSectionId);
        } else if (dto.toSectionId !== null) {
          const section = await tx.section.findFirst({
            where: { id: dto.toSectionId, classId: toClassId, isActive: true },
            select: { id: true },
          });
          if (!section)
            throw new BadRequestException(
              'Choose an active section of the destination class',
            );
          toSectionId = section.id;
        }
      }

      // Overriding what the results suggest needs a reason.
      const note =
        dto.note === undefined
          ? dec.note
          : dto.note === null || dto.note === ''
            ? null
            : dto.note;
      const suggested = proposedAction(
        dec.resultStatus,
        fromClass.nextClassId !== null,
      );
      if (action !== suggested && (!note || note.length < 10)) {
        throw new BadRequestException(
          `The results suggest ${suggested}. Add a note of at least 10 characters to choose ${action} instead.`,
        );
      }
      if (
        action === dec.action &&
        toClassId === dec.toClassId &&
        toSectionId === dec.toSectionId &&
        note === dec.note
      ) {
        throw new BadRequestException('Nothing to change');
      }

      await tx.promotionDecision.update({
        where: { runId_enrollmentId: { runId: run.id, enrollmentId } },
        data: { action, toClassId, toSectionId, note, basis: 'MANUAL' },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'promotion.decision_changed',
        entityType: 'promotion_run',
        entityId: run.id,
        details: { from: dec.action, to: action },
      });
    }, TX);

    const [row] = await this.rows(
      run.id,
      run.fromYearId,
      { enrollmentId },
      'ROLL',
    );
    return row;
  }

  // ---------------------------------------------------------------- internals

  async findRun(fromYearId: string, toYearId?: string) {
    const run = await this.prisma.promotionRun.findFirst({
      where: { fromYearId, ...(toYearId ? { toYearId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (!run)
      throw new NotFoundException(
        'There is no promotion plan for this academic year yet',
      );
    return run;
  }

  /** The newest published combined result of each class in the year. */
  async latestRuns(
    db: Pick<Tx, 'resultRun'>,
    yearId: string,
    classIds: string[],
  ): Promise<Map<string, { id: string; version: number }>> {
    if (classIds.length === 0) return new Map();
    const runs = await db.resultRun.findMany({
      where: {
        academicYearId: yearId,
        classId: { in: classIds },
        scopeKey: 'POLICY',
      },
      orderBy: [{ classId: 'asc' }, { version: 'desc' }],
      distinct: ['classId'],
      select: { id: true, classId: true, version: true },
    });
    return new Map(
      runs.map((r) => [r.classId, { id: r.id, version: r.version }] as const),
    );
  }

  private async sameNameSection(
    tx: Tx,
    toClassId: string,
    fromSectionId: string,
  ): Promise<string | null> {
    const from = await tx.section.findUnique({
      where: { id: fromSectionId },
      select: { name: true },
    });
    if (!from) return null;
    const match = await tx.section.findFirst({
      where: {
        classId: toClassId,
        isActive: true,
        name: { equals: from.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return match?.id ?? null;
  }

  private async rows(
    runId: string,
    fromYearId: string,
    where: Prisma.PromotionDecisionWhereInput,
    order: 'RANK' | 'ROLL',
  ) {
    const decisions = await this.prisma.promotionDecision.findMany({
      where: { runId, ...where },
      select: DECISION_SELECT,
    });
    const classIds = [...new Set(decisions.map((d) => d.fromClassId))];
    const latest = await this.latestRuns(this.prisma, fromYearId, classIds);
    const present = (d: DecisionRow) => ({
      enrollmentId: d.enrollmentId,
      studentId: d.enrollment.student.id,
      admissionNo: d.enrollment.student.admissionNo,
      name: displayName(d.enrollment.student),
      rollNo: d.enrollment.rollNo,
      section: { id: d.enrollment.section.id, name: d.enrollment.section.name },
      action: d.action,
      basis: d.basis,
      toClass: d.toClass,
      toSection: d.toSection,
      note: d.note,
      applied: d.appliedAt !== null,
      result:
        d.resultVersion === null && d.resultStatus === null
          ? null
          : {
              status: d.resultStatus,
              percentage: d.percentage?.toNumber() ?? null,
              classRank: d.classRank,
              sectionRank: d.sectionRank,
              version: d.resultVersion,
            },
      stale:
        d.appliedAt === null &&
        (d.resultVersion ?? 0) !== (latest.get(d.fromClassId)?.version ?? 0),
    });
    const big = Number.MAX_SAFE_INTEGER;
    return decisions
      .map((d) => ({ d, p: present(d) }))
      .sort((a, b) =>
        order === 'RANK'
          ? (a.d.classRank ?? big) - (b.d.classRank ?? big) ||
            a.p.name.localeCompare(b.p.name)
          : a.p.section.name.localeCompare(b.p.section.name) ||
            (a.p.rollNo ?? big) - (b.p.rollNo ?? big) ||
            a.p.name.localeCompare(b.p.name),
      )
      .map((x) => x.p);
  }
}
