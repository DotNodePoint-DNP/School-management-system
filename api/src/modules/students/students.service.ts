import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  adToBsString,
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
import {
  ParentAccountsService,
  type LoginOutcome,
} from '../guardians/parent-accounts.service.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { GuardianInputDto } from './dto/guardian-input.dto.js';
import type { ListStudentsQueryDto } from './dto/list-students-query.dto.js';
import type { ReplaceStudentGuardiansDto } from './dto/replace-student-guardians.dto.js';
import type { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentAccessService } from './student-access.service.js';
import {
  EnrollmentsService,
  type EnrollmentRow,
} from './enrollments.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const ENROLLMENT_SELECT = {
  rollNo: true,
  status: true,
  section: {
    select: {
      id: true,
      name: true,
      schoolClass: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

const LIST_SELECT = {
  id: true,
  admissionNo: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullNameNp: true,
  gender: true,
  status: true,
  enrollments: {
    where: { academicYear: { status: 'ACTIVE' } },
    take: 1,
    select: ENROLLMENT_SELECT,
  },
} satisfies Prisma.StudentSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  dateOfBirth: true,
  admissionDate: true,
  address: true,
  statusChangedOn: true,
  statusNote: true,
  guardians: {
    orderBy: { isPrimary: 'desc' },
    select: {
      relationship: true,
      isPrimary: true,
      isEmergencyContact: true,
      guardian: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          fullNameNp: true,
          phone: true,
          email: true,
          userId: true,
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

type ListRow = Prisma.StudentGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.StudentGetPayload<{ select: typeof DETAIL_SELECT }>;

export interface EnrollmentView {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  rollNo: number | null;
  status: string;
}

export interface StudentListItem {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullNameNp: string | null;
  gender: string;
  status: string;
  enrollment: EnrollmentView | null;
}

export interface StudentDetail extends StudentListItem {
  dateOfBirth: string;
  dateOfBirthBs: string | null;
  admissionDate: string;
  admissionDateBs: string | null;
  address: string | null;
  statusChangedOn: string | null;
  statusNote: string | null;
  guardians: {
    guardianId: string;
    name: string;
    relationship: string;
    isPrimary: boolean;
    isEmergencyContact: boolean;
    phone: string | null;
    email: string | null;
    hasLogin: boolean;
  }[];
}

function toEnrollment(rows: ListRow['enrollments']): EnrollmentView | null {
  const e = rows[0];
  if (!e) return null;
  return {
    classId: e.section.schoolClass.id,
    className: e.section.schoolClass.name,
    sectionId: e.section.id,
    sectionName: e.section.name,
    rollNo: e.rollNo,
    status: e.status,
  };
}

const toListItem = (r: ListRow): StudentListItem => ({
  id: r.id,
  admissionNo: r.admissionNo,
  firstName: r.firstName,
  middleName: r.middleName,
  lastName: r.lastName,
  fullNameNp: r.fullNameNp,
  gender: r.gender,
  status: r.status,
  enrollment: toEnrollment(r.enrollments),
});

function toDetail(r: DetailRow): StudentDetail {
  const dob = dateParts(r.dateOfBirth);
  const admitted = dateParts(r.admissionDate);
  return {
    ...toListItem(r),
    dateOfBirth: dob.ad,
    dateOfBirthBs: dob.bs,
    admissionDate: admitted.ad,
    admissionDateBs: admitted.bs,
    address: r.address,
    statusChangedOn: r.statusChangedOn ? toIsoDate(r.statusChangedOn) : null,
    statusNote: r.statusNote,
    guardians: r.guardians.map((g) => ({
      guardianId: g.guardian.id,
      name: displayName(g.guardian),
      relationship: g.relationship,
      isPrimary: g.isPrimary,
      isEmergencyContact: g.isEmergencyContact,
      phone: g.guardian.phone,
      email: g.guardian.email,
      hasLogin: g.guardian.userId !== null,
    })),
  };
}

interface PreparedGuardian {
  guardianId?: string;
  person?: {
    firstName: string;
    middleName?: string;
    lastName?: string;
    fullNameNp?: string;
    phone?: string;
    email?: string;
    occupation?: string;
    address?: string;
  };
  relationship: string;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  createLogin: boolean;
}

interface ResolvedLink {
  guardianId: string;
  relationship: string;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  createLogin: boolean;
}

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: StudentAccessService,
    private readonly accounts: ParentAccountsService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async list(
    query: ListStudentsQueryDto,
    actor: AuthUser,
  ): Promise<Paginated<StudentListItem>> {
    const scope = this.access.toWhere(await this.access.scopeFor(actor));
    if (!scope)
      throw new ForbiddenException(
        'You do not have permission to view students',
      );

    const and: Prisma.StudentWhereInput[] = [scope];
    if (query.status) and.push({ status: query.status });
    if (query.gender) and.push({ gender: query.gender });
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { firstName: contains },
          { lastName: contains },
          { fullNameNp: contains },
          { admissionNo: contains },
        ],
      });
    }
    if (query.classId || query.sectionId) {
      and.push({
        enrollments: {
          some: {
            academicYear: { status: 'ACTIVE' },
            ...(query.sectionId ? { sectionId: query.sectionId } : {}),
            ...(query.classId ? { section: { classId: query.classId } } : {}),
          },
        },
      });
    }

    const order = query.sortOrder;
    const orderBy: Prisma.StudentOrderByWithRelationInput[] =
      query.sortBy === 'admissionNo'
        ? [{ admissionNo: order }]
        : query.sortBy === 'admissionDate'
          ? [{ admissionDate: order }, { id: 'asc' }]
          : [{ lastName: order }, { firstName: order }, { id: 'asc' }];

    const where: Prisma.StudentWhereInput = { AND: and };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.student.count({ where }),
    ]);
    return toPaginated(rows.map(toListItem), total, query);
  }

  async get(id: string, actor: AuthUser): Promise<StudentDetail> {
    const scope = this.access.toWhere(await this.access.scopeFor(actor));
    if (!scope)
      throw new ForbiddenException(
        'You do not have permission to view students',
      );
    // Out-of-scope students look exactly like missing ones.
    const row = await this.prisma.student.findFirst({
      where: { id, ...scope },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Student not found');
    return toDetail(row);
  }

  async create(
    dto: CreateStudentDto,
    actor: AuthUser,
  ): Promise<{ student: StudentDetail; logins: LoginOutcome[] }> {
    const dob = requireDate('dateOfBirth', dto.dateOfBirth, dto.dateOfBirthBs);
    const admissionDate =
      resolveDate('admissionDate', dto.admissionDate, dto.admissionDateBs) ??
      todayIso();
    this.assertDates(dob, admissionDate);
    if (
      dto.admissionNo &&
      !actor.permissions.includes('students:set-admission-no')
    ) {
      throw new ForbiddenException(
        'You do not have permission to enter an admission number manually',
      );
    }
    if (dto.placement && !actor.permissions.includes('enrollments:manage')) {
      throw new ForbiddenException(
        'You do not have permission to place students in a class',
      );
    }
    const placementYearId = dto.placement
      ? await this.enrollments.resolveYearId(dto.placement.academicYearId)
      : null;
    const bsYear = Number(adToBsString(admissionDate)?.slice(0, 4));
    if (!bsYear)
      throw new BadRequestException(
        'The admission date is outside the supported Bikram Sambat range',
      );
    const prepared = this.prepareGuardians(dto.guardians);
    let placed: EnrollmentRow | null = null;
    const { studentId, links } = await this.prisma.$transaction(async (tx) => {
      if (!dto.confirmNotDuplicate)
        await this.assertNoDuplicate(tx, dto.firstName, dto.lastName, dob);
      const resolved = await this.resolveGuardians(tx, prepared);
      const admissionNo =
        dto.admissionNo ?? (await this.generateAdmissionNo(tx, bsYear));
      const student = await tx.student.create({
        data: {
          admissionNo,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          fullNameNp: dto.fullNameNp,
          gender: dto.gender,
          dateOfBirth: isoToDate(dob),
          admissionDate: isoToDate(admissionDate),
          address: dto.address,
          guardians: {
            create: resolved.map((l) => ({
              guardianId: l.guardianId,
              relationship: l.relationship,
              isPrimary: l.isPrimary,
              isEmergencyContact: l.isEmergencyContact,
            })),
          },
        },
        select: { id: true },
      });
      if (dto.placement && placementYearId) {
        placed = await this.enrollments.enrollInTx(tx, {
          studentId: student.id,
          academicYearId: placementYearId,
          sectionId: dto.placement.sectionId,
          rollNo: dto.placement.rollNo,
        });
      }
      return { studentId: student.id, links: resolved };
    }, TX);

    // Personal details stay out of the audit log on purpose.
    const created = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { admissionNo: true },
    });
    await this.audit.record({
      actor,
      action: 'student.created',
      entityType: 'student',
      entityId: studentId,
      details: {
        admissionNo: created.admissionNo,
        guardianCount: links.length,
      },
    });
    if (placed) await this.enrollments.recordCreated(placed, actor);
    // Accounts are created after the student is saved, so a failed SMS never undoes an admission.
    const childName = displayName(dto);
    const logins: LoginOutcome[] = [];
    for (const link of links.filter((l) => l.createLogin)) {
      try {
        logins.push(
          await this.accounts.provision(link.guardianId, childName, actor),
        );
      } catch (error) {
        this.logger.error(
          `Parent login failed for guardian ${link.guardianId}`,
          error instanceof Error ? error.stack : String(error),
        );
        logins.push({
          guardianId: link.guardianId,
          status: 'failed',
          message:
            'The login could not be created. Retry from the guardian record.',
        });
      }
    }
    return { student: await this.getUnscoped(studentId), logins };
  }

  async update(
    id: string,
    dto: UpdateStudentDto,
    actor: AuthUser,
  ): Promise<StudentDetail> {
    const dob = resolveDate('dateOfBirth', dto.dateOfBirth, dto.dateOfBirthBs);

    const changed = await this.prisma.$transaction(async (tx) => {
      const current = await tx.student.findUnique({
        where: { id },
        select: { dateOfBirth: true, admissionDate: true },
      });
      if (!current) throw new NotFoundException('Student not found');
      if (dob !== undefined)
        this.assertDates(dob, toIsoDate(current.admissionDate), {
          checkAdmissionNotFuture: false,
        });

      const data: Prisma.StudentUpdateInput = {};
      if (dto.firstName !== undefined) data.firstName = dto.firstName;
      if (dto.middleName !== undefined) data.middleName = dto.middleName;
      if (dto.lastName !== undefined) data.lastName = dto.lastName;
      if (dto.fullNameNp !== undefined) data.fullNameNp = dto.fullNameNp;
      if (dto.gender !== undefined) data.gender = dto.gender;
      if (dob !== undefined) data.dateOfBirth = isoToDate(dob);
      if (dto.address !== undefined) data.address = dto.address;
      await tx.student.update({ where: { id }, data });
      return Object.keys(data);
    }, TX);

    await this.audit.record({
      actor,
      action: 'student.updated',
      entityType: 'student',
      entityId: id,
      details: { changedFields: changed },
    });
    return this.getUnscoped(id);
  }

  async replaceGuardians(
    id: string,
    dto: ReplaceStudentGuardiansDto,
    actor: AuthUser,
  ): Promise<StudentDetail> {
    if (dto.guardians.filter((g) => g.isPrimary).length !== 1) {
      throw new BadRequestException('Exactly one guardian must be primary');
    }

    await this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Student not found');

      const guardians = await tx.guardian.findMany({
        where: { id: { in: dto.guardians.map((g) => g.guardianId) } },
        select: { id: true, phone: true, email: true },
      });
      if (guardians.length !== dto.guardians.length)
        throw new BadRequestException('One or more guardians do not exist');
      if (!guardians.some((g) => g.phone || g.email)) {
        throw new BadRequestException(
          'At least one guardian needs a phone number or an email address',
        );
      }

      await tx.studentGuardian.deleteMany({
        where: {
          studentId: id,
          guardianId: { notIn: dto.guardians.map((g) => g.guardianId) },
        },
      });
      await tx.studentGuardian.updateMany({
        where: { studentId: id, isPrimary: true },
        data: { isPrimary: false },
      });
      for (const link of dto.guardians) {
        const data = {
          relationship: link.relationship,
          isPrimary: link.isPrimary,
          isEmergencyContact: link.isEmergencyContact === true,
        };
        await tx.studentGuardian.upsert({
          where: {
            studentId_guardianId: {
              studentId: id,
              guardianId: link.guardianId,
            },
          },
          update: data,
          create: { studentId: id, guardianId: link.guardianId, ...data },
        });
      }
    }, TX);

    await this.audit.record({
      actor,
      action: 'student.guardians_changed',
      entityType: 'student',
      entityId: id,
      details: { guardianCount: dto.guardians.length },
    });
    return this.getUnscoped(id);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const admissionNo = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM students WHERE id = ${id}::uuid FOR UPDATE`;
      const student = await tx.student.findUnique({
        where: { id },
        select: { admissionNo: true },
      });
      if (!student) throw new NotFoundException('Student not found');
      const enrolments = await tx.enrollment.count({
        where: { studentId: id },
      });
      if (enrolments > 0)
        throw new ConflictException(
          'This student has enrollment history. Change their status instead of deleting them.',
        );
      await tx.student.delete({ where: { id } });
      return student.admissionNo;
    }, TX);
    await this.audit.record({
      actor,
      action: 'student.deleted',
      entityType: 'student',
      entityId: id,
      details: { admissionNo },
    });
  }

  private async getUnscoped(id: string): Promise<StudentDetail> {
    const row = await this.prisma.student.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Student not found');
    return toDetail(row);
  }

  private assertDates(
    dob: string,
    admissionDate: string,
    opts: { checkAdmissionNotFuture?: boolean } = {},
  ): void {
    const today = todayIso();
    if (dob >= today)
      throw new BadRequestException('Date of birth must be in the past');
    if (dob >= admissionDate)
      throw new BadRequestException(
        'Date of birth must be before the admission date',
      );
    if (opts.checkAdmissionNotFuture !== false && admissionDate > today) {
      throw new BadRequestException(
        'The admission date cannot be in the future',
      );
    }
  }

  /** ADM-<BS year>-NNN from an atomic per-year counter. Skips numbers already taken by manual entries. */
  private async generateAdmissionNo(tx: Tx, bsYear: number): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const n = await nextSequence(tx, `admission:${bsYear}`);
      const candidate = `ADM-${bsYear}-${String(n).padStart(3, '0')}`;
      const taken = await tx.student.findUnique({
        where: { admissionNo: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictException('Could not allocate an admission number');
  }

  /** A warning, not a hard rule: twins and common names exist. Not serialised against a simultaneous identical admission. */
  private async assertNoDuplicate(
    tx: Tx,
    firstName: string,
    lastName: string,
    dob: string,
  ): Promise<void> {
    const matches = await tx.student.findMany({
      where: {
        dateOfBirth: isoToDate(dob),
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { admissionNo: true, firstName: true, lastName: true },
      take: 3,
    });
    if (matches.length > 0) {
      const list = matches
        .map((m) => `${m.admissionNo} (${m.firstName} ${m.lastName})`)
        .join(', ');
      throw new ConflictException(
        `Possible duplicate of ${list}. If this is a different child, resubmit with confirmNotDuplicate: true.`,
      );
    }
  }

  private prepareGuardians(inputs: GuardianInputDto[]): PreparedGuardian[] {
    const ids = inputs.flatMap((i) => (i.guardianId ? [i.guardianId] : []));
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('A guardian is listed more than once');
    const primaries = inputs.filter((i) => i.isPrimary).length;
    if (primaries > 1)
      throw new BadRequestException('Only one guardian can be primary');

    return inputs.map((input, index) => {
      const base = {
        relationship: input.relationship,
        isPrimary: primaries === 0 ? index === 0 : input.isPrimary === true,
        isEmergencyContact: input.isEmergencyContact === true,
        createLogin: input.createLogin !== false,
      };

      if (input.guardianId) {
        const newDetails = [
          input.firstName,
          input.middleName,
          input.lastName,
          input.fullNameNp,
          input.phone,
          input.email,
          input.occupation,
          input.address,
        ];
        if (newDetails.some((v) => v !== undefined)) {
          throw new BadRequestException(
            'Send either guardianId or the details of a new guardian, not both',
          );
        }
        return { ...base, guardianId: input.guardianId };
      }

      if (!input.firstName)
        throw new BadRequestException('Each new guardian needs a first name');
      const phone = input.phone ? normalizePhone(input.phone) : undefined;
      if (input.phone && !phone)
        throw new BadRequestException('Invalid guardian phone number');
      const email = input.email?.toLowerCase();
      if (!phone && !email)
        throw new BadRequestException(
          'Each new guardian needs a phone number or an email address',
        );
      if (base.createLogin && phone && !input.phoneConfirmed) {
        throw new BadRequestException(
          'Confirm the guardian phone number (phoneConfirmed: true) before credentials are sent to it',
        );
      }
      return {
        ...base,
        person: {
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          fullNameNp: input.fullNameNp,
          phone: phone ?? undefined,
          email,
          occupation: input.occupation,
          address: input.address,
        },
      };
    });
  }

  private async resolveGuardians(
    tx: Tx,
    prepared: PreparedGuardian[],
  ): Promise<ResolvedLink[]> {
    const links: ResolvedLink[] = [];
    let hasContact = false;
    for (const g of prepared) {
      let guardianId: string;
      if (g.guardianId) {
        const existing = await tx.guardian.findUnique({
          where: { id: g.guardianId },
          select: { id: true, phone: true, email: true },
        });
        if (!existing) throw new NotFoundException('Guardian not found');
        guardianId = existing.id;
        hasContact = hasContact || Boolean(existing.phone || existing.email);
      } else {
        guardianId = (
          await tx.guardian.create({
            data: g.person as NonNullable<PreparedGuardian['person']>,
            select: { id: true },
          })
        ).id;
        hasContact = true;
      }
      links.push({
        guardianId,
        relationship: g.relationship,
        isPrimary: g.isPrimary,
        isEmergencyContact: g.isEmergencyContact,
        createLogin: g.createLogin,
      });
    }
    if (!hasContact)
      throw new BadRequestException(
        'At least one guardian needs a phone number or an email address',
      );
    return links;
  }
}
