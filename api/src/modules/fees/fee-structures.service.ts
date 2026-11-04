import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  fromPaisa,
  increaseByPercent,
  toPaisa,
} from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClassesService } from '../classes/classes.service.js';
import type {
  CopyFeeStructureDto,
  FeeLineDto,
  ReplaceFeeStructureDto,
} from './dto/fee-structure.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 120_000 } as const;
type Audience = 'ALL' | 'NEW' | 'CONTINUING';

const LINE_SELECT = {
  id: true,
  amount: true,
  audience: true,
  onAdmission: true,
  feeHead: {
    select: {
      id: true,
      code: true,
      name: true,
      nameNp: true,
      frequency: true,
      sortOrder: true,
    },
  },
  periods: {
    select: { period: { select: { id: true, sequence: true, name: true } } },
  },
} satisfies Prisma.FeeStructureLineSelect;

export interface FeeStructureResponse {
  academicYearId: string;
  classId: string;
  lines: {
    id: string;
    feeHead: {
      id: string;
      code: string;
      name: string;
      nameNp: string | null;
      frequency: string;
    };
    amount: number;
    audience: Audience;
    onAdmission: boolean;
    periods: { id: string; sequence: number; name: string }[];
  }[];
  /** What a new student pays on admission. */
  admissionTotal: number;
  /** What one student pays in each billing period, by audience, before discounts. */
  byPeriod: {
    periodId: string;
    sequence: number;
    name: string;
    forNew: number;
    forContinuing: number;
  }[];
}

