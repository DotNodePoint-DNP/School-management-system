import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  dateParts,
  isoToDate,
  requireDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { normalizePhone } from '../../common/utils/identifier.js';
import { displayName } from '../../common/utils/person.js';
import { nextSequence } from '../../common/utils/sequence.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateUserDto } from '../users/dto/create-user.dto.js';
import { UsersService } from '../users/users.service.js';
import type { CreateStaffLoginDto } from './dto/create-staff-login.dto.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';
import type { LeaveStaffDto } from './dto/leave-staff.dto.js';
import type { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import type { UpdateStaffDto } from './dto/update-staff.dto.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const LIST_SELECT = {
  id: true,
  staffNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullNameNp: true,
  kind: true,
  designation: true,
  status: true,
  userId: true,
} satisfies Prisma.StaffSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  gender: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  address: true,
  joinDate: true,
  leftOn: true,
  statusNote: true,
} satisfies Prisma.StaffSelect;

type ListRow = Prisma.StaffGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.StaffGetPayload<{ select: typeof DETAIL_SELECT }>;

export interface StaffListItem {
  id: string;
  staffNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullNameNp: string | null;
  kind: 'TEACHING' | 'NON_TEACHING';
  designation: string | null;
  status: 'ACTIVE' | 'LEFT';
  hasLogin: boolean;
}

export interface StaffResponse extends StaffListItem {
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth: string | null;
  dateOfBirthBs: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  joinDate: string;
  joinDateBs: string | null;
  leftOn: string | null;
  leftOnBs: string | null;
  statusNote: string | null;
}

const toListItem = (r: ListRow): StaffListItem => ({
  id: r.id,
  staffNo: r.staffNo,
  firstName: r.firstName,
  middleName: r.middleName,
  lastName: r.lastName,
  fullNameNp: r.fullNameNp,
  kind: r.kind,
  designation: r.designation,
  status: r.status,
  hasLogin: r.userId !== null,
});

function toDetail(r: DetailRow): StaffResponse {
  const dob = r.dateOfBirth ? dateParts(r.dateOfBirth) : null;
  const joined = dateParts(r.joinDate);
  const left = r.leftOn ? dateParts(r.leftOn) : null;
  return {
    ...toListItem(r),
    gender: r.gender,
    dateOfBirth: dob?.ad ?? null,
    dateOfBirthBs: dob?.bs ?? null,
    phone: r.phone,
    email: r.email,
    address: r.address,
    joinDate: joined.ad,
    joinDateBs: joined.bs,
    leftOn: left?.ad ?? null,
    leftOnBs: left?.bs ?? null,
    statusNote: r.statusNote,
  };
}

