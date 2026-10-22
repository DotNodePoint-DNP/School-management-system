import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { normalizePhone } from '../../common/utils/identifier.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateGuardianLoginDto } from './dto/create-guardian-login.dto.js';
import type { ListGuardiansQueryDto } from './dto/list-guardians-query.dto.js';
import type { UpdateGuardianDto } from './dto/update-guardian.dto.js';
import {
  ParentAccountsService,
  type LoginOutcome,
} from './parent-accounts.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const SUMMARY_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullNameNp: true,
  phone: true,
  email: true,
  userId: true,
  _count: { select: { students: true } },
} satisfies Prisma.GuardianSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  occupation: true,
  address: true,
  students: {
    select: {
      relationship: true,
      isPrimary: true,
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
  },
} satisfies Prisma.GuardianSelect;

type SummaryRow = Prisma.GuardianGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.GuardianGetPayload<{ select: typeof DETAIL_SELECT }>;

export interface GuardianSummary {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  fullNameNp: string | null;
  phone: string | null;
  email: string | null;
  hasLogin: boolean;
  childrenCount: number;
}

export interface GuardianDetail extends GuardianSummary {
  occupation: string | null;
  address: string | null;
  children: {
    studentId: string;
    admissionNo: string;
    name: string;
    relationship: string;
    isPrimary: boolean;
  }[];
}

const toSummary = (r: SummaryRow): GuardianSummary => ({
  id: r.id,
  firstName: r.firstName,
  middleName: r.middleName,
  lastName: r.lastName,
  fullNameNp: r.fullNameNp,
  phone: r.phone,
  email: r.email,
  hasLogin: r.userId !== null,
  childrenCount: r._count.students,
});

const toDetail = (r: DetailRow): GuardianDetail => ({
  ...toSummary(r),
  occupation: r.occupation,
  address: r.address,
  children: r.students.map((s) => ({
    studentId: s.student.id,
    admissionNo: s.student.admissionNo,
    name: displayName(s.student),
    relationship: s.relationship,
    isPrimary: s.isPrimary,
  })),
});

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounts: ParentAccountsService,
  ) {}

  /** Use `phone` to find an existing guardian before admitting a sibling. */
  async list(
    query: ListGuardiansQueryDto,
  ): Promise<Paginated<GuardianSummary>> {
    const and: Prisma.GuardianWhereInput[] = [];
    if (query.phone) {
      const phone = normalizePhone(query.phone);
      if (!phone) throw new BadRequestException('Invalid phone number');
      and.push({ phone });
    }
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { firstName: contains },
          { lastName: contains },
          { fullNameNp: contains },
          { phone: contains },
          { email: contains },
        ],
      });
    }
    const where: Prisma.GuardianWhereInput = { AND: and };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.guardian.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: SUMMARY_SELECT,
      }),
      this.prisma.guardian.count({ where }),
    ]);
    return toPaginated(rows.map(toSummary), total, query);
  }

  async get(id: string): Promise<GuardianDetail> {
    const row = await this.prisma.guardian.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Guardian not found');
    return toDetail(row);
  }

  async update(
    id: string,
    dto: UpdateGuardianDto,
    actor: AuthUser,
  ): Promise<GuardianDetail> {
    const phone =
      dto.phone !== undefined ? normalizePhone(dto.phone) : undefined;
    if (dto.phone !== undefined && !phone)
      throw new BadRequestException('Invalid phone number');

    const changed = await this.prisma.$transaction(async (tx) => {
      const current = await tx.guardian.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!current) throw new NotFoundException('Guardian not found');

      const data: Prisma.GuardianUpdateInput = {};
      if (dto.firstName !== undefined) data.firstName = dto.firstName;
      if (dto.middleName !== undefined) data.middleName = dto.middleName;
      if (dto.lastName !== undefined) data.lastName = dto.lastName;
      if (dto.fullNameNp !== undefined) data.fullNameNp = dto.fullNameNp;
      if (phone) data.phone = phone;
      if (dto.email !== undefined) data.email = dto.email.toLowerCase();
      if (dto.occupation !== undefined) data.occupation = dto.occupation;
      if (dto.address !== undefined) data.address = dto.address;
      await tx.guardian.update({ where: { id }, data });

      // The login's contact details follow the guardian's. A clash with another account fails with 409.
      if (current.userId && (phone || dto.email !== undefined)) {
        await tx.user.update({
          where: { id: current.userId },
          data: {
            ...(phone ? { phone } : {}),
            ...(dto.email !== undefined
              ? { email: dto.email.toLowerCase() }
              : {}),
          },
        });
      }
      return Object.keys(data);
    }, TX);

    await this.audit.record({
      actor,
      action: 'guardian.updated',
      entityType: 'guardian',
      entityId: id,
      details: { changedFields: changed },
    });
    return this.get(id);
  }

  async createLogin(
    id: string,
    dto: CreateGuardianLoginDto,
    actor: AuthUser,
  ): Promise<LoginOutcome> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id },
      select: { phone: true },
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (guardian.phone && !dto.phoneConfirmed) {
      throw new BadRequestException(
        'Confirm the guardian phone number (phoneConfirmed: true) before credentials are sent to it',
      );
    }
    return this.accounts.provision(id, null, actor);
  }

  resend(id: string, actor: AuthUser): Promise<LoginOutcome> {
    return this.accounts.resend(id, actor);
  }
}
