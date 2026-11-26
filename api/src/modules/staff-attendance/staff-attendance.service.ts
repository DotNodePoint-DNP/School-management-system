import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  parseIsoDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { verifyPosition } from './geofence.js';
import type {
  StaffPolicyDto,
  PunchDto,
  StaffRequestDto,
  ReviewDto,
} from './staff-attendance.dto.js';

type Tx = Prisma.TransactionClient;
const schoolDate = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
const schoolTime = (date: string, time: string) =>
  new Date(date + 'T' + time + ':00+05:45');
const policyAt = (tx: Tx, at: Date) =>
  tx.staffAttendancePolicy.findFirst({
    where: { createdAt: { lte: at } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
const staffName = { firstName: true, lastName: true, staffNo: true } as const;

@Injectable()
export class StaffAttendanceService {
  constructor(private readonly db: PrismaService) {}

  policy() {
    return policyAt(this.db, new Date());
  }

  savePolicy(dto: StaffPolicyDto, actor: AuthUser) {
    if (!actor.roles.includes('ADMIN'))
      throw new ForbiddenException(
        'Only a school administrator can set the location.',
      );
    if (dto.endsAt <= dto.startsAt)
      throw new BadRequestException(
        'Shift end must follow its start on the same day.',
      );
    return this.db.staffAttendancePolicy.create({
      data: {
        name: dto.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radius: dto.radius,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        grace: dto.grace,
        offDays: dto.offDays,
        createdBy: actor.id,
      },
    });
  }

  private async staff(tx: Tx, actor: AuthUser, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM staff WHERE user_id = ${actor.id}::uuid FOR UPDATE`;
    const row = await tx.staff.findUnique({ where: { userId: actor.id } });
    if (!row || row.status !== 'ACTIVE' || toIsoDate(row.joinDate) > todayIso())
      throw new ForbiddenException(
        'An active staff record linked to this account is required.',
      );
    return row;
  }

  async mine(actor: AuthUser) {
    const staff = await this.staff(this.db, actor);
    const [punches, requests, policy] = await Promise.all([
      this.db.staffPunch.findMany({
        where: { staffId: staff.id },
        orderBy: { at: 'desc' },
        take: 90,
      }),
      this.db.staffAttendanceRequest.findMany({
        where: { staffId: staff.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.policy(),
    ]);
    return {
      today: todayIso(),
      punches,
      requests,
      campus: policy?.name ?? null,
    };
  }

  private async ensureAvailable(
    tx: Tx,
    staffId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    if (
      await tx.staffAttendanceRequest.count({
        where: {
          staffId,
          kind: 'LEAVE',
          status: 'APPROVED',
          fromDate: { lte: toDate },
          toDate: { gte: fromDate },
        },
      })
    )
      throw new ConflictException('Approved leave already covers this date.');
  }

  punch(dto: PunchDto, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const staff = await this.staff(tx, actor, true);
      const now = new Date();
      const workDate = parseIsoDate(dto.workDate, 'Work date');
      if (schoolDate(now) !== dto.workDate)
        throw new ConflictException(
          'The school date has changed. Refresh and try again.',
        );
      const punches = await tx.staffPunch.findMany({
        where: { staffId: staff.id, workDate },
      });
      const existing = punches.find((p) => p.kind === dto.kind);
      if (existing) return existing;
      if (dto.kind === 'OUT' && !punches.length)
        throw new ConflictException(
          'Check in first or request a missed check-in.',
        );
      await this.ensureAvailable(tx, staff.id, workDate, workDate);
      const policy = await policyAt(tx, now);
      if (!policy)
        throw new ConflictException(
          'Ask an administrator to configure the school location.',
        );
      const distance = verifyPosition(policy, dto, now.getTime());
      return tx.staffPunch.create({
        data: {
          staffId: staff.id,
          workDate,
          kind: dto.kind,
          at: now,
          policyId: policy.id,
          distance,
          accuracy: dto.accuracy,
        },
      });
    });
  }

  request(dto: StaffRequestDto, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const staff = await this.staff(tx, actor, true);
      const fromDate = parseIsoDate(dto.fromDate, 'Start date');
      const toDate = parseIsoDate(dto.toDate, 'End date');
      if (fromDate < staff.joinDate || toDate < fromDate)
        throw new BadRequestException(
          'Choose dates within employment, in chronological order.',
        );
      const proposedAt = dto.proposedAt ? new Date(dto.proposedAt) : null;
      const leave = dto.kind === 'LEAVE';
      if (leave && proposedAt)
        throw new BadRequestException('Leave covers whole days.');
      if (
        !leave &&
        (!proposedAt ||
          proposedAt > new Date() ||
          schoolDate(proposedAt) !== dto.fromDate ||
          dto.fromDate !== dto.toDate)
      )
        throw new BadRequestException(
          'Use a past school-local time on the correction date.',
        );
      await this.ensureAvailable(tx, staff.id, fromDate, toDate);
      if (
        await tx.staffAttendanceRequest.count({
          where: {
            staffId: staff.id,
            kind: dto.kind,
            status: 'PENDING',
            fromDate: { lte: toDate },
            toDate: { gte: fromDate },
          },
        })
      )
        throw new ConflictException(
          'An overlapping request is already pending.',
        );
      if (
        await tx.staffPunch.count({
          where: {
            staffId: staff.id,
            workDate: { gte: fromDate, lte: toDate },
            kind: leave ? undefined : dto.kind === 'MISSED_IN' ? 'IN' : 'OUT',
          },
        })
      )
        throw new ConflictException(
          'Attendance already exists for the requested time.',
        );
      return tx.staffAttendanceRequest.create({
        data: {
          requestedBy: actor.id,
          staffId: staff.id,
          kind: dto.kind,
          fromDate,
          toDate,
          proposedAt,
          reason: dto.reason,
        },
      });
    });
  }

  queue() {
    return this.db.staffAttendanceRequest.findMany({
      where: { status: 'PENDING' },
      include: { staff: { select: staffName } },
      orderBy: { createdAt: 'asc' },
    });
  }

  review(id: string, dto: ReviewDto, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const target = await tx.staffAttendanceRequest.findUnique({
        where: { id },
        select: { staffId: true },
      });
      if (!target) throw new NotFoundException('Request not found.');
      await tx.$queryRaw`SELECT id FROM staff WHERE id = ${target.staffId}::uuid FOR UPDATE`;
      const row = await tx.staffAttendanceRequest.findUniqueOrThrow({
        where: { id },
        include: { staff: { select: { userId: true } } },
      });
      if (row.staff.userId === actor.id || row.requestedBy === actor.id)
        throw new ForbiddenException(
          'Another reviewer must decide your request.',
        );
      if (row.status !== 'PENDING')
        throw new ConflictException('This request has already been decided.');
      if (dto.status === 'APPROVED') {
        await this.ensureAvailable(tx, row.staffId, row.fromDate, row.toDate);
        const punches = await tx.staffPunch.findMany({
          where: {
            staffId: row.staffId,
            workDate: { gte: row.fromDate, lte: row.toDate },
          },
        });
        if (row.kind === 'LEAVE') {
          if (punches.length)
            throw new ConflictException(
              'Attendance exists within this leave period.',
            );
        } else {
          const at = row.proposedAt!;
          const kind = row.kind === 'MISSED_IN' ? 'IN' : 'OUT';
          if (punches.some((p) => p.kind === kind))
            throw new ConflictException('This punch already exists.');
          if (
            kind === 'OUT' &&
            !punches.some((p) => p.kind === 'IN' && p.at < at)
          )
            throw new ConflictException(
              'A check-in before this check-out is required.',
            );
          const policy = await policyAt(tx, at);
          if (!policy)
            throw new ConflictException(
              'Attendance was not configured at the requested time.',
            );
          await tx.staffPunch.create({
            data: {
              staffId: row.staffId,
              workDate: row.fromDate,
              kind,
              at,
              policyId: policy.id,
              requestId: id,
            },
          });
        }
      }
      return tx.staffAttendanceRequest.update({
        where: { id },
        data: {
          status: dto.status,
          reviewNote: dto.note,
          reviewedAt: new Date(),
          reviewedBy: actor.id,
        },
      });
    });
  }

  async register(date: string) {
    const day = parseIsoDate(date, 'Register date');
    const [staff, policy, calendar] = await Promise.all([
      this.db.staff.findMany({
        where: {
          joinDate: { lte: day },
          OR: [{ status: 'ACTIVE' }, { leftOn: { gte: day } }],
        },
        orderBy: { staffNo: 'asc' },
        select: {
          ...staffName,
          id: true,
          kind: true,
          userId: true,
          attendancePunches: {
            where: { workDate: day },
            include: { policy: true },
          },
          attendanceRequests: {
            where: {
              fromDate: { lte: day },
              toDate: { gte: day },
              status: { in: ['PENDING', 'APPROVED'] },
            },
            select: { kind: true, status: true },
          },
        },
      }),
      // Start absence tracking on the first full school day after configuration.
      policyAt(this.db, schoolTime(date, '00:00')),
      this.db.calendarEntry.findFirst({
        where: {
          date: day,
          academicYear: { startDate: { lte: day }, endDate: { gte: day } },
        },
        select: { kind: true },
      }),
    ]);
    return staff.map((s) => {
      const entry = s.attendancePunches.find((p) => p.kind === 'IN');
      const exit = s.attendancePunches.find((p) => p.kind === 'OUT');
      const rules = entry?.policy ?? policy;
      const leave = s.attendanceRequests.some(
        (r) => r.kind === 'LEAVE' && r.status === 'APPROVED',
      );
      const closed =
        rules && Date.now() >= schoolTime(date, rules.endsAt).getTime();
      let status = 'Awaiting check-in';
      if (leave) status = 'On leave';
      else if (exit) status = 'Checked out';
      else if (entry) status = closed ? 'Missing check-out' : 'Checked in';
      else if (s.attendanceRequests.some((r) => r.status === 'PENDING'))
        status = 'Pending review';
      else if (
        !rules ||
        calendar?.kind === 'HOLIDAY' ||
        (calendar?.kind !== 'WORKING_DAY' &&
          rules.offDays.includes(day.getUTCDay()))
      )
        status = 'Unscheduled';
      else if (!s.userId) status = 'Account unlinked';
      else if (closed) status = 'Absent';
      return {
        staffNo: s.staffNo,
        name: s.firstName + ' ' + s.lastName,
        kind: s.kind,
        status,
        checkIn: entry?.at,
        checkOut: exit?.at,
        late: !!(
          entry &&
          rules &&
          entry.at.getTime() >
            schoolTime(date, rules.startsAt).getTime() + rules.grace * 60000
        ),
        early: !!(exit && rules && exit.at < schoolTime(date, rules.endsAt)),
        minutes:
          entry && exit
            ? Math.floor((exit.at.getTime() - entry.at.getTime()) / 60000)
            : null,
      };
    });
  }
}
