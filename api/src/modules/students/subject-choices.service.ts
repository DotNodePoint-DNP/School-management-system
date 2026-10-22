import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { SetOptionalSubjectsDto } from './dto/set-optional-subjects.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

export interface SubjectView {
  subjectId: string;
  code: string;
  name: string;
}

export interface EnrollmentChoicesResponse {
  enrollmentId: string;
  academicYearId: string;
  classId: string;
  status: string;
  compulsory: SubjectView[];
  optional: (SubjectView & { chosen: boolean })[];
}

export interface SubjectRosterResponse {
  academicYearId: string;
  sectionId: string;
  subject: SubjectView & { isCompulsory: boolean };
  count: number;
  students: {
    enrollmentId: string;
    studentId: string;
    admissionNo: string;
    name: string;
    rollNo: number | null;
  }[];
}

interface EnrollmentRef {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  status: string;
}

@Injectable()
export class SubjectChoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async get(
    enrollmentId: string,
    actor: AuthUser,
  ): Promise<EnrollmentChoicesResponse> {
    const enrollment = await this.findEnrollment(enrollmentId);
    await this.enrollments.assertSectionAccess(
      enrollment.academicYearId,
      enrollment.sectionId,
      actor,
    );
    return this.view(enrollment);
  }

  async replace(
    enrollmentId: string,
    dto: SetOptionalSubjectsDto,
    actor: AuthUser,
  ): Promise<EnrollmentChoicesResponse> {
    const found = await this.findEnrollment(enrollmentId);

    const summary = await this.prisma.$transaction(async (tx) => {
      await this.years.lockWritableYear(tx, found.academicYearId); // rejects closed years; also serialises against curriculum edits

      const current = await tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        select: { status: true, classId: true },
      });
      if (current.status !== 'ENROLLED') {
        throw new ConflictException(
          'Only a current enrollment can have optional subjects chosen',
        );
      }

      const wanted = [...new Set(dto.subjectIds)];
      const mapped =
        wanted.length === 0
          ? []
          : await tx.classSubject.findMany({
              where: {
                academicYearId: found.academicYearId,
                classId: current.classId,
                subjectId: { in: wanted },
              },
              select: {
                subjectId: true,
                isCompulsory: true,
                subject: { select: { code: true } },
              },
            });
      if (mapped.length !== wanted.length) {
        throw new BadRequestException(
          "One or more subjects are not in this class's curriculum for this academic year",
        );
      }
      const compulsory = mapped.filter((m) => m.isCompulsory);
      if (compulsory.length > 0) {
        throw new BadRequestException(
          `Compulsory subjects cannot be chosen: ${compulsory.map((c) => c.subject.code).join(', ')}`,
        );
      }

      const existing = await tx.studentSubjectChoice.findMany({
        where: { enrollmentId },
        select: { subjectId: true },
      });
      const have = new Set(existing.map((e) => e.subjectId));
      const toAdd = wanted.filter((id) => !have.has(id));
      const toRemove = [...have].filter((id) => !wanted.includes(id));

      if (toRemove.length > 0) {
        await tx.studentSubjectChoice.deleteMany({
          where: { enrollmentId, subjectId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.studentSubjectChoice.createMany({
          data: toAdd.map((subjectId) => ({
            enrollmentId,
            subjectId,
            academicYearId: found.academicYearId,
            classId: current.classId,
          })),
        });
      }
      return {
        added: toAdd.length,
        removed: toRemove.length,
        total: wanted.length,
      };
    }, TX);

    await this.audit.record({
      actor,
      action: 'enrollment.subject_choices_set',
      entityType: 'enrollment',
      entityId: enrollmentId,
      details: summary,
    });
    return this.view(await this.findEnrollment(enrollmentId));
  }

  /** Who studies this subject in this section: everyone for a compulsory subject, only the choosers for an optional one. */
  async roster(
    yearId: string,
    sectionId: string,
    subjectId: string,
    actor: AuthUser,
  ): Promise<SubjectRosterResponse> {
    await this.enrollments.assertSectionAccess(yearId, sectionId, actor);
    const section = await this.prisma.section.findUniqueOrThrow({
      where: { id: sectionId },
      select: { classId: true },
    });

    const mapping = await this.prisma.classSubject.findUnique({
      where: {
        academicYearId_classId_subjectId: {
          academicYearId: yearId,
          classId: section.classId,
          subjectId,
        },
      },
      select: {
        isCompulsory: true,
        subject: { select: { id: true, code: true, name: true } },
      },
    });
    if (!mapping)
      throw new NotFoundException(
        "This subject is not in the class's curriculum for this academic year",
      );

    const rows = await this.prisma.enrollment.findMany({
      where: {
        academicYearId: yearId,
        sectionId,
        status: 'ENROLLED',
        ...(mapping.isCompulsory
          ? {}
          : { subjectChoices: { some: { subjectId } } }),
      },
      orderBy: [
        { rollNo: { sort: 'asc', nulls: 'last' } },
        { student: { lastName: 'asc' } },
        { id: 'asc' },
      ],
      select: {
        id: true,
        rollNo: true,
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
    });
    return {
      academicYearId: yearId,
      sectionId,
      subject: {
        subjectId: mapping.subject.id,
        code: mapping.subject.code,
        name: mapping.subject.name,
        isCompulsory: mapping.isCompulsory,
      },
      count: rows.length,
      students: rows.map((r) => ({
        enrollmentId: r.id,
        studentId: r.student.id,
        admissionNo: r.student.admissionNo,
        name: displayName(r.student),
        rollNo: r.rollNo,
      })),
    };
  }

  private async findEnrollment(id: string): Promise<EnrollmentRef> {
    const row = await this.prisma.enrollment.findUnique({
      where: { id },
      select: {
        id: true,
        academicYearId: true,
        classId: true,
        sectionId: true,
        status: true,
      },
    });
    if (!row) throw new NotFoundException('Enrollment not found');
    return row;
  }

  private async view(e: EnrollmentRef): Promise<EnrollmentChoicesResponse> {
    const [curriculum, chosen] = await Promise.all([
      this.prisma.classSubject.findMany({
        where: { academicYearId: e.academicYearId, classId: e.classId },
        orderBy: { subject: { code: 'asc' } },
        select: {
          isCompulsory: true,
          subject: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.studentSubjectChoice.findMany({
        where: { enrollmentId: e.id },
        select: { subjectId: true },
      }),
    ]);
    const chosenIds = new Set(chosen.map((c) => c.subjectId));
    const toView = (s: {
      id: string;
      code: string;
      name: string;
    }): SubjectView => ({ subjectId: s.id, code: s.code, name: s.name });
    return {
      enrollmentId: e.id,
      academicYearId: e.academicYearId,
      classId: e.classId,
      status: e.status,
      compulsory: curriculum
        .filter((c) => c.isCompulsory)
        .map((c) => toView(c.subject)),
      optional: curriculum
        .filter((c) => !c.isCompulsory)
        .map((c) => ({
          ...toView(c.subject),
          chosen: chosenIds.has(c.subject.id),
        })),
    };
  }
}
