import { Injectable } from '@nestjs/common';
import {
  ATTENDANCE_STATUSES,
  ATTENDED_STATUSES,
  type AttendanceStatusValue,
} from '../../common/constants/attendance.js';
import { isoToDate } from '../../common/utils/bs-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface PeriodAttendance {
  from: string;
  to: string;
  /** Days on which attendance was recorded for this student in the period. */
  totalDays: number;
  /** Present + Late. */
  present: number;
  /** Absent + Leave. */
  absent: number;
  late: number;
  leave: number;
  /** present / totalDays, one decimal; null when nothing is recorded. */
  percentage: number | null;
}

@Injectable()
export class AttendanceSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every id gets an entry, even with no records (all zeros). */
  async forEnrollments(
    enrollmentIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, PeriodAttendance>> {
    const counts = new Map<string, Record<AttendanceStatusValue, number>>(
      enrollmentIds.map(
        (id) => [id, { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 }] as const,
      ),
    );
    if (enrollmentIds.length > 0 && from <= to) {
      const grouped = await this.prisma.attendanceRecord.groupBy({
        by: ['enrollmentId', 'status'],
        where: {
          enrollmentId: { in: enrollmentIds },
          date: { gte: isoToDate(from), lte: isoToDate(to) },
        },
        _count: { _all: true },
      });
      for (const g of grouped) {
        const entry = counts.get(g.enrollmentId);
        if (entry) entry[g.status] = g._count._all;
      }
    }
    const result = new Map<string, PeriodAttendance>();
    for (const [id, c] of counts) {
      const totalDays = ATTENDANCE_STATUSES.reduce((n, s) => n + c[s], 0);
      const present = ATTENDED_STATUSES.reduce((n, s) => n + c[s], 0);
      result.set(id, {
        from,
        to,
        totalDays,
        present,
        absent: totalDays - present,
        late: c.LATE,
        leave: c.LEAVE,
        percentage:
          totalDays === 0
            ? null
            : Math.round((present / totalDays) * 1000) / 10,
      });
    }
    return result;
  }
}
