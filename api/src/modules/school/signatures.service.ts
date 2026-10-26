import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDaysIso,
  dateParts,
  isoToDate,
  requireDate,
  resolveDate,
  todayIso,
  toIsoDate,
} from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreateSignatoryDto,
  UpdateSignatoryDto,
} from './dto/signatory.dto.js';
import { SchoolImagesService } from './school-images.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 15_000, timeout: 60_000 } as const;
type Mode = 'DIGITAL' | 'LINE';

const IMAGE_SELECT = {
  id: true,
  sha256: true,
  width: true,
  height: true,
} as const;
const SELECT = {
  id: true,
  role: true,
  roleLabel: true,
  slot: true,
  fullNameEn: true,
  fullNameNp: true,
  designationEn: true,
  designationNp: true,
  staffId: true,
  mode: true,
  validFrom: true,
  validTo: true,
  signatureFile: { select: IMAGE_SELECT },
} satisfies Prisma.SignatorySelect;
type Row = Prisma.SignatoryGetPayload<{ select: typeof SELECT }>;

export interface SignatureImageInfo {
  fileId: string;
  sha256: string;
  width: number;
  height: number;
}
export interface SignatoryResponse {
  id: string;
  role: string;
  roleLabel: string | null;
  slot: string;
  fullNameEn: string;
  fullNameNp: string | null;
  designationEn: string;
  designationNp: string | null;
  staffId: string | null;
  mode: Mode;
  hasSignature: boolean;
  signature: SignatureImageInfo | null;
  validFrom: string;
  validFromBs: string | null;
  validTo: string | null;
  validToBs: string | null;
  isCurrent: boolean;
}
export interface StaffSignatureResponse {
  staffId: string;
  mode: Mode;
  hasSignature: boolean;
  signature: SignatureImageInfo | null;
}

export const slotOf = (
  role: string,
  label: string | null | undefined,
): string => (role === 'OTHER' ? `OTHER:${(label ?? '').toLowerCase()}` : role);

const info = (
  f: { id: string; sha256: string; width: number; height: number } | null,
): SignatureImageInfo | null =>
  f
    ? { fileId: f.id, sha256: f.sha256, width: f.width, height: f.height }
    : null;

function toResponse(row: Row, today: string): SignatoryResponse {
  const from = dateParts(row.validFrom);
  const to = row.validTo ? dateParts(row.validTo) : null;
  return {
    id: row.id,
    role: row.role,
    roleLabel: row.roleLabel,
    slot: row.slot,
    fullNameEn: row.fullNameEn,
    fullNameNp: row.fullNameNp,
    designationEn: row.designationEn,
    designationNp: row.designationNp,
    staffId: row.staffId,
    mode: row.mode,
    hasSignature: row.signatureFile !== null,
    signature: info(row.signatureFile),
    validFrom: from.ad,
    validFromBs: from.bs,
    validTo: to?.ad ?? null,
    validToBs: to?.bs ?? null,
    isCurrent: from.ad <= today && (to === null || to.ad >= today),
  };
}