@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly classes: ClassesService,
  ) {}

  async get(yearId: string, classId: string): Promise<FeeStructureResponse> {
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

    const [rows, periods] = await Promise.all([
      this.prisma.feeStructureLine.findMany({
        where: { academicYearId: yearId, classId },
        select: LINE_SELECT,
      }),
      this.prisma.billingPeriod.findMany({
        where: { academicYearId: yearId },
        orderBy: { sequence: 'asc' },
        select: { id: true, sequence: true, name: true },
      }),
    ]);
    const lines = rows
      .sort(
        (a, b) =>
          a.feeHead.sortOrder - b.feeHead.sortOrder ||
          a.feeHead.code.localeCompare(b.feeHead.code) ||
          a.audience.localeCompare(b.audience),
      )
      .map((r) => ({
        id: r.id,
        feeHead: {
          id: r.feeHead.id,
          code: r.feeHead.code,
          name: r.feeHead.name,
          nameNp: r.feeHead.nameNp,
          frequency: r.feeHead.frequency,
        },
        amount: r.amount.toNumber(),
        audience: r.audience,
        onAdmission: r.onAdmission,
        periods: r.periods
          .map((p) => p.period)
          .sort((a, b) => a.sequence - b.sequence),
      }));

    const admissionTotal = lines
      .filter((l) => l.onAdmission)
      .reduce((n, l) => n + toPaisa(l.amount), 0);
    const byPeriod = periods.map((p) => {
      const sum = (audience: Audience): number =>
        lines
          .filter(
            (l) =>
              !l.onAdmission &&
              l.periods.some((lp) => lp.id === p.id) &&
              (l.audience === 'ALL' || l.audience === audience),
          )
          .reduce((n, l) => n + toPaisa(l.amount), 0);
      return {
        periodId: p.id,
        sequence: p.sequence,
        name: p.name,
        forNew: fromPaisa(sum('NEW')),
        forContinuing: fromPaisa(sum('CONTINUING')),
      };
    });
    return {
      academicYearId: yearId,
      classId,
      lines,
      admissionTotal: fromPaisa(admissionTotal),
      byPeriod,
    };
  }

  /** Replaces the class's whole structure for the year. Issued invoices are unaffected: they keep what they were created with. */
  async replace(
    yearId: string,
    classId: string,
    dto: ReplaceFeeStructureDto,
    actor: AuthUser,
  ): Promise<FeeStructureResponse> {
    this.assertShape(dto.lines);
    await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fee_structure:${yearId}:${classId}`}))`;
      await this.classes.lockActiveClassForUse(tx, classId);

      const heads = await tx.feeHead.findMany({
        where: { id: { in: [...new Set(dto.lines.map((l) => l.feeHeadId))] } },
        select: {
          id: true,
          code: true,
          frequency: true,
          perStudent: true,
          isActive: true,
        },
      });
      const headBy = new Map(heads.map((h) => [h.id, h] as const));
      for (const line of dto.lines) {
        const head = headBy.get(line.feeHeadId);
        if (!head)
          throw new BadRequestException('One or more fee heads do not exist');
        if (!head.isActive)
          throw new ConflictException(`The fee head ${head.code} is inactive`);
        if (head.frequency === 'AD_HOC')
          throw new BadRequestException(
            `${head.code} is charged on demand (ad hoc), so it does not belong in a class fee structure`,
          );
        if (head.perStudent)
          throw new BadRequestException(
            `${head.code} is billed per student. Assign it to students instead of adding it to the class structure.`,
          );
      }

      const periodIds = [
        ...new Set(dto.lines.flatMap((l) => l.periodIds ?? [])),
      ];
      if (periodIds.length > 0) {
        const found = await tx.billingPeriod.count({
          where: { id: { in: periodIds }, academicYearId: yearId },
        });
        if (found !== periodIds.length)
          throw new BadRequestException(
            'One or more billing periods do not belong to this academic year',
          );
      }

      await tx.feeStructureLine.deleteMany({
        where: { academicYearId: yearId, classId },
      });
      const lines = dto.lines.map((l) => ({ id: randomUUID(), ...l }));
      if (lines.length > 0) {
        await tx.feeStructureLine.createMany({
          data: lines.map((l) => ({
            id: l.id,
            academicYearId: yearId,
            classId,
            feeHeadId: l.feeHeadId,
            amount: l.amount,
            audience: l.onAdmission ? ('NEW' as const) : (l.audience ?? 'ALL'),
            onAdmission: l.onAdmission === true,
          })),
        });
        const joins = lines.flatMap((l) =>
          (l.periodIds ?? []).map((periodId) => ({
            lineId: l.id,
            periodId,
            academicYearId: yearId,
          })),
        );
        if (joins.length > 0)
          await tx.feeStructureLinePeriod.createMany({ data: joins });
      }
      await this.audit.recordIn(tx, {
        actor,
        action: 'fee_structure.updated',
        entityType: 'fee_structure',
        entityId: `${yearId}:${classId}`,
        details: { lines: lines.length },
      });
    }, TX);
    return this.get(yearId, classId);
  }

  /**
   * Copies structures from another academic year, matching periods by their number (period 3 becomes period 3).
   * Classes that already have a structure here are left alone. Lines left with no period are skipped and counted.
   */
  async copy(
    destYearId: string,
    sourceYearId: string,
    dto: CopyFeeStructureDto,
    actor: AuthUser,
  ) {
    if (destYearId === sourceYearId)
      throw new BadRequestException(
        'Source and destination must be different academic years',
      );
    const adjust = dto.adjustPercent ?? 0;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, destYearId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fee_structure_copy:${destYearId}`}))`;
      const source = await tx.academicYear.findUnique({
        where: { id: sourceYearId },
        select: { id: true },
      });
      if (!source)
        throw new NotFoundException('Source academic year not found');

      const [lines, sourcePeriods, destPeriods, existing] = await Promise.all([
        tx.feeStructureLine.findMany({
          where: {
            academicYearId: sourceYearId,
            ...(dto.classIds && dto.classIds.length > 0
              ? { classId: { in: dto.classIds } }
              : {}),
            schoolClass: { isActive: true },
          },
          select: {
            classId: true,
            feeHeadId: true,
            amount: true,
            audience: true,
            onAdmission: true,
            feeHead: { select: { isActive: true } },
            periods: { select: { periodId: true } },
          },
        }),
        tx.billingPeriod.findMany({
          where: { academicYearId: sourceYearId },
          select: { id: true, sequence: true },
        }),
        tx.billingPeriod.findMany({
          where: { academicYearId: destYearId },
          select: { id: true, sequence: true },
        }),
        tx.feeStructureLine.findMany({
          where: { academicYearId: destYearId },
          select: { classId: true },
          distinct: ['classId'],
        }),
      ]);
      const sequenceOf = new Map(
        sourcePeriods.map((p) => [p.id, p.sequence] as const),
      );
      const destBySequence = new Map(
        destPeriods.map((p) => [p.sequence, p.id] as const),
      );
      const taken = new Set(existing.map((e) => e.classId));

      const skippedClasses = new Set<string>();
      const copiedClasses = new Set<string>();
      let droppedLines = 0;
      let droppedPeriods = 0;
      const created: {
        id: string;
        classId: string;
        feeHeadId: string;
        amount: number;
        audience: Audience;
        onAdmission: boolean;
        periodIds: string[];
      }[] = [];

      for (const l of lines) {
        if (taken.has(l.classId)) {
          skippedClasses.add(l.classId);
          continue;
        }
        if (!l.feeHead.isActive) {
          droppedLines += 1;
          continue;
        }
        const mapped = l.periods.flatMap((p) => {
          const target = destBySequence.get(sequenceOf.get(p.periodId) ?? -1);
          return target ? [target] : [];
        });
        droppedPeriods += l.periods.length - mapped.length;
        if (!l.onAdmission && mapped.length === 0) {
          droppedLines += 1;
          continue;
        }
        copiedClasses.add(l.classId);
        created.push({
          id: randomUUID(),
          classId: l.classId,
          feeHeadId: l.feeHeadId,
          amount: fromPaisa(
            increaseByPercent(toPaisa(l.amount.toNumber()), adjust),
          ),
          audience: l.audience,
          onAdmission: l.onAdmission,
          periodIds: mapped,
        });
      }
      if (created.length > 0) {
        await tx.feeStructureLine.createMany({
          data: created.map((c) => ({
            id: c.id,
            academicYearId: destYearId,
            classId: c.classId,
            feeHeadId: c.feeHeadId,
            amount: c.amount,
            audience: c.audience,
            onAdmission: c.onAdmission,
          })),
        });
        const joins = created.flatMap((c) =>
          c.periodIds.map((periodId) => ({
            lineId: c.id,
            periodId,
            academicYearId: destYearId,
          })),
        );
        if (joins.length > 0)
          await tx.feeStructureLinePeriod.createMany({ data: joins });
      }
      return {
        classesCopied: copiedClasses.size,
        classesSkipped: skippedClasses.size,
        lines: created.length,
        droppedLines,
        droppedPeriods,
      };
    }, TX);

    await this.audit.record({
      actor,
      action: 'fee_structure.copied',
      entityType: 'academic_year',
      entityId: destYearId,
      details: { sourceYearId, adjustPercent: adjust, ...result },
    });
    return result;
  }

  /** The rules that do not need the database. */
  private assertShape(lines: FeeLineDto[]): void {
    const audiencesByHead = new Map<string, Audience[]>();
    for (const line of lines) {
      const onAdmission = line.onAdmission === true;
      const periods = line.periodIds ?? [];
      if (onAdmission && periods.length > 0)
        throw new BadRequestException(
          'An admission fee has no billing periods: it is billed once, on admission',
        );
      if (!onAdmission && periods.length === 0)
        throw new BadRequestException(
          'Choose at least one billing period for each fee, or mark it as an admission fee',
        );
      if (onAdmission && line.audience !== undefined && line.audience !== 'NEW')
        throw new BadRequestException(
          'An admission fee is only for new students',
        );
      const audience: Audience = onAdmission ? 'NEW' : (line.audience ?? 'ALL');
      audiencesByHead.set(line.feeHeadId, [
        ...(audiencesByHead.get(line.feeHeadId) ?? []),
        audience,
      ]);
    }
    for (const audiences of audiencesByHead.values()) {
      if (new Set(audiences).size !== audiences.length)
        throw new BadRequestException(
          'A fee head can appear only once for each audience',
        );
      if (audiences.includes('ALL') && audiences.length > 1)
        throw new BadRequestException(
          'A fee head set for ALL students cannot also have separate NEW or CONTINUING lines',
        );
    }
  }
}
