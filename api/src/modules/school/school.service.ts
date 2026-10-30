import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuditAction } from '../../common/constants/audit-actions.js';
import {
  dateParts,
  isoToDate,
  resolveDate,
  todayIso,
} from '../../common/utils/bs-date.js';
import { normalizePhone } from '../../common/utils/identifier.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { UpdateSchoolProfileDto } from './dto/school-profile.dto.js';
import { SchoolImagesService } from './school-images.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;

const IMAGE_SELECT = {
  id: true,
  sha256: true,
  width: true,
  height: true,
} as const;
const PROFILE_INCLUDE = {
  logoFile: { select: IMAGE_SELECT },
  sealFile: { select: IMAGE_SELECT },
} satisfies Prisma.SchoolProfileInclude;
type ProfileRow = Prisma.SchoolProfileGetPayload<{
  include: typeof PROFILE_INCLUDE;
}>;

export interface PhoneEntry {
  label: string;
  type: 'MOBILE' | 'LANDLINE' | 'OTHER';
  number: string;
}
export interface IdentifierEntry {
  labelEn: string;
  labelNp?: string;
  value: string;
  showOnDocuments: boolean;
}
export interface ImageInfo {
  fileId: string;
  sha256: string;
  width: number;
  height: number;
}

export interface SchoolProfileResponse {
  version: number;
  nameEn: string;
  nameNp: string | null;
  shortName: string | null;
  taglineEn: string | null;
  taglineNp: string | null;
  schoolType: string | null;
  establishedOn: string | null;
  establishedOnBs: string | null;
  province: string | null;
  district: string | null;
  localLevel: string | null;
  wardNo: number | null;
  tole: string | null;
  postalCode: string | null;
  addressLineNp: string | null;
  phones: PhoneEntry[];
  email: string | null;
  website: string | null;
  identifiers: IdentifierEntry[];
  documentLanguage: 'EN' | 'NP' | 'BOTH';
  nepaliDigits: boolean;
  admissionNoPrefix: string;
  staffNoPrefix: string;
  logo: ImageInfo | null;
  seal: ImageInfo | null;
  updatedAt: string;
}

const TEXT_FIELDS = [
  'nameNp',
  'shortName',
  'taglineEn',
  'taglineNp',
  'schoolType',
  'province',
  'district',
  'localLevel',
  'tole',
  'postalCode',
  'addressLineNp',
  'email',
  'website',
] as const;

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const image = (
  f: { id: string; sha256: string; width: number; height: number } | null,
): ImageInfo | null =>
  f
    ? { fileId: f.id, sha256: f.sha256, width: f.width, height: f.height }
    : null;