const clean = (v: string | null | undefined): string | null =>
  v === undefined || v === null || v === '' ? null : v;

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: SchoolImagesService,
  ) {}

  async list(): Promise<SignatoryResponse[]> {
    const today = todayIso();
    const rows = await this.prisma.signatory.findMany({
      orderBy: [{ slot: 'asc' }, { validFrom: 'desc' }],
      select: SELECT,
    });
    return rows.map((r) => toResponse(r, today));
  }

  async get(id: string): Promise<SignatoryResponse> {
    const row = await this.prisma.signatory.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Signatory not found');
    return toResponse(row, todayIso());
  }

  async create(
    dto: CreateSignatoryDto,
    actor: AuthUser,
  ): Promise<SignatoryResponse> {
    const from = requireDate('validFrom', dto.validFrom, dto.validFromBs);
    const to = resolveDate('validTo', dto.validTo, dto.validToBs);
    if (to && to < from)
      throw new BadRequestException('validTo cannot be before validFrom');
    if (dto.role === 'OTHER' && !dto.roleLabel)
      throw new BadRequestException('Give a roleLabel for an "other" role');
    if (dto.role !== 'OTHER' && dto.roleLabel)
      throw new BadRequestException('roleLabel is only for the OTHER role');

    const staff = dto.staffId
      ? await this.prisma.staff.findUnique({
          where: { id: dto.staffId },
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            fullNameNp: true,
            designation: true,
          },
        })
      : null;
    if (dto.staffId && !staff)
      throw new BadRequestException('That staff member does not exist');
    const fullNameEn =
      dto.fullNameEn ?? (staff ? displayName(staff) : undefined);
    const designationEn = dto.designationEn ?? staff?.designation ?? undefined;
    if (!fullNameEn)
      throw new BadRequestException(
        'Give the full name, or link a staff member',
      );
    if (!designationEn)
      throw new BadRequestException(
        'Give the designation (for example "Principal")',
      );

    const slot = slotOf(dto.role, dto.roleLabel);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await this.lockSlot(tx, slot);
        const open = await tx.signatory.findFirst({
          where: { slot, validTo: null },
          orderBy: { validFrom: 'desc' },
          select: { id: true, validFrom: true },
        });
        if (
          open &&
          dto.closePrevious !== false &&
          toIsoDate(open.validFrom) < from
        ) {
          const endsOn = addDaysIso(from, -1);
          await tx.signatory.update({
            where: { id: open.id },
            data: { validTo: isoToDate(endsOn) },
          });
          await this.audit.recordIn(tx, {
            actor,
            action: 'signatory.updated',
            entityType: 'signatory',
            entityId: open.id,
            details: { autoClosed: true, validTo: endsOn },
          });
        }
        await this.assertNoOverlap(tx, slot, from, to);
        const created = await tx.signatory.create({
          data: {
            role: dto.role,
            roleLabel: dto.roleLabel,
            slot,
            fullNameEn,
            fullNameNp: dto.fullNameNp ?? staff?.fullNameNp ?? null,
            designationEn,
            designationNp: dto.designationNp ?? null,
            staffId: dto.staffId,
            validFrom: isoToDate(from),
            validTo: to ? isoToDate(to) : null,
          },
          select: { id: true },
        });
        await this.audit.recordIn(tx, {
          actor,
          action: 'signatory.created',
          entityType: 'signatory',
          entityId: created.id,
          details: {
            role: dto.role,
            roleLabel: dto.roleLabel,
            validFrom: from,
            validTo: to ?? null,
          },
        });
        return created.id;
      }, TX);
      return await this.get(id);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  async update(
    id: string,
    dto: UpdateSignatoryDto,
    actor: AuthUser,
  ): Promise<SignatoryResponse> {
    const found = await this.prisma.signatory.findUnique({
      where: { id },
      select: { slot: true },
    });
    if (!found) throw new NotFoundException('Signatory not found');
    const from = resolveDate('validFrom', dto.validFrom, dto.validFromBs);
    const to =
      dto.validTo === null
        ? null
        : resolveDate('validTo', dto.validTo, dto.validToBs);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockSlot(tx, found.slot);
        const current = await tx.signatory.findUniqueOrThrow({
          where: { id },
          select: SELECT,
        });
        const data: Prisma.SignatoryUncheckedUpdateInput = {};
        const changed: string[] = [];
        const set = <K extends keyof Prisma.SignatoryUncheckedUpdateInput>(
          key: K,
          value: Prisma.SignatoryUncheckedUpdateInput[K],
          same: boolean,
        ): void => {
          if (!same) {
            data[key] = value;
            changed.push(String(key));
          }
        };

        if (dto.fullNameEn !== undefined)
          set(
            'fullNameEn',
            dto.fullNameEn,
            dto.fullNameEn === current.fullNameEn,
          );
        if (dto.fullNameNp !== undefined)
          set(
            'fullNameNp',
            clean(dto.fullNameNp),
            clean(dto.fullNameNp) === current.fullNameNp,
          );
        if (dto.designationEn !== undefined)
          set(
            'designationEn',
            dto.designationEn,
            dto.designationEn === current.designationEn,
          );
        if (dto.designationNp !== undefined)
          set(
            'designationNp',
            clean(dto.designationNp),
            clean(dto.designationNp) === current.designationNp,
          );
        if (dto.staffId !== undefined) {
          if (
            dto.staffId !== null &&
            !(await tx.staff.findUnique({
              where: { id: dto.staffId },
              select: { id: true },
            }))
          ) {
            throw new BadRequestException('That staff member does not exist');
          }
          set('staffId', dto.staffId, dto.staffId === current.staffId);
        }
        if (dto.mode !== undefined) {
          if (dto.mode === 'DIGITAL' && !current.signatureFile)
            throw new BadRequestException(
              'Upload a signature image before choosing digital signing',
            );
          set('mode', dto.mode, dto.mode === current.mode);
        }

        const newFrom = from ?? toIsoDate(current.validFrom);
        const newTo =
          to === undefined
            ? current.validTo
              ? toIsoDate(current.validTo)
              : null
            : to;
        if (newTo && newTo < newFrom)
          throw new BadRequestException('validTo cannot be before validFrom');
        if (from !== undefined || to !== undefined) {
          await this.assertNoOverlap(tx, current.slot, newFrom, newTo, id);
          set(
            'validFrom',
            isoToDate(newFrom),
            newFrom === toIsoDate(current.validFrom),
          );
          set(
            'validTo',
            newTo ? isoToDate(newTo) : null,
            newTo === (current.validTo ? toIsoDate(current.validTo) : null),
          );
        }
        if (changed.length === 0)
          throw new BadRequestException('Nothing to change');

        await tx.signatory.update({ where: { id }, data });
        await this.audit.recordIn(tx, {
          actor,
          action: 'signatory.updated',
          entityType: 'signatory',
          entityId: id,
          details: { changedFields: changed },
        });
      }, TX);
      return await this.get(id);
    } catch (error) {
      return this.mapConflict(error);
    }
  }

  /** Uploading a signature switches the signatory to DIGITAL. The previous image is kept: old documents refer to it. */
  async setSignature(
    id: string,
    file: Buffer | undefined,
    actor: AuthUser,
  ): Promise<SignatoryResponse> {
    const found = await this.prisma.signatory.findUnique({
      where: { id },
      select: { slot: true },
    });
    if (!found) throw new NotFoundException('Signatory not found');
    const stored = await this.images.storeImage('SIGNATURE', file, actor.id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockSlot(tx, found.slot);
        await tx.signatory.update({
          where: { id },
          data: { signatureFileId: stored.id, mode: 'DIGITAL' },
        });
        await this.audit.recordIn(tx, {
          actor,
          action: 'signatory.signature_set',
          entityType: 'signatory',
          entityId: id,
          details: { fileId: stored.id, sha256: stored.sha256 },
        });
      }, TX);
    } catch (error) {
      await this.images.discard(stored.id);
      throw error;
    }
    return this.get(id);
  }

  async removeSignature(
    id: string,
    actor: AuthUser,
  ): Promise<SignatoryResponse> {
    const found = await this.prisma.signatory.findUnique({
      where: { id },
      select: { slot: true, signatureFileId: true },
    });
    if (!found) throw new NotFoundException('Signatory not found');
    if (!found.signatureFileId)
      throw new NotFoundException('This signatory has no signature image');
    await this.prisma.$transaction(async (tx) => {
      await this.lockSlot(tx, found.slot);
      await tx.signatory.update({
        where: { id },
        data: { signatureFileId: null, mode: 'LINE' },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'signatory.signature_removed',
        entityType: 'signatory',
        entityId: id,
      });
    }, TX);
    return this.get(id);
  }

  async readSignature(id: string) {
    const row = await this.prisma.signatory.findUnique({
      where: { id },
      select: { signatureFileId: true },
    });
    if (!row) throw new NotFoundException('Signatory not found');
    if (!row.signatureFileId)
      throw new NotFoundException('This signatory has no signature image');
    const file = await this.images.read(row.signatureFileId);
    if (!file) throw new NotFoundException('The image is missing from storage');
    return file;
  }

  // ---------------------------------------------------------------- staff signatures (class teachers)

  async staffSignature(staffId: string): Promise<StaffSignatureResponse> {
    const row = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        signatureMode: true,
        signatureFile: { select: IMAGE_SELECT },
      },
    });
    if (!row) throw new NotFoundException('Staff member not found');
    return {
      staffId: row.id,
      mode: row.signatureMode,
      hasSignature: row.signatureFile !== null,
      signature: info(row.signatureFile),
    };
  }

  async setStaffSignature(
    staffId: string,
    file: Buffer | undefined,
    actor: AuthUser,
  ): Promise<StaffSignatureResponse> {
    await this.staffSignature(staffId); // 404 before anything is stored
    const stored = await this.images.storeImage('SIGNATURE', file, actor.id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockStaff(tx, staffId);
        await tx.staff.update({
          where: { id: staffId },
          data: { signatureFileId: stored.id, signatureMode: 'DIGITAL' },
        });
        await this.audit.recordIn(tx, {
          actor,
          action: 'staff.signature_set',
          entityType: 'staff',
          entityId: staffId,
          details: { fileId: stored.id, sha256: stored.sha256 },
        });
      }, TX);
    } catch (error) {
      await this.images.discard(stored.id);
      throw error;
    }
    return this.staffSignature(staffId);
  }

  async setStaffMode(
    staffId: string,
    mode: Mode,
    actor: AuthUser,
  ): Promise<StaffSignatureResponse> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockStaff(tx, staffId);
      const current = await tx.staff.findUniqueOrThrow({
        where: { id: staffId },
        select: { signatureFileId: true, signatureMode: true },
      });
      if (mode === 'DIGITAL' && !current.signatureFileId)
        throw new BadRequestException(
          'Upload a signature image before choosing digital signing',
        );
      if (mode === current.signatureMode)
        throw new BadRequestException('Nothing to change');
      await tx.staff.update({
        where: { id: staffId },
        data: { signatureMode: mode },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'staff.signature_mode_set',
        entityType: 'staff',
        entityId: staffId,
        details: { mode },
      });
    }, TX);
    return this.staffSignature(staffId);
  }

  async removeStaffSignature(
    staffId: string,
    actor: AuthUser,
  ): Promise<StaffSignatureResponse> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockStaff(tx, staffId);
      const current = await tx.staff.findUniqueOrThrow({
        where: { id: staffId },
        select: { signatureFileId: true },
      });
      if (!current.signatureFileId)
        throw new NotFoundException('This staff member has no signature image');
      await tx.staff.update({
        where: { id: staffId },
        data: { signatureFileId: null, signatureMode: 'LINE' },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'staff.signature_removed',
        entityType: 'staff',
        entityId: staffId,
      });
    }, TX);
    return this.staffSignature(staffId);
  }

  async readStaffSignature(staffId: string) {
    const row = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { signatureFileId: true },
    });
    if (!row) throw new NotFoundException('Staff member not found');
    if (!row.signatureFileId)
      throw new NotFoundException('This staff member has no signature image');
    const file = await this.images.read(row.signatureFileId);
    if (!file) throw new NotFoundException('The image is missing from storage');
    return file;
  }

  // ---------------------------------------------------------------- internals

  private async lockSlot(tx: Tx, slot: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`signatory:${slot}`}))`;
  }

  private async lockStaff(tx: Tx, staffId: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM staff WHERE id = ${staffId}::uuid FOR UPDATE`;
    if (rows.length === 0)
      throw new NotFoundException('Staff member not found');
  }

  private async assertNoOverlap(
    tx: Tx,
    slot: string,
    from: string,
    to: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    const clash = await tx.signatory.findFirst({
      where: {
        slot,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(to ? { validFrom: { lte: isoToDate(to) } } : {}),
        OR: [{ validTo: null }, { validTo: { gte: isoToDate(from) } }],
      },
      select: { fullNameEn: true, validFrom: true, validTo: true },
    });
    if (clash) {
      throw new ConflictException(
        `These dates overlap ${clash.fullNameEn} (${toIsoDate(clash.validFrom)} to ${clash.validTo ? toIsoDate(clash.validTo) : 'now'}). A role has one holder at a time.`,
      );
    }
  }

  /** The service check above gives the clear message; the database exclusion constraint is the backstop. */
  private mapConflict(error: unknown): never {
    if (
      error instanceof Error &&
      error.message.includes('signatories_no_overlap')
    ) {
      throw new ConflictException(
        'These dates overlap another holder of this role',
      );
    }
    throw error;
  }
}
