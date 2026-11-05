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
import type { CreateFeeHeadDto, UpdateFeeHeadDto } from './dto/fee-head.dto.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const SELECT = {
  id: true,
  code: true,
  name: true,
  nameNp: true,
  frequency: true,
  perStudent: true,
  incomeAccountCode: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.FeeHeadSelect;
export type FeeHeadResponse = Prisma.FeeHeadGetPayload<{
  select: typeof SELECT;
}>;

@Injectable()
export class FeeHeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(isActive?: boolean): Promise<FeeHeadResponse[]> {
    return this.prisma.feeHead.findMany({
      where: isActive === undefined ? {} : { isActive },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: SELECT,
    });
  }

  async create(
    dto: CreateFeeHeadDto,
    actor: AuthUser,
  ): Promise<FeeHeadResponse> {
    if (dto.perStudent && dto.frequency === 'AD_HOC')
      throw new BadRequestException(
        'An ad-hoc head is charged on demand, so it cannot also be per-student',
      );
    const row = await this.prisma.feeHead.create({
      data: {
        code: dto.code,
        name: dto.name,
        nameNp: dto.nameNp,
        frequency: dto.frequency,
        perStudent: dto.perStudent === true,
        incomeAccountCode: dto.incomeAccountCode,
        sortOrder: dto.sortOrder ?? 100,
      },
      select: SELECT,
    });
    await this.audit.record({
      actor,
      action: 'fee_head.created',
      entityType: 'fee_head',
      entityId: row.id,
      details: { code: row.code, frequency: row.frequency },
    });
    return row;
  }

  async update(
    id: string,
    dto: UpdateFeeHeadDto,
    actor: AuthUser,
  ): Promise<FeeHeadResponse> {
    const { row, changed } = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM fee_heads WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0)
        throw new NotFoundException('Fee head not found');
      const current = await tx.feeHead.findUniqueOrThrow({
        where: { id },
        select: SELECT,
      });

      const frequency = dto.frequency ?? current.frequency;
      const perStudent = dto.perStudent ?? current.perStudent;
      if (perStudent && frequency === 'AD_HOC')
        throw new BadRequestException(
          'An ad-hoc head is charged on demand, so it cannot also be per-student',
        );

      const inStructures = await tx.feeStructureLine.count({
        where: { feeHeadId: id },
      });
      if (inStructures > 0 && (frequency === 'AD_HOC' || perStudent)) {
        throw new ConflictException(
          'This head is used in class fee structures. Remove it from them before making it ad-hoc or per-student.',
        );
      }
      if (dto.isActive === false && current.isActive) {
        const [openStructures, openAssignments] = await Promise.all([
          tx.feeStructureLine.count({
            where: {
              feeHeadId: id,
              academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
            },
          }),
          tx.studentFeeAssignment.count({
            where: {
              feeHeadId: id,
              enrollment: {
                academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
              },
            },
          }),
        ]);

        if (openStructures > 0)
          throw new ConflictException(
            `This head is still in ${openStructures} fee structure line(s) of open academic years. Remove it from them first.`,
          );

        if (openAssignments > 0)
          throw new ConflictException(
            'This head is still assigned to students in open academic years.',
          );
      }

      const data: Prisma.FeeHeadUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.nameNp !== undefined)
        data.nameNp = dto.nameNp === '' ? null : dto.nameNp;
      if (dto.frequency !== undefined) data.frequency = dto.frequency;
      if (dto.perStudent !== undefined) data.perStudent = dto.perStudent;
      if (dto.incomeAccountCode !== undefined)
        data.incomeAccountCode =
          dto.incomeAccountCode === '' ? null : dto.incomeAccountCode;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      const updated = await tx.feeHead.update({
        where: { id },
        data,
        select: SELECT,
      });
      return { row: updated, changed: Object.keys(data) };
    }, TX);
    await this.audit.record({
      actor,
      action: 'fee_head.updated',
      entityType: 'fee_head',
      entityId: id,
      details: { changedFields: changed },
    });
    return row;
  }

  /** Only a head that was never used. Otherwise deactivate it. */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const code = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM fee_heads WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0)
        throw new NotFoundException('Fee head not found');

      const head = await tx.feeHead.findUniqueOrThrow({
        where: { id },
        select: { code: true },
      });

      const [structureCount, assignmentCount, discountCount, invoiceCount] =
        await Promise.all([
          tx.feeStructureLine.count({ where: { feeHeadId: id } }),
          tx.studentFeeAssignment.count({ where: { feeHeadId: id } }),
          tx.studentDiscount.count({ where: { feeHeadId: id } }),
          tx.invoiceLine.count({ where: { feeHeadId: id } })
        ]);

      if (structureCount > 0 || assignmentCount > 0 || discountCount > 0 || invoiceCount > 0) {
        throw new ConflictException(
          'This head is used in fee structures, assignments, discounts, or invoices. Deactivate it instead of deleting it.',
        );
      }

      await tx.feeHead.delete({ where: { id } });
      return head.code;
    }, TX);

    await this.audit.record({
      actor,
      action: 'fee_head.deleted',
      entityType: 'fee_head',
      entityId: id,
      details: { code },
    });
  }
}
