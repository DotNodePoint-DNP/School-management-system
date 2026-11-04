import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreateFeeAssignmentDto,
  UpdateFeeAssignmentDto,
} from './dto/fee-assignment.dto.js';
import { FeeEnrollmentLockService } from './fee-enrollment-lock.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SELECT = {
  id: true,
  amount: true,
  note: true,
  feeHead: { select: { id: true, code: true, name: true, nameNp: true } },
  periods: {
    select: { period: { select: { id: true, sequence: true, name: true } } },
  },
} satisfies Prisma.StudentFeeAssignmentSelect;
type Row = Prisma.StudentFeeAssignmentGetPayload<{ select: typeof SELECT }>;

export interface FeeAssignmentResponse {
  id: string;
  feeHead: { id: string; code: string; name: string; nameNp: string | null };
  amount: number;
  note: string | null;
  periods: { id: string; sequence: number; name: string }[];
}

const toResponse = (r: Row): FeeAssignmentResponse => ({
  id: r.id,
  feeHead: r.feeHead,
  amount: r.amount.toNumber(),
  note: r.note,
  periods: r.periods
    .map((p) => p.period)
    .sort((a, b) => a.sequence - b.sequence),
});

@Injectable()
export class FeeAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locks: FeeEnrollmentLockService,
  ) {}

  async list(enrollmentId: string): Promise<FeeAssignmentResponse[]> {
    if (
      !(await this.prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Enrollment not found');
    const rows = await this.prisma.studentFeeAssignment.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: 'asc' },
      select: SELECT,
    });
    return rows.map(toResponse);
  }

  async create(
    enrollmentId: string,
    dto: CreateFeeAssignmentDto,
    actor: AuthUser,
  ): Promise<FeeAssignmentResponse> {
    const id = await this.prisma.$transaction(async (tx) => {
      const { academicYearId } = await this.locks.lock(tx, enrollmentId, {
        requireEnrolled: true,
      });
      const head = await this.requireHead(tx, dto.feeHeadId);
      const periodIds = await this.resolvePeriods(tx, academicYearId, dto);
      await this.assertNoClash(tx, enrollmentId, head.id, periodIds);

      const created = await tx.studentFeeAssignment.create({
        data: {
          enrollmentId,
          feeHeadId: head.id,
          amount: dto.amount,
          note: dto.note,
          createdById: actor.id,
        },
        select: { id: true },
      });
      await tx.studentFeeAssignmentPeriod.createMany({
        data: periodIds.map((periodId) => ({
          assignmentId: created.id,
          enrollmentId,
          feeHeadId: head.id,
          periodId,
          academicYearId,
        })),
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'fee_assignment.created',
        entityType: 'enrollment',
        entityId: enrollmentId,
        details: {
          assignmentId: created.id,
          feeHead: head.code,
          amount: dto.amount,
          periods: periodIds.length,
        },
      });
      return created.id;
    }, TX);
    return this.one(id);
  }

  async update(
    enrollmentId: string,
    id: string,
    dto: UpdateFeeAssignmentDto,
    actor: AuthUser,
  ): Promise<FeeAssignmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      const { academicYearId } = await this.locks.lock(tx, enrollmentId, {
        requireEnrolled: true,
      });
      const current = await tx.studentFeeAssignment.findFirst({
        where: { id, enrollmentId },
        select: { feeHeadId: true, amount: true, note: true },
      });
      if (!current) throw new NotFoundException('Fee assignment not found');

      const data: Prisma.StudentFeeAssignmentUpdateInput = {};
      const changed: string[] = [];
      if (
        dto.amount !== undefined &&
        dto.amount !== current.amount.toNumber()
      ) {
        data.amount = dto.amount;
        changed.push('amount');
      }
      if (dto.note !== undefined) {
        data.note = dto.note === '' ? null : dto.note;
        changed.push('note');
      }
      const replacePeriods =
        dto.periodIds !== undefined || dto.allPeriods === true;
      if (replacePeriods) {
        const periodIds = await this.resolvePeriods(tx, academicYearId, dto);
        await this.assertNoClash(
          tx,
          enrollmentId,
          current.feeHeadId,
          periodIds,
          id,
        );
        await tx.studentFeeAssignmentPeriod.deleteMany({
          where: { assignmentId: id },
        });
        await tx.studentFeeAssignmentPeriod.createMany({
          data: periodIds.map((periodId) => ({
            assignmentId: id,
            enrollmentId,
            feeHeadId: current.feeHeadId,
            periodId,
            academicYearId,
          })),
        });
        changed.push('periods');
      }
      if (changed.length === 0)
        throw new BadRequestException('Nothing to change');
      await tx.studentFeeAssignment.update({ where: { id }, data });
      await this.audit.recordIn(tx, {
        actor,
        action: 'fee_assignment.updated',
        entityType: 'enrollment',
        entityId: enrollmentId,
        details: { assignmentId: id, changedFields: changed },
      });
    }, TX);
    return this.one(id);
  }

  async remove(
    enrollmentId: string,
    id: string,
    actor: AuthUser,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.locks.lock(tx, enrollmentId, { requireEnrolled: false });
      const found = await tx.studentFeeAssignment.findFirst({
        where: { id, enrollmentId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Fee assignment not found');
      await tx.studentFeeAssignment.delete({ where: { id } }); // its period rows go with it
      await this.audit.recordIn(tx, {
        actor,
        action: 'fee_assignment.deleted',
        entityType: 'enrollment',
        entityId: enrollmentId,
        details: { assignmentId: id },
      });
    }, TX);
  }

  private async requireHead(tx: Tx, feeHeadId: string) {
    const head = await tx.feeHead.findUnique({
      where: { id: feeHeadId },
      select: { id: true, code: true, isActive: true, perStudent: true },
    });
    if (!head) throw new BadRequestException('That fee head does not exist');
    if (!head.isActive)
      throw new ConflictException(`The fee head ${head.code} is inactive`);
    if (!head.perStudent)
      throw new BadRequestException(
        `${head.code} is charged to the whole class. Put it in the class fee structure instead.`,
      );
    return head;
  }

  private async resolvePeriods(
    tx: Tx,
    academicYearId: string,
    dto: { periodIds?: string[]; allPeriods?: boolean },
  ): Promise<string[]> {
    const all = dto.allPeriods === true;
    const given = dto.periodIds ?? [];
    if (all === given.length > 0)
      throw new BadRequestException(
        'Give either periodIds or allPeriods: true',
      );
    const periods = await tx.billingPeriod.findMany({
      where: { academicYearId },
      select: { id: true },
    });
    if (all) {
      if (periods.length === 0)
        throw new ConflictException(
          'This academic year has no billing periods yet',
        );
      return periods.map((p) => p.id);
    }
    const valid = new Set(periods.map((p) => p.id));
    if (given.some((id) => !valid.has(id)))
      throw new BadRequestException(
        "One or more billing periods do not belong to this student's academic year",
      );
    return given;
  }

  private async assertNoClash(
    tx: Tx,
    enrollmentId: string,
    feeHeadId: string,
    periodIds: string[],
    excludeAssignmentId?: string,
  ): Promise<void> {
    const clash = await tx.studentFeeAssignmentPeriod.findMany({
      where: {
        enrollmentId,
        feeHeadId,
        periodId: { in: periodIds },
        ...(excludeAssignmentId
          ? { assignmentId: { not: excludeAssignmentId } }
          : {}),
      },
      select: { period: { select: { name: true, sequence: true } } },
    });
    if (clash.length > 0) {
      const names = clash
        .map((c) => c.period)
        .sort((a, b) => a.sequence - b.sequence)
        .map((p) => p.name)
        .join(', ');
      throw new ConflictException(
        `This head is already assigned to the student for: ${names}`,
      );
    }
  }

  private async one(id: string): Promise<FeeAssignmentResponse> {
    return toResponse(
      await this.prisma.studentFeeAssignment.findUniqueOrThrow({
        where: { id },
        select: SELECT,
      }),
    );
  }
}
