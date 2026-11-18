import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class PortalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in user's own guardian record. The parent is never taken from the request. */
  async guardianOf(actor: AuthUser) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { userId: actor.id },
      select: { id: true, firstName: true, middleName: true, lastName: true },
    });
    if (!guardian)
      throw new ForbiddenException(
        'This account is not linked to a guardian record. Please contact the school office.',
      );
    return guardian;
  }

  /**
   * The one gate. A child is reachable only through an active link of this parent. A child of another family, a child whose
   * link the school switched off, and an id that does not exist all give the same answer.
   */
  async requireChild(actor: AuthUser, studentId: string): Promise<void> {
    const link = await this.prisma.studentGuardian.findFirst({
      where: { studentId, portalAccess: true, guardian: { userId: actor.id } },
      select: { guardianId: true },
    });
    if (!link) throw new NotFoundException('Child not found');
  }

  /** One of this child's enrollments, or the most recent one. Call only after requireChild. */
  async requireEnrollment(studentId: string, enrollmentId?: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, ...(enrollmentId ? { id: enrollmentId } : {}) },
      orderBy: { academicYear: { startDate: 'desc' } },
      select: {
        id: true,
        academicYearId: true,
        classId: true,
        sectionId: true,
        status: true,
      },
    });
    if (!enrollment)
      throw new NotFoundException(
        enrollmentId
          ? 'Enrollment not found'
          : 'This child has no enrollment yet',
      );
    return enrollment;
  }

  /** The children this parent may currently see (links the school has not switched off). */
  async childIds(actor: AuthUser): Promise<string[]> {
    const guardian = await this.guardianOf(actor);
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: guardian.id, portalAccess: true },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }
}
