import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class MarksAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private has(actor: AuthUser, permission: string): boolean {
    return actor.permissions.includes(permission);
  }

  /** May this user enter or submit marks for this section and subject? */
  async canEnter(
    yearId: string,
    sectionId: string,
    subjectId: string,
    actor: AuthUser,
  ): Promise<boolean> {
    if (this.has(actor, 'marks:enter-any')) return true;
    if (!this.has(actor, 'marks:enter')) return false;
    const assigned = await this.prisma.teachingAssignment.count({
      where: {
        academicYearId: yearId,
        sectionId,
        subjectId,
        staff: { userId: actor.id, status: 'ACTIVE' },
      },
    });
    return assigned > 0;
  }

  /** Controllers see everything. Subject teachers see their subject; the class teacher sees every subject of the section. */
  async assertCanRead(
    yearId: string,
    sectionId: string,
    subjectId: string,
    actor: AuthUser,
  ): Promise<void> {
    if (
      this.has(actor, 'marks:read-all') ||
      this.has(actor, 'marks:enter-any') ||
      this.has(actor, 'marks:correct')
    )
      return;
    if (!this.has(actor, 'marks:read') && !this.has(actor, 'marks:enter')) {
      throw new ForbiddenException('You do not have permission to view marks');
    }
    const staff = { userId: actor.id, status: 'ACTIVE' as const };
    const [subjectTeacher, classTeacher] = await Promise.all([
      this.prisma.teachingAssignment.count({
        where: { academicYearId: yearId, sectionId, subjectId, staff },
      }),
      this.prisma.classTeacherAssignment.count({
        where: { academicYearId: yearId, sectionId, staff },
      }),
    ]);
    if (subjectTeacher + classTeacher === 0)
      throw new ForbiddenException('You do not have access to these marks');
  }
}
