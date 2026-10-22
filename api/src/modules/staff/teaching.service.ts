import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClassesService } from '../classes/classes.service.js';
import { StaffService } from './staff.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SUMMARY = {
  id: true,
  staffNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
} satisfies Prisma.StaffSelect;
type SummaryRow = Prisma.StaffGetPayload<{ select: typeof SUMMARY }>;

export interface StaffSummary {
  id: string;
  staffNo: string;
  name: string;
}
const toSummary = (s: SummaryRow): StaffSummary => ({
  id: s.id,
  staffNo: s.staffNo,
  name: displayName(s),
});

export interface SectionTeachingResponse {
  academicYearId: string;
  sectionId: string;
  classId: string;
  classTeacher: StaffSummary | null;
  subjects: {
    subjectId: string;
    code: string;
    name: string;
    isCompulsory: boolean;
    teacher: StaffSummary | null;
  }[];
}

export interface AssignmentsResponse {
  staffId: string;
  academicYear: { id: string; name: string } | null;
  classTeacherOf: {
    sectionId: string;
    sectionName: string;
    classId: string;
    className: string;
  }[];
  teaches: {
    sectionId: string;
    sectionName: string;
    classId: string;
    className: string;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
  }[];
}

@Injectable()
export class TeachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly classes: ClassesService,
    private readonly staff: StaffService,
  ) {}

  async getSectionTeaching(
    yearId: string,
    sectionId: string,
  ): Promise<SectionTeachingResponse> {
    const [year, section] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: yearId },
        select: { id: true },
      }),
      this.prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true, classId: true },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!section) throw new NotFoundException('Section not found');

    const [classTeacher, curriculum, assignments] = await Promise.all([
      this.prisma.classTeacherAssignment.findUnique({
        where: {
          academicYearId_sectionId: { academicYearId: yearId, sectionId },
        },
        select: { staff: { select: SUMMARY } },
      }),
      this.prisma.classSubject.findMany({
        where: { academicYearId: yearId, classId: section.classId },
        orderBy: { subject: { code: 'asc' } },
        select: {
          isCompulsory: true,
          subject: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.teachingAssignment.findMany({
        where: { academicYearId: yearId, sectionId },
        select: { subjectId: true, staff: { select: SUMMARY } },
      }),
    ]);
    const teacherBySubject = new Map(
      assignments.map((a) => [a.subjectId, toSummary(a.staff)] as const),
    );
    return {
      academicYearId: yearId,
      sectionId,
      classId: section.classId,
      classTeacher: classTeacher ? toSummary(classTeacher.staff) : null,
      subjects: curriculum.map((c) => ({
        subjectId: c.subject.id,
        code: c.subject.code,
        name: c.subject.name,
        isCompulsory: c.isCompulsory,
        teacher: teacherBySubject.get(c.subject.id) ?? null,
      })),
    };
  }

  async setClassTeacher(
    yearId: string,
    sectionId: string,
    staffId: string | null,
    actor: AuthUser,
  ): Promise<SectionTeachingResponse> {
    await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId); // closed years are read-only
      if (staffId === null) {
        await tx.classTeacherAssignment.deleteMany({
          where: { academicYearId: yearId, sectionId },
        });
        return;
      }
      const section = await this.lockActiveSection(tx, sectionId);
      await this.classes.lockActiveClassForUse(tx, section.classId);
      await this.staff.lockActiveTeacher(tx, staffId);
      await tx.classTeacherAssignment.upsert({
        where: {
          academicYearId_sectionId: { academicYearId: yearId, sectionId },
        },
        update: { staffId },
        create: { academicYearId: yearId, sectionId, staffId },
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'teaching.class_teacher_set',
      entityType: 'section',
      entityId: sectionId,
      details: { academicYearId: yearId, staffId },
    });
    return this.getSectionTeaching(yearId, sectionId);
  }

  async setSubjectTeacher(
    yearId: string,
    sectionId: string,
    subjectId: string,
    staffId: string | null,
    actor: AuthUser,
  ): Promise<SectionTeachingResponse> {
    await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, yearId);
      if (staffId === null) {
        await tx.teachingAssignment.deleteMany({
          where: { academicYearId: yearId, sectionId, subjectId },
        });
        return;
      }
      const section = await this.lockActiveSection(tx, sectionId);
      await this.classes.lockActiveClassForUse(tx, section.classId);
      const mapped = await tx.classSubject.findUnique({
        where: {
          academicYearId_classId_subjectId: {
            academicYearId: yearId,
            classId: section.classId,
            subjectId,
          },
        },
        select: { subjectId: true },
      });
      if (!mapped)
        throw new ConflictException(
          "This subject is not in the class's curriculum for this academic year",
        );
      await this.staff.lockActiveTeacher(tx, staffId);
      await tx.teachingAssignment.upsert({
        where: {
          academicYearId_sectionId_subjectId: {
            academicYearId: yearId,
            sectionId,
            subjectId,
          },
        },
        update: { staffId },
        create: {
          academicYearId: yearId,
          sectionId,
          classId: section.classId,
          subjectId,
          staffId,
        },
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'teaching.subject_teacher_set',
      entityType: 'section',
      entityId: sectionId,
      details: { academicYearId: yearId, subjectId, staffId },
    });
    return this.getSectionTeaching(yearId, sectionId);
  }

  /** One staff member's assignments, for one year, or the active year when none is given. */
  async listForStaff(
    staffId: string,
    yearId?: string,
  ): Promise<AssignmentsResponse> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return this.assignmentsFor(staffId, yearId);
  }

  /** The signed-in teacher's assignments in the active academic year. */
  async mine(userId: string): Promise<AssignmentsResponse> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!staff)
      throw new NotFoundException('No staff record is linked to this account');
    return this.assignmentsFor(staff.id);
  }

  /** For student-visibility rules: the sections this user teaches in the active year, or null if not staff. */
  async teachableSectionIds(
    userId: string,
  ): Promise<{
    staffId: string;
    academicYearId: string;
    sectionIds: string[];
  } | null> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    if (!staff || staff.status !== 'ACTIVE') return null;
    const year = await this.prisma.academicYear.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (!year) return null;
    const [ct, ta] = await Promise.all([
      this.prisma.classTeacherAssignment.findMany({
        where: { academicYearId: year.id, staffId: staff.id },
        select: { sectionId: true },
      }),
      this.prisma.teachingAssignment.findMany({
        where: { academicYearId: year.id, staffId: staff.id },
        select: { sectionId: true },
      }),
    ]);
    return {
      staffId: staff.id,
      academicYearId: year.id,
      sectionIds: [
        ...new Set([
          ...ct.map((r) => r.sectionId),
          ...ta.map((r) => r.sectionId),
        ]),
      ],
    };
  }

  private async assignmentsFor(
    staffId: string,
    yearId?: string,
  ): Promise<AssignmentsResponse> {
    const year = yearId
      ? await this.prisma.academicYear.findUnique({
          where: { id: yearId },
          select: { id: true, name: true },
        })
      : await this.prisma.academicYear.findFirst({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
        });
    if (yearId && !year) throw new NotFoundException('Academic year not found');
    if (!year)
      return { staffId, academicYear: null, classTeacherOf: [], teaches: [] };

    const sectionSelect = {
      id: true,
      name: true,
      schoolClass: { select: { id: true, name: true } },
    } as const;
    const [ct, ta] = await Promise.all([
      this.prisma.classTeacherAssignment.findMany({
        where: { academicYearId: year.id, staffId },
        select: { section: { select: sectionSelect } },
      }),
      this.prisma.teachingAssignment.findMany({
        where: { academicYearId: year.id, staffId },
        select: {
          section: { select: sectionSelect },
          classSubject: {
            select: {
              subject: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
    ]);
    return {
      staffId,
      academicYear: year,
      classTeacherOf: ct.map((r) => ({
        sectionId: r.section.id,
        sectionName: r.section.name,
        classId: r.section.schoolClass.id,
        className: r.section.schoolClass.name,
      })),
      teaches: ta.map((r) => ({
        sectionId: r.section.id,
        sectionName: r.section.name,
        classId: r.section.schoolClass.id,
        className: r.section.schoolClass.name,
        subjectId: r.classSubject.subject.id,
        subjectCode: r.classSubject.subject.code,
        subjectName: r.classSubject.subject.name,
      })),
    };
  }

  /** Shared lock: a concurrent deactivation of the section waits for this transaction. */
  private async lockActiveSection(
    tx: Tx,
    sectionId: string,
  ): Promise<{ id: string; classId: string }> {
    const rows = await tx.$queryRaw<
      { id: string; classId: string; isActive: boolean }[]
    >`
      SELECT id, class_id AS "classId", is_active AS "isActive" FROM sections WHERE id = ${sectionId}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Section not found');
    if (!row.isActive) throw new ConflictException('This section is inactive');
    return { id: row.id, classId: row.classId };
  }
}