function toResponse(row: ProfileRow): SchoolProfileResponse {
  const established = row.establishedOn ? dateParts(row.establishedOn) : null;
  return {
    version: row.version,
    nameEn: row.nameEn,
    nameNp: row.nameNp,
    shortName: row.shortName,
    taglineEn: row.taglineEn,
    taglineNp: row.taglineNp,
    schoolType: row.schoolType,
    establishedOn: established?.ad ?? null,
    establishedOnBs: established?.bs ?? null,
    province: row.province,
    district: row.district,
    localLevel: row.localLevel,
    wardNo: row.wardNo,
    tole: row.tole,
    postalCode: row.postalCode,
    addressLineNp: row.addressLineNp,
    phones: row.phones as unknown as PhoneEntry[],
    email: row.email,
    website: row.website,
    identifiers: row.identifiers as unknown as IdentifierEntry[],
    documentLanguage: row.documentLanguage,
    nepaliDigits: row.nepaliDigits,
    admissionNoPrefix: row.admissionNoPrefix,
    staffNoPrefix: row.staffNoPrefix,
    logo: image(row.logoFile),
    seal: image(row.sealFile),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class SchoolService {
  private readonly defaultName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: SchoolImagesService,
    config: ConfigService,
  ) {
    this.defaultName = config.get<string>('SCHOOL_NAME') ?? 'School';
  }

  async get(): Promise<SchoolProfileResponse> {
    await this.ensure();
    return toResponse(
      await this.prisma.schoolProfile.findUniqueOrThrow({
        where: { id: 1 },
        include: PROFILE_INCLUDE,
      }),
    );
  }

  /** The prefixes used when numbering admissions and staff. Falls back to the defaults if the profile does not exist yet. */
  async prefixes(
    db: Pick<Tx, 'schoolProfile'> = this.prisma,
  ): Promise<{ admissionNoPrefix: string; staffNoPrefix: string }> {
    const row = await db.schoolProfile.findUnique({
      where: { id: 1 },
      select: { admissionNoPrefix: true, staffNoPrefix: true },
    });
    return row ?? { admissionNoPrefix: 'ADM', staffNoPrefix: 'STF' };
  }

  /** The name used in SMS and short messages. */
  async displayName(): Promise<string> {
    const row = await this.prisma.schoolProfile.findUnique({
      where: { id: 1 },
      select: { shortName: true, nameEn: true },
    });
    return row?.shortName ?? row?.nameEn ?? this.defaultName;
  }

  async update(
    dto: UpdateSchoolProfileDto,
    actor: AuthUser,
  ): Promise<SchoolProfileResponse> {
    if (dto.establishedOn === null && dto.establishedOnBs !== undefined) {
      throw new BadRequestException(
        'Send either establishedOn (null to clear) or establishedOnBs, not both',
      );
    }
    const established =
      dto.establishedOn === null
        ? null
        : resolveDate('establishedOn', dto.establishedOn, dto.establishedOnBs);
    if (typeof established === 'string' && established > todayIso())
      throw new BadRequestException(
        'The establishment date cannot be in the future',
      );
    const phones = dto.phones?.map((p) => {
      if (p.type !== 'MOBILE')
        return { label: p.label, type: p.type, number: p.number };
      const number = normalizePhone(p.number);
      if (!number)
        throw new BadRequestException(
          `"${p.label}" is not a valid mobile number`,
        );
      return { label: p.label, type: p.type, number };
    });

    return this.applyChange(actor, 'school.profile_updated', (current) => {
      const data: Prisma.SchoolProfileUncheckedUpdateInput = {};
      const out = data as Record<string, unknown>;
      const before = current as unknown as Record<string, unknown>;
      const changed: string[] = [];
      const set = (field: string, next: unknown, same: boolean): void => {
        if (!same) {
          out[field] = next;
          changed.push(field);
        }
      };

      if (dto.nameEn !== undefined)
        set('nameEn', dto.nameEn, dto.nameEn === current.nameEn);
      for (const field of TEXT_FIELDS) {
        const value = dto[field];
        if (value === undefined) continue;
        const next = value === null || value === '' ? null : value;
        set(field, next, next === before[field]);
      }
      if (dto.wardNo !== undefined)
        set('wardNo', dto.wardNo, dto.wardNo === current.wardNo);
      if (established !== undefined) {
        const next = established === null ? null : isoToDate(established);
        set(
          'establishedOn',
          next,
          (next?.getTime() ?? null) ===
            (current.establishedOn?.getTime() ?? null),
        );
      }
      if (phones)
        set(
          'phones',
          json(phones),
          JSON.stringify(phones) === JSON.stringify(current.phones),
        );
      if (dto.identifiers)
        set(
          'identifiers',
          json(dto.identifiers),
          JSON.stringify(dto.identifiers) ===
            JSON.stringify(current.identifiers),
        );
      if (dto.documentLanguage !== undefined)
        set(
          'documentLanguage',
          dto.documentLanguage,
          dto.documentLanguage === current.documentLanguage,
        );
      if (dto.nepaliDigits !== undefined)
        set(
          'nepaliDigits',
          dto.nepaliDigits,
          dto.nepaliDigits === current.nepaliDigits,
        );
      if (dto.admissionNoPrefix !== undefined)
        set(
          'admissionNoPrefix',
          dto.admissionNoPrefix,
          dto.admissionNoPrefix === current.admissionNoPrefix,
        );
      if (dto.staffNoPrefix !== undefined)
        set(
          'staffNoPrefix',
          dto.staffNoPrefix,
          dto.staffNoPrefix === current.staffNoPrefix,
        );
      // Only the names of the changed fields are logged, never their values.
      return { data, details: { changedFields: changed } };
    });
  }

  async setImage(
    kind: 'LOGO' | 'SEAL',
    file: Buffer | undefined,
    actor: AuthUser,
  ): Promise<SchoolProfileResponse> {
    const stored = await this.images.storeImage(kind, file, actor.id);
    const field = kind === 'LOGO' ? 'logoFileId' : 'sealFileId';
    try {
      return await this.applyChange(
        actor,
        kind === 'LOGO' ? 'school.logo_set' : 'school.seal_set',
        () => ({
          data: { [field]: stored.id },
          details: {
            fileId: stored.id,
            sha256: stored.sha256,
            width: stored.width,
            height: stored.height,
          },
        }),
      );
    } catch (error) {
      await this.images.discard(stored.id);
      throw error;
    }
  }

  /** Unlinks the image. The file itself stays, because earlier profile versions refer to it. */
  async removeImage(
    kind: 'LOGO' | 'SEAL',
    actor: AuthUser,
  ): Promise<SchoolProfileResponse> {
    const field = kind === 'LOGO' ? 'logoFileId' : 'sealFileId';
    return this.applyChange(
      actor,
      kind === 'LOGO' ? 'school.logo_removed' : 'school.seal_removed',
      (current) => {
        const linked =
          kind === 'LOGO' ? current.logoFileId : current.sealFileId;
        if (!linked)
          throw new NotFoundException(
            `There is no ${kind.toLowerCase()} to remove`,
          );
        return { data: { [field]: null }, details: {} };
      },
    );
  }

  /** The current logo or seal bytes, for streaming to signed-in users. */
  async readImage(kind: 'LOGO' | 'SEAL') {
    await this.ensure();
    const row = await this.prisma.schoolProfile.findUniqueOrThrow({
      where: { id: 1 },
      select: { logoFileId: true, sealFileId: true },
    });
    const fileId = kind === 'LOGO' ? row.logoFileId : row.sealFileId;
    if (!fileId)
      throw new NotFoundException(`No ${kind.toLowerCase()} has been uploaded`);
    const file = await this.images.read(fileId);
    if (!file) throw new NotFoundException('The image is missing from storage');
    return file;
  }

  async history() {
    const rows = await this.prisma.schoolProfileVersion.findMany({
      orderBy: { version: 'desc' },
      select: { version: true, changedAt: true, changedById: true },
    });
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              rows.flatMap((r) => (r.changedById ? [r.changedById] : [])),
            ),
          ],
        },
      },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName] as const));
    return rows.map((r) => ({
      version: r.version,
      changedAt: r.changedAt.toISOString(),
      changedByName: r.changedById ? (name.get(r.changedById) ?? null) : null,
    }));
  }

  async historyVersion(version: number) {
    const row = await this.prisma.schoolProfileVersion.findUnique({
      where: { version },
    });
    if (!row) throw new NotFoundException('That version does not exist');
    return {
      version: row.version,
      changedAt: row.changedAt.toISOString(),
      profile: row.snapshot,
    };
  }

  /** One serialised write path: lock, change, new version row, audit event; all in one transaction. */
  private async applyChange(
    actor: AuthUser,
    action: AuditAction,
    build: (current: ProfileRow) => {
      data: Prisma.SchoolProfileUncheckedUpdateInput;
      details: Record<string, unknown>;
    },
  ): Promise<SchoolProfileResponse> {
    await this.ensure();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school_profile'))`;
      const current = await tx.schoolProfile.findUniqueOrThrow({
        where: { id: 1 },
        include: PROFILE_INCLUDE,
      });
      const { data, details } = build(current);
      if (Object.keys(data).length === 0)
        throw new BadRequestException('Nothing to change');

      const updated = await tx.schoolProfile.update({
        where: { id: 1 },
        data: { ...data, version: { increment: 1 }, updatedById: actor.id },
        include: PROFILE_INCLUDE,
      });
      await tx.schoolProfileVersion.create({
        data: {
          version: updated.version,
          snapshot: json(toResponse(updated)),
          changedById: actor.id,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action,
        entityType: 'school_profile',
        entityId: '1',
        details,
      });
      return updated;
    }, TX);
    return toResponse(row);
  }

  /** The first read creates the profile, named from SCHOOL_NAME, so the school never has "no profile". */
  private async ensure(): Promise<void> {
    if (
      await this.prisma.schoolProfile.findUnique({
        where: { id: 1 },
        select: { id: true },
      })
    )
      return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school_profile'))`;
      if (
        await tx.schoolProfile.findUnique({
          where: { id: 1 },
          select: { id: true },
        })
      )
        return;
      const created = await tx.schoolProfile.create({
        data: { id: 1, nameEn: this.defaultName },
        include: PROFILE_INCLUDE,
      });
      await tx.schoolProfileVersion.create({
        data: { version: 1, snapshot: json(toResponse(created)) },
      });
    }, TX);
  }
}