const OPEN_YEAR = {
  academicYear: { status: { in: ['PLANNED', 'ACTIVE'] } },
} satisfies Prisma.TeachingAssignmentWhereInput;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async list(query: ListStaffQueryDto): Promise<Paginated<StaffListItem>> {
    const where: Prisma.StaffWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [
        { firstName: contains },
        { lastName: contains },
        { staffNo: contains },
        { fullNameNp: contains },
      ];
    }
    const order = query.sortOrder;
    const orderBy: Prisma.StaffOrderByWithRelationInput[] =
      query.sortBy === 'staffNo'
        ? [{ staffNo: order }]
        : query.sortBy === 'joinDate'
          ? [{ joinDate: order }, { id: 'asc' }]
          : [{ lastName: order }, { firstName: order }, { id: 'asc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.staff.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.staff.count({ where }),
    ]);
    return toPaginated(rows.map(toListItem), total, query);
  }

  async get(id: string): Promise<StaffResponse> {
    const row = await this.prisma.staff.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Staff member not found');
    return toDetail(row);
  }

  async create(dto: CreateStaffDto, actor: AuthUser): Promise<StaffResponse> {
    const dob = resolveDate('dateOfBirth', dto.dateOfBirth, dto.dateOfBirthBs);
    if (dob !== undefined) this.assertPast(dob);
    const joinDate = requireDate('joinDate', dto.joinDate, dto.joinDateBs);
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (dto.phone && !phone)
      throw new BadRequestException('Invalid phone number');

    const row = await this.prisma.$transaction(async (tx) => {
      const staffNo =
        dto.staffNo ??
        `STF-${String(await nextSequence(tx, 'staff')).padStart(4, '0')}`;
      return tx.staff.create({
        data: {
          staffNo,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          fullNameNp: dto.fullNameNp,
          gender: dto.gender,
          dateOfBirth: dob ? isoToDate(dob) : undefined,
          joinDate: isoToDate(joinDate),
          phone: phone ?? undefined,
          email: dto.email?.toLowerCase(),
          address: dto.address,
          kind: dto.kind,
          designation: dto.designation,
        },
        select: DETAIL_SELECT,
      });
    }, TX);
    // Personal details stay out of the audit log on purpose.
    await this.audit.record({
      actor,
      action: 'staff.created',
      entityType: 'staff',
      entityId: row.id,
      details: { staffNo: row.staffNo, kind: row.kind },
    });
    return toDetail(row);
  }

  async update(
    id: string,
    dto: UpdateStaffDto,
    actor: AuthUser,
  ): Promise<StaffResponse> {
    const dob = resolveDate('dateOfBirth', dto.dateOfBirth, dto.dateOfBirthBs);
    if (dob !== undefined) this.assertPast(dob);
    const joinDate = resolveDate('joinDate', dto.joinDate, dto.joinDateBs);
    const phone =
      dto.phone !== undefined ? normalizePhone(dto.phone) : undefined;
    if (dto.phone !== undefined && !phone)
      throw new BadRequestException('Invalid phone number');

    const { row, changed } = await this.prisma.$transaction(async (tx) => {
      await this.lockStaffRow(tx, id);
      const current = await tx.staff.findUniqueOrThrow({
        where: { id },
        select: { kind: true },
      });
      if (dto.kind === 'NON_TEACHING' && current.kind === 'TEACHING')
        await this.assertNoOpenAssignments(tx, id);

      const data: Prisma.StaffUpdateInput = {};
      if (dto.firstName !== undefined) data.firstName = dto.firstName;
      if (dto.middleName !== undefined) data.middleName = dto.middleName;
      if (dto.lastName !== undefined) data.lastName = dto.lastName;
      if (dto.fullNameNp !== undefined) data.fullNameNp = dto.fullNameNp;
      if (dto.gender !== undefined) data.gender = dto.gender;
      if (dob !== undefined) data.dateOfBirth = isoToDate(dob);
      if (joinDate !== undefined) data.joinDate = isoToDate(joinDate);
      if (phone) data.phone = phone;
      if (dto.email !== undefined) data.email = dto.email.toLowerCase();
      if (dto.address !== undefined) data.address = dto.address;
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.designation !== undefined) data.designation = dto.designation;
      const updated = await tx.staff.update({
        where: { id },
        data,
        select: DETAIL_SELECT,
      });
      return { row: updated, changed: Object.keys(data) };
    }, TX);

    await this.audit.record({
      actor,
      action: 'staff.updated',
      entityType: 'staff',
      entityId: id,
      details: { changedFields: changed },
    });
    return toDetail(row);
  }

  async leave(
    id: string,
    dto: LeaveStaffDto,
    actor: AuthUser,
  ): Promise<StaffResponse> {
    const leftOn = requireDate('leftOn', dto.leftOn, dto.leftOnBs);
    if (leftOn > todayIso())
      throw new BadRequestException('The leaving date cannot be in the future');

    const staff = await this.prisma.staff.findUnique({
      where: { id },
      select: { status: true, userId: true, joinDate: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (staff.status !== 'ACTIVE')
      throw new ConflictException('This staff member has already left');
    if (leftOn < toIsoDate(staff.joinDate))
      throw new BadRequestException(
        'The leaving date is before the joining date',
      );
    await this.assertNoOpenAssignments(this.prisma, id);

    // Same rules as deactivating the account directly (no escalation, last admin protected).
    // Done before the staff change so a refusal leaves everything untouched. A very narrow race remains:
    // an assignment created between the check above and the transaction below leaves the login
    // deactivated while the staff record stays active; an admin can reactivate the login.
    if (staff.userId) await this.users.deactivate(staff.userId, actor);

    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockStaffRow(tx, id);
      const current = await tx.staff.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (current.status !== 'ACTIVE')
        throw new ConflictException('This staff member has already left');
      await this.assertNoOpenAssignments(tx, id);
      return tx.staff.update({
        where: { id },
        data: {
          status: 'LEFT',
          leftOn: isoToDate(leftOn),
          statusNote: dto.reason,
        },
        select: DETAIL_SELECT,
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'staff.left',
      entityType: 'staff',
      entityId: id,
      details: { leftOn },
    });
    return toDetail(row);
  }

  /** Does not reactivate the login account; do that in user management. */
  async reactivate(id: string, actor: AuthUser): Promise<StaffResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockStaffRow(tx, id);
      const current = await tx.staff.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (current.status !== 'LEFT')
        throw new ConflictException('This staff member is already active');
      return tx.staff.update({
        where: { id },
        data: { status: 'ACTIVE', leftOn: null, statusNote: null },
        select: DETAIL_SELECT,
      });
    }, TX);
    await this.audit.record({
      actor,
      action: 'staff.reactivated',
      entityType: 'staff',
      entityId: id,
    });
    return toDetail(row);
  }

  async createLogin(
    id: string,
    dto: CreateStaffLoginDto,
    actor: AuthUser,
  ): Promise<{ staff: StaffResponse; temporaryPassword: string }> {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      select: {
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        userId: true,
      },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (staff.status !== 'ACTIVE')
      throw new ConflictException('This staff member has left');
    if (staff.userId)
      throw new ConflictException('This staff member already has a login');
    if (!staff.email && !staff.phone) {
      throw new BadRequestException(
        'Add an email address or phone number to this staff record first',
      );
    }

    // UsersService enforces the no-escalation rules on the roles.
    const userDto: CreateUserDto = {
      fullName: displayName(staff),
      email: staff.email ?? undefined,
      phone: staff.phone ?? undefined,
      roleIds: dto.roleIds,
    };
    const created = await this.users.create(userDto, actor);
    await this.prisma.staff.update({
      where: { id },
      data: { userId: created.user.id },
    });
    await this.audit.record({
      actor,
      action: 'staff.login_created',
      entityType: 'staff',
      entityId: id,
      details: { userId: created.user.id },
    });
    return {
      staff: await this.get(id),
      temporaryPassword: created.temporaryPassword,
    };
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const staffNo = await this.prisma.$transaction(async (tx) => {
      await this.lockStaffRow(tx, id);
      const staff = await tx.staff.findUniqueOrThrow({
        where: { id },
        select: { staffNo: true, userId: true },
      });
      if (staff.userId)
        throw new ConflictException(
          'This staff member has a login account. Mark them as left instead.',
        );
      const [a, b] = await Promise.all([
        tx.classTeacherAssignment.count({ where: { staffId: id } }),
        tx.teachingAssignment.count({ where: { staffId: id } }),
      ]);
      if (a + b > 0)
        throw new ConflictException(
          'This staff member has assignment history. Mark them as left instead.',
        );
      await tx.staff.delete({ where: { id } });
      return staff.staffNo;
    }, TX);
    await this.audit.record({
      actor,
      action: 'staff.deleted',
      entityType: 'staff',
      entityId: id,
      details: { staffNo },
    });
  }

  /** For assignment writers: shared row lock, so the person cannot leave or change kind mid-assignment. */
  async lockActiveTeacher(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string; kind: string }[]>`
      SELECT status::text AS status, kind::text AS kind FROM staff WHERE id = ${id}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw new NotFoundException('Staff member not found');
    if (row.status !== 'ACTIVE')
      throw new ConflictException('This staff member has left');
    if (row.kind !== 'TEACHING')
      throw new ConflictException(
        'Only teaching staff can be assigned to classes',
      );
  }

  private async lockStaffRow(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM staff WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0)
      throw new NotFoundException('Staff member not found');
  }

  private async assertNoOpenAssignments(
    db: Pick<Tx, 'classTeacherAssignment' | 'teachingAssignment'>,
    staffId: string,
  ): Promise<void> {
    const [a, b] = await Promise.all([
      db.classTeacherAssignment.count({ where: { staffId, ...OPEN_YEAR } }),
      db.teachingAssignment.count({ where: { staffId, ...OPEN_YEAR } }),
    ]);
    if (a + b > 0) {
      throw new ConflictException(
        `Remove this staff member's ${a + b} assignment(s) in open academic years first`,
      );
    }
  }

  private assertPast(iso: string): void {
    if (iso >= todayIso())
      throw new BadRequestException('Date of birth must be in the past');
  }
}
