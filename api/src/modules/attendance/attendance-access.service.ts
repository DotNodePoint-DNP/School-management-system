import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

export interface MarkRights {
  /** May take attendance for this section (class teacher, or office with mark-any). Limited to the edit window. */
  canMark: boolean;
  /** May change attendance after the edit window, with a reason. */
  canCorrect: boolean;
}

@Injectable()
export class AttendanceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private has(actor: AuthUser, permission: string): boolean {
    return actor.permissions.includes(permission);
  }

  /** Office-type roles that see and manage every section. */
  isOffice(actor: AuthUser): boolean {
    return (
      this.has(actor, 'attendance:read-all') ||
      this.has(actor, 'attendance:mark-any') ||
      this.has(actor, 'attendance:correct')
    );
  }

  async assertCanRead(
    yearId: string,
    sectionId: string,
    actor: AuthUser,
  ): Promise<void> {
    if (this.isOffice(actor)) return;
    if (
      !this.has(actor, 'attendance:read') &&
      !this.has(actor, 'attendance:mark')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance',
      );
    }
    const [classTeacher, subjectTeacher] = await Promise.all([
      this.prisma.classTeacherAssignment.count({
        where: {
          academicYearId: yearId,
          sectionId,
          staff: { userId: actor.id, status: 'ACTIVE' },
        },
      }),
      this.prisma.teachingAssignment.count({
        where: {
          academicYearId: yearId,
          sectionId,
          staff: { userId: actor.id, status: 'ACTIVE' },
        },
      }),
    ]);
    if (classTeacher + subjectTeacher === 0)
      throw new ForbiddenException('You do not have access to this section');
  }

  async tryMarkRights(
    yearId: string,
    sectionId: string,
    actor: AuthUser,
  ): Promise<MarkRights | null> {
    const canCorrect = this.has(actor, 'attendance:correct');
    let canMark = this.has(actor, 'attendance:mark-any');
    if (!canMark && this.has(actor, 'attendance:mark')) {
      canMark =
        (await this.prisma.classTeacherAssignment.count({
          where: {
            academicYearId: yearId,
            sectionId,
            staff: { userId: actor.id, status: 'ACTIVE' },
          },
        })) > 0;
    }
    return canMark || canCorrect ? { canMark, canCorrect } : null;
  }

  async markRights(
    yearId: string,
    sectionId: string,
    actor: AuthUser,
  ): Promise<MarkRights> {
    const rights = await this.tryMarkRights(yearId, sectionId, actor);
    if (!rights)
      throw new ForbiddenException(
        'Only the class teacher of this section, or office staff, can take attendance',
      );
    return rights;
  }

  /**
   * Whose attendance history may this user read? Office roles: any student, any year.
   * Teachers: only students enrolled this year in sections they teach. Out of scope looks like "not found".
   */
  async studentScope(
    studentId: string,
    actor: AuthUser,
  ): Promise<{ academicYearId?: string }> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (this.isOffice(actor)) {
      if (!student) throw new NotFoundException('Student not found');
      return {};
    }
    if (
      !this.has(actor, 'attendance:read') &&
      !this.has(actor, 'attendance:mark')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance',
      );
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    const mine = {
      academicYearId: year?.id ?? '',
      staff: { userId: actor.id, status: 'ACTIVE' as const },
    };
    const visible =
      year && student
        ? await this.prisma.enrollment.count({
            where: {
              studentId,
              academicYearId: year.id,
              status: 'ENROLLED',
              section: {
                OR: [
                  { classTeacherAssignments: { some: mine } },
                  { teachingAssignments: { some: mine } },
                ],
              },
            },
          })
        : 0;
    if (!visible) throw new NotFoundException('Student not found');
    return { academicYearId: year?.id };
  }
}
