import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth.types.js';
import { TeachingService } from '../staff/teaching.service.js';

export type StudentScope =
  | { kind: 'all' }
  | { kind: 'sections'; academicYearId: string; sectionIds: string[] }
  | { kind: 'none' };

@Injectable()
export class StudentAccessService {
  constructor(private readonly teaching: TeachingService) {}

  /** `students:read-all` sees everyone; `students:read` sees only students in sections the user teaches this year. */
  async scopeFor(actor: AuthUser): Promise<StudentScope> {
    if (actor.permissions.includes('students:read-all')) return { kind: 'all' };
    if (!actor.permissions.includes('students:read')) return { kind: 'none' };
    const taught = await this.teaching.teachableSectionIds(actor.id);
    if (!taught || taught.sectionIds.length === 0) return { kind: 'none' };
    return {
      kind: 'sections',
      academicYearId: taught.academicYearId,
      sectionIds: taught.sectionIds,
    };
  }

  /** null means "no access at all". */
  toWhere(scope: StudentScope): Prisma.StudentWhereInput | null {
    switch (scope.kind) {
      case 'all':
        return {};
      case 'sections':
        return {
          enrollments: {
            some: {
              academicYearId: scope.academicYearId,
              sectionId: { in: scope.sectionIds },
              status: 'ENROLLED',
            },
          },
        };
      case 'none':
        return null;
    }
  }
}
