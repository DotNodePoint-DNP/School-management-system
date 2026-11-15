import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AcademicYearsService } from '../academic-years/academic-years.service.js';

@Injectable()
export class FeeEnrollmentLockService {
  constructor(private readonly years: AcademicYearsService) {}

  /** Lock order: academic year (shared), then the enrollment row. Rejects closed years, and optionally students who left. */
  async lock(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    opts: { requireEnrolled: boolean },
  ): Promise<{ academicYearId: string }> {
    const found = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { academicYearId: true },
    });
    if (!found) throw new NotFoundException('Enrollment not found');
    const year = await this.years.lockYearShared(tx, found.academicYearId);
    if (year.status === 'CLOSED')
      throw new ConflictException(
        'This academic year is closed and can no longer be changed',
      );
    const rows = await tx.$queryRaw<
      { status: string }[]
    >`SELECT status::text AS status FROM enrollments WHERE id = ${enrollmentId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Enrollment not found');
    if (opts.requireEnrolled && row.status !== 'ENROLLED') {
      throw new ConflictException(
        `This student is no longer enrolled in this year (status: ${row.status.toLowerCase()})`,
      );
    }
    return { academicYearId: found.academicYearId };
  }
}
