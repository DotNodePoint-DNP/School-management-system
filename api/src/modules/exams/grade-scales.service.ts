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
  CopyGradeScaleDto,
  CreateGradeScaleDto,
  GradeBandDto,
  ReplaceGradeScaleDto,
} from './dto/grade-scale.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const BAND_SELECT = {
  grade: true,
  minPercent: true,
  gradePoint: true,
  description: true,
  isPass: true,
} satisfies Prisma.GradeBandSelect;
const SCALE_SELECT = {
  id: true,
  name: true,
  isDefault: true,
  bands: { orderBy: { minPercent: 'desc' }, select: BAND_SELECT },
  _count: { select: { policies: true } },
} satisfies Prisma.GradeScaleSelect;

type ScaleRow = Prisma.GradeScaleGetPayload<{ select: typeof SCALE_SELECT }>;

export interface GradeBandResponse {
  grade: string;
  minPercent: number;
  /** Exclusive upper bound; null for the top band, which runs up to and including 100%. */
  belowPercent: number | null;
  gradePoint: number;
  description: string;
  isPass: boolean;
}
export interface GradeScaleResponse {
  id: string;
  name: string;
  isDefault: boolean;
  policyCount: number;
  bands: GradeBandResponse[];
}

function toResponse(row: ScaleRow): GradeScaleResponse {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    policyCount: row._count.policies,
    bands: row.bands.map((b, i) => ({
      grade: b.grade,
      minPercent: b.minPercent.toNumber(),
      belowPercent:
        i === 0 ? null : (row.bands[i - 1]?.minPercent.toNumber() ?? null),
      gradePoint: b.gradePoint.toNumber(),
      description: b.description,
      isPass: b.isPass,
    })),
  };
}

/** Every mark from 0 to 100 must land in exactly one band, and better marks must never score worse. */
export function validateBands(bands: GradeBandDto[]): void {
  const sorted = bands
    .map((b) => ({ ...b, cents: Math.round(b.minPercent * 100) }))
    .sort((a, b) => a.cents - b.cents);
  if (new Set(sorted.map((b) => b.cents)).size !== sorted.length)
    throw new BadRequestException('Two bands start at the same percentage');
  if (new Set(sorted.map((b) => b.grade.toLowerCase())).size !== sorted.length)
    throw new BadRequestException('A grade letter is used twice');
  if (sorted[0]?.cents !== 0)
    throw new BadRequestException(
      'There must be a band starting at 0%, so every mark has a grade',
    );
  for (let i = 1; i < sorted.length; i++) {
    const lower = sorted[i - 1] as (typeof sorted)[number];
    const higher = sorted[i] as (typeof sorted)[number];
    if (higher.gradePoint < lower.gradePoint) {
      throw new BadRequestException(
        `Grade ${higher.grade} covers higher marks than ${lower.grade} but has fewer grade points`,
      );
    }
    if (lower.isPass && !higher.isPass) {
      throw new BadRequestException(
        `Grade ${higher.grade} cannot be failing when ${lower.grade} (lower marks) is passing`,
      );
    }
  }
}

const bandData = (b: GradeBandDto) => ({
  grade: b.grade,
  minPercent: b.minPercent,
  gradePoint: b.gradePoint,
  description: b.description,
  isPass: b.isPass,
});

@Injectable()
export class GradeScalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<GradeScaleResponse[]> {
    const rows = await this.prisma.gradeScale.findMany({
      orderBy: { name: 'asc' },
      select: SCALE_SELECT,
    });
    return rows.map(toResponse);
  }

  async get(id: string): Promise<GradeScaleResponse> {
    const row = await this.prisma.gradeScale.findUnique({
      where: { id },
      select: SCALE_SELECT,
    });
    if (!row) throw new NotFoundException('Grade scale not found');
    return toResponse(row);
  }

  async create(
    dto: CreateGradeScaleDto,
    actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    validateBands(dto.bands);
    const row = await this.prisma.gradeScale.create({
      data: { name: dto.name, bands: { create: dto.bands.map(bandData) } },
      select: SCALE_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'grade_scale.created',
      entityType: 'grade_scale',
      entityId: row.id,
      details: { name: row.name, bandCount: dto.bands.length },
    });
    return toResponse(row);
  }

  async replace(
    id: string,
    dto: ReplaceGradeScaleDto,
    actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    validateBands(dto.bands);
    await this.prisma.$transaction(async (tx) => {
      await this.lockScale(tx, id);
      if (dto.name !== undefined)
        await tx.gradeScale.update({ where: { id }, data: { name: dto.name } });
      await tx.gradeBand.deleteMany({ where: { gradeScaleId: id } });
      await tx.gradeBand.createMany({
        data: dto.bands.map((b) => ({ gradeScaleId: id, ...bandData(b) })),
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'grade_scale.updated',
      entityType: 'grade_scale',
      entityId: id,
      details: { renamed: dto.name !== undefined, bandCount: dto.bands.length },
    });
    return this.get(id);
  }

  async copy(
    id: string,
    dto: CopyGradeScaleDto,
    actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    const source = await this.prisma.gradeScale.findUnique({
      where: { id },
      select: { bands: { select: BAND_SELECT } },
    });
    if (!source) throw new NotFoundException('Grade scale not found');
    const row = await this.prisma.gradeScale.create({
      data: { name: dto.name, bands: { create: source.bands } },
      select: SCALE_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'grade_scale.copied',
      entityType: 'grade_scale',
      entityId: row.id,
      details: { copiedFrom: id, name: row.name },
    });
    return toResponse(row);
  }

  async setDefault(id: string, actor: AuthUser): Promise<GradeScaleResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('grade_scale_default'))`;
      await this.lockScale(tx, id);
      await tx.gradeScale.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      await tx.gradeScale.update({ where: { id }, data: { isDefault: true } });
    }, TX);
    await this.audit.record({
      actor,
      action: 'grade_scale.default_set',
      entityType: 'grade_scale',
      entityId: id,
    });
    return this.get(id);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const name = await this.prisma.$transaction(async (tx) => {
      await this.lockScale(tx, id);
      const scale = await tx.gradeScale.findUniqueOrThrow({
        where: { id },
        select: {
          name: true,
          isDefault: true,
          _count: { select: { policies: true } },
        },
      });
      if (scale.isDefault)
        throw new ConflictException(
          'The default grade scale cannot be deleted. Make another scale the default first.',
        );
      if (scale._count.policies > 0) {
        throw new ConflictException(
          `${scale._count.policies} result policy(ies) use this scale. Point them at another scale first.`,
        );
      }
      await tx.gradeScale.delete({ where: { id } });
      return scale.name;
    }, TX);
    await this.audit.record({
      actor,
      action: 'grade_scale.deleted',
      entityType: 'grade_scale',
      entityId: id,
      details: { name },
    });
  }

  private async lockScale(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM grade_scales WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Grade scale not found');
  }
}
