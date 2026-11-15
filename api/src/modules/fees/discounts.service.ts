import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreateDiscountDto,
  DecisionReasonDto,
  ListDiscountsQueryDto,
  UpdateDiscountDto,
} from './dto/discount.dto.js';
import { FeeEnrollmentLockService } from './fee-enrollment-lock.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SELECT = {
  id: true,
  enrollmentId: true,
  academicYearId: true,
  category: true,
  type: true,
  value: true,
  reason: true,
  status: true,
  feeHeadId: true,
  feeHead: { select: { id: true, code: true, name: true } },
  fromPeriod: { select: { id: true, sequence: true, name: true } },
  toPeriod: { select: { id: true, sequence: true, name: true } },
  createdById: true,
  lastEditedById: true,
  createdAt: true,
  approvedById: true,
  approvedAt: true,
  rejectedById: true,
  rejectedAt: true,
  rejectReason: true,
  revokedById: true,
  revokedAt: true,
  revokeReason: true,
  enrollment: {
    select: {
      id: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          middleName: true,
          lastName: true,
        },
      },
      section: {
        select: {
          name: true,
          schoolClass: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.StudentDiscountSelect;
type Row = Prisma.StudentDiscountGetPayload<{ select: typeof SELECT }>;

export interface DiscountResponse {
  id: string;
  enrollmentId: string;
  academicYearId: string;
  student: {
    id: string;
    admissionNo: string;
    name: string;
    className: string;
    sectionName: string;
  };
  category: string;
  type: string;
  value: number;
  feeHead: { id: string; code: string; name: string } | null;
  fromPeriod: { id: string; sequence: number; name: string } | null;
  toPeriod: { id: string; sequence: number; name: string } | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  /** Visible only to people who create or approve discounts. */
  reason: string | null;
  rejectReason: string | null;
  revokeReason: string | null;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  revokedBy: string | null;
}

@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locks: FeeEnrollmentLockService,
  ) {}

  async list(
    query: ListDiscountsQueryDto,
    actor: AuthUser,
  ): Promise<Paginated<DiscountResponse>> {
    const where: Prisma.StudentDiscountWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.classId) where.enrollment = { classId: query.classId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentDiscount.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: SELECT,
      }),
      this.prisma.studentDiscount.count({ where }),
    ]);
    return toPaginated(await this.present(rows, actor), total, query);
  }

  async forEnrollment(
    enrollmentId: string,
    actor: AuthUser,
  ): Promise<DiscountResponse[]> {
    if (
      !(await this.prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Enrollment not found');
    const rows = await this.prisma.studentDiscount.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return this.present(rows, actor);
  }

  async create(
    enrollmentId: string,
    dto: CreateDiscountDto,
    actor: AuthUser,
  ): Promise<DiscountResponse> {
    this.assertShape(dto.type, dto.value, dto.feeHeadId ?? null);
    const id = await this.prisma.$transaction(async (tx) => {
      const { academicYearId } = await this.locks.lock(tx, enrollmentId, {
        requireEnrolled: true,
      });
      await this.assertHead(tx, dto.feeHeadId ?? null);
      await this.assertPeriods(
        tx,
        academicYearId,
        dto.fromPeriodId ?? null,
        dto.toPeriodId ?? null,
      );
      await this.assertNotDuplicate(tx, enrollmentId, {
        ...dto,
        feeHeadId: dto.feeHeadId ?? null,
        fromPeriodId: dto.fromPeriodId ?? null,
        toPeriodId: dto.toPeriodId ?? null,
      });

      const created = await tx.studentDiscount.create({
        data: {
          enrollmentId,
          academicYearId,
          category: dto.category,
          feeHeadId: dto.feeHeadId,
          type: dto.type,
          value: dto.value,
          fromPeriodId: dto.fromPeriodId,
          toPeriodId: dto.toPeriodId,
          reason: dto.reason,
          createdById: actor.id,
          lastEditedById: actor.id,
        },
        select: { id: true },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'discount.created',
        entityType: 'discount',
        entityId: created.id,
        details: {
          enrollmentId,
          category: dto.category,
          type: dto.type,
          value: dto.value,
          feeHeadId: dto.feeHeadId ?? null,
        },
      });
      return created.id;
    }, TX);
    return this.one(id, actor);
  }

  /** Only while pending. Editing makes the editor ineligible to approve it. */
  async update(
    id: string,
    dto: UpdateDiscountDto,
    actor: AuthUser,
  ): Promise<DiscountResponse> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPending(tx, id);
      const { academicYearId } = await this.locks.lock(
        tx,
        current.enrollmentId,
        { requireEnrolled: true },
      );

      const next = {
        category: dto.category ?? current.category,
        feeHeadId:
          dto.feeHeadId === undefined ? current.feeHeadId : dto.feeHeadId,
        type: dto.type ?? current.type,
        value: dto.value ?? current.value.toNumber(),
        fromPeriodId:
          dto.fromPeriodId === undefined
            ? current.fromPeriodId
            : dto.fromPeriodId,
        toPeriodId:
          dto.toPeriodId === undefined ? current.toPeriodId : dto.toPeriodId,
        reason: dto.reason ?? current.reason,
      };
      this.assertShape(next.type, next.value, next.feeHeadId);
      await this.assertHead(tx, next.feeHeadId);
      await this.assertPeriods(
        tx,
        academicYearId,
        next.fromPeriodId,
        next.toPeriodId,
      );
      await this.assertNotDuplicate(tx, current.enrollmentId, next, id);

      const changed = (
        [
          'category',
          'feeHeadId',
          'type',
          'value',
          'fromPeriodId',
          'toPeriodId',
          'reason',
        ] as const
      ).filter(
        (k) =>
          String(next[k]) !==
          String(k === 'value' ? current.value.toNumber() : current[k]),
      );
      if (changed.length === 0)
        throw new BadRequestException('Nothing to change');
      await tx.studentDiscount.update({
        where: { id },
        data: { ...next, lastEditedById: actor.id },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'discount.updated',
        entityType: 'discount',
        entityId: id,
        details: { changedFields: changed.filter((c) => c !== 'reason') },
      });
    }, TX);
    return this.one(id, actor);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPending(tx, id);
      await this.locks.lock(tx, current.enrollmentId, {
        requireEnrolled: false,
      });
      await tx.studentDiscount.delete({ where: { id } });
      await this.audit.recordIn(tx, {
        actor,
        action: 'discount.deleted',
        entityType: 'discount',
        entityId: id,
        details: { enrollmentId: current.enrollmentId },
      });
    }, TX);
  }

  async approve(id: string, actor: AuthUser): Promise<DiscountResponse> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPending(tx, id);
      if (
        current.createdById === actor.id ||
        current.lastEditedById === actor.id
      ) {
        throw new ConflictException(
          'A discount must be approved by someone other than the person who created or last edited it',
        );
      }
      await this.locks.lock(tx, current.enrollmentId, {
        requireEnrolled: true,
      });
      await tx.studentDiscount.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'discount.approved',
        entityType: 'discount',
        entityId: id,
        details: {
          enrollmentId: current.enrollmentId,
          type: current.type,
          value: current.value.toNumber(),
        },
      });
    }, TX);
    return this.one(id, actor);
  }

  async reject(
    id: string,
    dto: DecisionReasonDto,
    actor: AuthUser,
  ): Promise<DiscountResponse> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPending(tx, id);
      await this.locks.lock(tx, current.enrollmentId, {
        requireEnrolled: false,
      });
      await tx.studentDiscount.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedById: actor.id,
          rejectedAt: new Date(),
          rejectReason: dto.reason,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'discount.rejected',
        entityType: 'discount',
        entityId: id,
        details: { enrollmentId: current.enrollmentId },
      });
    }, TX);
    return this.one(id, actor);
  }

  /** Stops the discount applying to invoices created from now on. Invoices already issued keep it. */
  async revoke(
    id: string,
    dto: DecisionReasonDto,
    actor: AuthUser,
  ): Promise<DiscountResponse> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM student_discounts WHERE id = ${id}::uuid FOR UPDATE`;
      if (rows.length === 0) throw new NotFoundException('Discount not found');
      const current = await tx.studentDiscount.findUniqueOrThrow({
        where: { id },
        select: { status: true, enrollmentId: true },
      });
      if (current.status !== 'APPROVED')
        throw new ConflictException(
          `Only an approved discount can be revoked (this one is ${current.status.toLowerCase()})`,
        );
      await this.locks.lock(tx, current.enrollmentId, {
        requireEnrolled: false,
      });
      await tx.studentDiscount.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revokedById: actor.id,
          revokedAt: new Date(),
          revokeReason: dto.reason,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'discount.revoked',
        entityType: 'discount',
        entityId: id,
        details: { enrollmentId: current.enrollmentId },
      });
    }, TX);
    return this.one(id, actor);
  }

  // ---------------------------------------------------------------- internals

  private async lockPending(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM student_discounts WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Discount not found');
    const current = await tx.studentDiscount.findUniqueOrThrow({
      where: { id },
    });
    if (current.status !== 'PENDING')
      throw new ConflictException(
        `This discount is already ${current.status.toLowerCase()}`,
      );
    return current;
  }

  private assertShape(
    type: string,
    value: number,
    feeHeadId: string | null,
  ): void {
    if (type === 'PERCENT' && !(value > 0 && value <= 100))
      throw new BadRequestException(
        'A percentage must be above 0 and at most 100',
      );
    if (type === 'FIXED_OFF' && !(value > 0))
      throw new BadRequestException('The amount off must be more than 0');
    if (type === 'PRICE_OVERRIDE' && feeHeadId === null)
      throw new BadRequestException(
        'A price override applies to one fee head. Choose which.',
      );
  }

  private async assertHead(tx: Tx, feeHeadId: string | null): Promise<void> {
    if (feeHeadId === null) return;
    const head = await tx.feeHead.findUnique({
      where: { id: feeHeadId },
      select: { isActive: true, code: true },
    });
    if (!head) throw new BadRequestException('That fee head does not exist');
    if (!head.isActive)
      throw new ConflictException(`The fee head ${head.code} is inactive`);
  }

  private async assertPeriods(
    tx: Tx,
    academicYearId: string,
    fromId: string | null,
    toId: string | null,
  ): Promise<void> {
    if (fromId === null && toId === null) return;
    if (fromId === null || toId === null)
      throw new BadRequestException(
        'Give both the first and the last billing period, or neither for the whole year',
      );
    const periods = await tx.billingPeriod.findMany({
      where: { id: { in: [fromId, toId] }, academicYearId },
      select: { id: true, sequence: true },
    });
    const from = periods.find((p) => p.id === fromId);
    const to = periods.find((p) => p.id === toId);
    if (!from || !to)
      throw new BadRequestException(
        "The billing periods must belong to the student's academic year",
      );
    if (from.sequence > to.sequence)
      throw new BadRequestException(
        'The first billing period comes after the last one',
      );
  }

  /** The same discount twice is almost always a double entry. */
  private async assertNotDuplicate(
    tx: Tx,
    enrollmentId: string,
    d: {
      category: string;
      type: string;
      value: number;
      feeHeadId: string | null;
      fromPeriodId: string | null;
      toPeriodId: string | null;
    },
    excludeId?: string,
  ): Promise<void> {
    const same = await tx.studentDiscount.findFirst({
      where: {
        enrollmentId,
        status: { in: ['PENDING', 'APPROVED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        category: d.category as never,
        type: d.type as never,
        value: d.value,
        feeHeadId: d.feeHeadId,
        fromPeriodId: d.fromPeriodId,
        toPeriodId: d.toPeriodId,
      },
      select: { id: true },
    });
    if (same)
      throw new ConflictException(
        'An identical discount is already pending or approved for this student',
      );
  }

  private async one(id: string, actor: AuthUser): Promise<DiscountResponse> {
    const row = await this.prisma.studentDiscount.findUniqueOrThrow({
      where: { id },
      select: SELECT,
    });
    return (await this.present([row], actor))[0] as DiscountResponse;
  }

  private async present(
    rows: Row[],
    actor: AuthUser,
  ): Promise<DiscountResponse[]> {
    const ids = [
      ...new Set(
        rows.flatMap((r) =>
          [r.createdById, r.approvedById, r.rejectedById, r.revokedById].filter(
            (v): v is string => v !== null,
          ),
        ),
      ),
    ];
    const users =
      ids.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullName: true },
          });
    const name = new Map(users.map((u) => [u.id, u.fullName] as const));
    const who = (id: string | null): string | null =>
      id ? (name.get(id) ?? null) : null;
    // Reasons can describe a family's finances, so only the people handling discounts see them.
    const seesReasons =
      actor.permissions.includes('fees:discount-create') ||
      actor.permissions.includes('fees:discount-approve');

    return rows.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      academicYearId: r.academicYearId,
      student: {
        id: r.enrollment.student.id,
        admissionNo: r.enrollment.student.admissionNo,
        name: displayName(r.enrollment.student),
        className: r.enrollment.section.schoolClass.name,
        sectionName: r.enrollment.section.name,
      },
      category: r.category,
      type: r.type,
      value: r.value.toNumber(),
      feeHead: r.feeHead,
      fromPeriod: r.fromPeriod,
      toPeriod: r.toPeriod,
      status: r.status,
      reason: seesReasons ? r.reason : null,
      rejectReason: seesReasons ? r.rejectReason : null,
      revokeReason: seesReasons ? r.revokeReason : null,
      createdBy: who(r.createdById),
      createdAt: r.createdAt.toISOString(),
      approvedBy: who(r.approvedById),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rejectedBy: who(r.rejectedById),
      revokedBy: who(r.revokedById),
    }));
  }
}
