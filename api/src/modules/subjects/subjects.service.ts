import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateSubjectDto } from './dto/create-subject.dto.js';
import type { ListSubjectsQueryDto } from './dto/list-subjects-query.dto.js';
import type { UpdateSubjectDto } from './dto/update-subject.dto.js';

type Tx = Prisma.TransactionClient;

const TX = { maxWait: 15_000, timeout: 60_000 } as const;
const SUBJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  isActive: true,
} satisfies Prisma.SubjectSelect;

export type SubjectResponse = Prisma.SubjectGetPayload<{
  select: typeof SUBJECT_SELECT;
}>;

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListSubjectsQueryDto): Promise<SubjectResponse[]> {
    const where: Prisma.SubjectWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ code: contains }, { name: contains }];
    }
    return this.prisma.subject.findMany({
      where,
      orderBy: { code: 'asc' },
      select: SUBJECT_SELECT,
    });
  }

  async get(id: string): Promise<SubjectResponse> {
    const row = await this.prisma.subject.findUnique({
      where: { id },
      select: SUBJECT_SELECT,
    });
    if (!row) throw new NotFoundException('Subject not found');
    return row;
  }

  async create(
    dto: CreateSubjectDto,
    actor: AuthUser,
  ): Promise<SubjectResponse> {
    // Codes are stored uppercase, so the unique constraint is effectively case-insensitive.
    const row = await this.prisma.subject.create({
      data: { code: dto.code, name: dto.name },
      select: SUBJECT_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'subject.created',
      entityType: 'subject',
      entityId: row.id,
      details: { code: row.code, name: row.name },
    });
    return row;
  }

  async update(
    id: string,
    dto: UpdateSubjectDto,
    actor: AuthUser,
  ): Promise<SubjectResponse> {
    const { row, changed } = await this.prisma.$transaction(async (tx) => {
      await this.lockSubjectForUpdate(tx, id);
      const current = await tx.subject.findUniqueOrThrow({
        where: { id },
        select: { isActive: true },
      });

      if (dto.isActive === false && current.isActive) {
        const inUse = await tx.classSubject.count({
          where: {
            subjectId: id,
            academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
          },
        });
        if (inUse > 0) {
          throw new ConflictException(
            `This subject is used by ${inUse} class curriculum record(s) in open academic years. Remove it from those first.`,
          );
        }
      }

      const data: Prisma.SubjectUpdateInput = {};
      if (dto.code !== undefined) data.code = dto.code;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      const updated = await tx.subject.update({
        where: { id },
        data,
        select: SUBJECT_SELECT,
      });
      return { row: updated, changed: Object.keys(data) };
    }, TX);

    await this.audit.record({
      actor,
      action: 'subject.updated',
      entityType: 'subject',
      entityId: id,
      details: { changedFields: changed, isActive: dto.isActive },
    });
    return row;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const code = await this.prisma.$transaction(async (tx) => {
      await this.lockSubjectForUpdate(tx, id);
      const subject = await tx.subject.findUniqueOrThrow({
        where: { id },
        select: { code: true },
      });
      const used = await tx.classSubject.count({ where: { subjectId: id } });
      if (used > 0) {
        throw new ConflictException(
          'This subject appears in curriculum records. Deactivate it instead of deleting it.',
        );
      }
      await tx.subject.delete({ where: { id } });
      return subject.code;
    }, TX);
    await this.audit.record({
      actor,
      action: 'subject.deleted',
      entityType: 'subject',
      entityId: id,
      details: { code },
    });
  }

  /** Shared row locks (in id order, so no deadlocks) for writers that depend on these subjects. */
  async lockSubjectsShared(
    tx: Tx,
    ids: string[],
  ): Promise<{ id: string; code: string; isActive: boolean }[]> {
    if (ids.length === 0) return [];
    return tx.$queryRaw<{ id: string; code: string; isActive: boolean }[]>`
      SELECT id, code, is_active AS "isActive" FROM subjects
      WHERE id::text IN (${Prisma.join(ids)})
      ORDER BY id
      FOR SHARE`;
  }

  private async lockSubjectForUpdate(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM subjects WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Subject not found');
  }
}
