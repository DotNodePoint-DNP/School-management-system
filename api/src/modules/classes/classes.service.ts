import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateClassDto } from './dto/create-class.dto.js';
import type { CreateSectionDto } from './dto/create-section.dto.js';
import type { ListClassesQueryDto } from './dto/list-classes-query.dto.js';
import type { UpdateClassDto } from './dto/update-class.dto.js';
import type { UpdateSectionDto } from './dto/update-section.dto.js';

type Tx = Prisma.TransactionClient;

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SECTION_SELECT = {
  id: true,
  name: true,
  capacity: true,
  isActive: true,
} satisfies Prisma.SectionSelect;

const CLASS_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
  sections: { orderBy: { name: 'asc' }, select: SECTION_SELECT },
} satisfies Prisma.SchoolClassSelect;

export type SectionResponse = Prisma.SectionGetPayload<{
  select: typeof SECTION_SELECT;
}>;
export type ClassResponse = Prisma.SchoolClassGetPayload<{
  select: typeof CLASS_SELECT;
}>;

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListClassesQueryDto): Promise<ClassResponse[]> {
    return this.prisma.schoolClass.findMany({
      where: query.isActive === undefined ? {} : { isActive: query.isActive },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: CLASS_SELECT,
    });
  }

  async get(id: string): Promise<ClassResponse> {
    const row = await this.prisma.schoolClass.findUnique({
      where: { id },
      select: CLASS_SELECT,
    });
    if (!row) throw new NotFoundException('Class not found');
    return row;
  }

  async create(dto: CreateClassDto, actor: AuthUser): Promise<ClassResponse> {
    await this.assertClassNameFree(this.prisma, dto.name);
    const row = await this.prisma.schoolClass.create({
      data: { name: dto.name, sortOrder: dto.sortOrder },
      select: CLASS_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'class.created',
      entityType: 'class',
      entityId: row.id,
      details: { name: row.name, sortOrder: row.sortOrder },
    });
    return row;
  }

  async update(
    id: string,
    dto: UpdateClassDto,
    actor: AuthUser,
  ): Promise<ClassResponse> {
    const { row, changed } = await this.prisma.$transaction(async (tx) => {
      await this.lockClassForUpdate(tx, id);
      const current = await tx.schoolClass.findUniqueOrThrow({
        where: { id },
        select: { isActive: true },
      });

      if (dto.isActive === false && current.isActive) {
        const activeSections = await tx.section.count({
          where: { classId: id, isActive: true },
        });
        if (activeSections > 0) {
          throw new ConflictException(
            `Deactivate this class's ${activeSections} active section(s) first`,
          );
        }
      }
      if (dto.name !== undefined)
        await this.assertClassNameFree(tx, dto.name, id);

      const data: Prisma.SchoolClassUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      const updated = await tx.schoolClass.update({
        where: { id },
        data,
        select: CLASS_SELECT,
      });
      return { row: updated, changed: Object.keys(data) };
    }, TX);

    await this.audit.record({
      actor,
      action: 'class.updated',
      entityType: 'class',
      entityId: id,
      details: { changedFields: changed, isActive: dto.isActive },
    });
    return row;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const name = await this.prisma.$transaction(async (tx) => {
      await this.lockClassForUpdate(tx, id);
      const cls = await tx.schoolClass.findUniqueOrThrow({
        where: { id },
        select: { name: true },
      });
      const [sections, curriculum, resultPolicies] = await Promise.all([
        tx.section.count({ where: { classId: id } }),
        tx.classSubject.count({ where: { classId: id } }),
        tx.resultPolicy.count({ where: { classId: id } }),
      ]);
      if (sections > 0 || curriculum > 0 || resultPolicies > 0) {
        throw new ConflictException(
          'This class has sections ,curriculum records or result policies. Deactivate it instead of deleting it.',
        );
      }
      await tx.schoolClass.delete({ where: { id } });
      return cls.name;
    }, TX);
    await this.audit.record({
      actor,
      action: 'class.deleted',
      entityType: 'class',
      entityId: id,
      details: { name },
    });
  }

  async createSection(
    classId: string,
    dto: CreateSectionDto,
    actor: AuthUser,
  ): Promise<SectionResponse> {
    const section = await this.prisma.$transaction(async (tx) => {
      await this.lockActiveClassForUse(tx, classId);
      await this.assertSectionNameFree(tx, classId, dto.name);
      return tx.section.create({
        data: { classId, name: dto.name, capacity: dto.capacity },
        select: SECTION_SELECT,
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'section.created',
      entityType: 'section',
      entityId: section.id,
      details: { classId, name: section.name, capacity: section.capacity },
    });
    return section;
  }

  async updateSection(
    classId: string,
    sectionId: string,
    dto: UpdateSectionDto,
    actor: AuthUser,
  ): Promise<SectionResponse> {
    const { section, changed } = await this.prisma.$transaction(async (tx) => {
      // Row lock: enrollment takes the same lock, so capacity checks cannot race with admissions.
      const locked = await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
        SELECT id, is_active AS "isActive" FROM sections
        WHERE id = ${sectionId}::uuid AND class_id = ${classId}::uuid FOR UPDATE`;
      const current = locked[0];
      if (!current) throw new NotFoundException('Section not found');

      if (dto.isActive === true && !current.isActive)
        await this.lockActiveClassForUse(tx, classId);
      if (dto.isActive === false && current.isActive)
        await this.assertNoEnrolledStudents(tx, sectionId);
      if (dto.capacity !== undefined && dto.capacity !== null) {
        const peak = await this.peakEnrolment(tx, sectionId);
        if (dto.capacity < peak) {
          throw new ConflictException(
            `This section already has ${peak} enrolled student(s); capacity cannot be below that`,
          );
        }
      }
      if (dto.name !== undefined)
        await this.assertSectionNameFree(tx, classId, dto.name, sectionId);

      const data: Prisma.SectionUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.capacity !== undefined) data.capacity = dto.capacity;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      const updated = await tx.section.update({
        where: { id: sectionId },
        data,
        select: SECTION_SELECT,
      });
      return { section: updated, changed: Object.keys(data) };
    }, TX);

    await this.audit.record({
      actor,
      action: 'section.updated',
      entityType: 'section',
      entityId: sectionId,
      details: { classId, changedFields: changed, isActive: dto.isActive },
    });
    return section;
  }

  async removeSection(
    classId: string,
    sectionId: string,
    actor: AuthUser,
  ): Promise<void> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, classId },
      select: { name: true },
    });
    if (!section) throw new NotFoundException('Section not found');

    const [enrolments, classTeachers, teachers, sessions ,markSheet] = await Promise.all([
      this.prisma.enrollment.count({ where: { sectionId } }),
      this.prisma.classTeacherAssignment.count({ where: { sectionId } }),
      this.prisma.teachingAssignment.count({ where: { sectionId } }),
      this.prisma.attendanceSession.count({ where: { sectionId } }),
      this.prisma.markSheet.count({ where: { sectionId } })
    ]);

    if (enrolments + classTeachers + teachers + sessions + markSheet > 0) {
      throw new ConflictException(
        'This section has enrollment, teaching, or attendance history. Deactivate it instead of deleting it.',
      );
    }

    await this.prisma.section.delete({ where: { id: sectionId } });
    await this.audit.record({
      actor,
      action: 'section.deleted',
      entityType: 'section',
      entityId: sectionId,
      details: { classId, name: section.name },
    });
  }

  private async assertNoEnrolledStudents(
    tx: Tx,
    sectionId: string,
  ): Promise<void> {
    const peak = await this.peakEnrolment(tx, sectionId);
    if (peak > 0)
      throw new ConflictException(
        `This section still has ${peak} enrolled student(s). Move or withdraw them first.`,
      );
  }

  /** The most students enrolled in this section in any open academic year. */
  private async peakEnrolment(tx: Tx, sectionId: string): Promise<number> {
    const groups = await tx.enrollment.groupBy({
      by: ['academicYearId'],
      where: {
        sectionId,
        status: 'ENROLLED',
        academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
      },
      _count: { _all: true },
    });
    return Math.max(0, ...groups.map((g) => g._count._all));
  }

  /**
   * For writers that depend on a class being active (new sections, curriculum). Takes a shared row lock,
   * so a concurrent deactivation (which takes an exclusive lock) cannot slip in between check and write.
   */
  async lockActiveClassForUse(
    tx: Tx,
    id: string,
  ): Promise<{ id: string; name: string }> {
    const rows = await tx.$queryRaw<
      { id: string; name: string; isActive: boolean }[]
    >`
      SELECT id, name, is_active AS "isActive" FROM classes WHERE id = ${id}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Class not found');
    if (!row.isActive)
      throw new ConflictException(`Class "${row.name}" is inactive`);
    return { id: row.id, name: row.name };
  }

  private async lockClassForUpdate(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM classes WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Class not found');
  }

  private async assertClassNameFree(
    db: Pick<Tx, 'schoolClass'>,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await db.schoolClass.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('A class with this name already exists');
  }

  private async assertSectionNameFree(
    db: Pick<Tx, 'section'>,
    classId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await db.section.findFirst({
      where: {
        classId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'This class already has a section with this name',
      );
  }
}
