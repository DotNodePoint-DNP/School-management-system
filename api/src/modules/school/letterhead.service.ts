import { BadRequestException, Injectable } from '@nestjs/common';
import {
  isoToDate,
  parseIsoDate,
  todayIso,
} from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SchoolImagesService } from './school-images.service.js';
import {
  SchoolService,
  type IdentifierEntry,
  type PhoneEntry,
  type SchoolProfileResponse,
} from './school.service.js';

/** Edit these if the wording should differ. The class teacher is not a signatory record; the section assignment decides who it is. */
export const CLASS_TEACHER_LABEL = {
  en: 'Class Teacher',
  np: 'कक्षा शिक्षक',
} as const;

const SLOT_PATTERN = /^(PRINCIPAL|EXAM_CONTROLLER|ACCOUNTANT|OTHER:.{2,60})$/;
const DEFAULT_SLOTS = ['PRINCIPAL', 'EXAM_CONTROLLER'];

export interface LetterheadImage {
  data: Buffer;
  contentType: string;
  sha256: string;
}

export interface ResolvedSignature {
  /** PRINCIPAL, EXAM_CONTROLLER, ACCOUNTANT, OTHER:<label>, or CLASS_TEACHER. */
  slot: string;
  nameEn: string;
  nameNp: string | null;
  designationEn: string;
  designationNp: string | null;
  /** What to print: the image, or a blank line to sign by hand. */
  mode: 'DIGITAL' | 'LINE';
  image: LetterheadImage | null;
}

export interface Letterhead {
  asOf: string;
  profileVersion: number;
  school: {
    nameEn: string;
    nameNp: string | null;
    shortName: string | null;
    taglineEn: string | null;
    taglineNp: string | null;
    addressEn: string | null;
    addressNp: string | null;
    phones: PhoneEntry[];
    email: string | null;
    website: string | null;
    /** Only the identifiers marked "show on documents". */
    identifiers: IdentifierEntry[];
    documentLanguage: 'EN' | 'NP' | 'BOTH';
    nepaliDigits: boolean;
  };
  logo: LetterheadImage | null;
  seal: LetterheadImage | null;
  signatures: ResolvedSignature[];
  classTeacher: ResolvedSignature | null;
  warnings: string[];
}

export interface LetterheadOptions {
  /** The document's issue date (AD, YYYY-MM-DD). Default: today. */
  asOf?: string;
  /** "line" forces a blank signature line everywhere, for printing a batch to sign by hand. Default "auto". */
  signatures?: 'auto' | 'line';
  /** Which signatory roles to include, in order. Default: principal and exam controller. */
  slots?: string[];
  /** Include the section's class teacher. */
  classTeacher?: { academicYearId: string; sectionId: string };
}

@Injectable()
export class LetterheadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly images: SchoolImagesService,
  ) {}

  async assemble(options: LetterheadOptions = {}): Promise<Letterhead> {
    const asOf = options.asOf ?? todayIso();
    parseIsoDate(asOf, 'asOf');
    const forceLine = options.signatures === 'line';
    const slots = options.slots ?? DEFAULT_SLOTS;
    for (const slot of slots)
      if (!SLOT_PATTERN.test(slot))
        throw new BadRequestException(
          `"${slot}" is not a valid signatory role`,
        );
    const warnings: string[] = [];

    const profile = await this.profileAsOf(asOf);
    const [logo, seal] = await Promise.all([
      this.load(profile.logo?.fileId, 'logo', warnings),
      this.load(profile.seal?.fileId, 'seal', warnings),
    ]);

    const date = isoToDate(asOf);
    const holders =
      slots.length === 0
        ? []
        : await this.prisma.signatory.findMany({
            where: {
              slot: { in: slots },
              validFrom: { lte: date },
              OR: [{ validTo: null }, { validTo: { gte: date } }],
            },
            select: {
              slot: true,
              fullNameEn: true,
              fullNameNp: true,
              designationEn: true,
              designationNp: true,
              mode: true,
              signatureFileId: true,
            },
          });
    const signatures: ResolvedSignature[] = [];
    for (const slot of slots) {
      const row = holders.find((h) => h.slot === slot);
      if (!row) {
        warnings.push(`No holder of ${slot} was in office on ${asOf}`);
        continue;
      }
      signatures.push(
        await this.resolve(
          slot,
          row,
          row.mode,
          row.signatureFileId,
          forceLine,
          warnings,
        ),
      );
    }

    const classTeacher = options.classTeacher
      ? await this.classTeacherSignature(
          options.classTeacher.academicYearId,
          options.classTeacher.sectionId,
          forceLine,
          warnings,
        )
      : null;

    return {
      asOf,
      profileVersion: profile.version,
      school: {
        nameEn: profile.nameEn,
        nameNp: profile.nameNp,
        shortName: profile.shortName,
        taglineEn: profile.taglineEn,
        taglineNp: profile.taglineNp,
        addressEn: this.addressOf(profile),
        addressNp: profile.addressLineNp,
        phones: profile.phones,
        email: profile.email,
        website: profile.website,
        identifiers: profile.identifiers.filter((i) => i.showOnDocuments),
        documentLanguage: profile.documentLanguage,
        nepaliDigits: profile.nepaliDigits,
      },
      logo,
      seal,
      signatures,
      classTeacher,
      warnings,
    };
  }

  /**
   * The profile as it stood at the end of the issue date (Nepal time), so a reprinted document keeps its original header.
   * Falls back to the current profile when no complete snapshot exists.
   */
  private async profileAsOf(asOf: string): Promise<SchoolProfileResponse> {
    const current = await this.school.get();
    if (asOf >= todayIso()) return current;
    const cutoff = new Date(
      Date.parse(`${asOf}T00:00:00Z`) + 86_400_000 - 345 * 60_000,
    );
    const row =
      (await this.prisma.schoolProfileVersion.findFirst({
        where: { changedAt: { lte: cutoff } },
        orderBy: { version: 'desc' },
      })) ??
      (await this.prisma.schoolProfileVersion.findFirst({
        orderBy: { version: 'asc' },
      }));
    const snapshot = row?.snapshot as
      Partial<SchoolProfileResponse> | undefined;
    if (
      !snapshot ||
      typeof snapshot.nameEn !== 'string' ||
      typeof snapshot.documentLanguage !== 'string'
    )
      return current;
    return snapshot as SchoolProfileResponse;
  }

  private addressOf(p: SchoolProfileResponse): string | null {
    const local = p.localLevel
      ? `${p.localLevel}${p.wardNo ? `-${p.wardNo}` : ''}`
      : p.wardNo
        ? `Ward ${p.wardNo}`
        : null;
    const parts = [p.tole, local, p.district, p.province].filter(
      (v): v is string => Boolean(v),
    );
    return parts.length > 0 ? parts.join(', ') : null;
  }

  private async load(
    fileId: string | undefined | null,
    what: string,
    warnings: string[],
  ): Promise<LetterheadImage | null> {
    if (!fileId) return null;
    const file = await this.images.read(fileId);
    if (!file) {
      warnings.push(`The ${what} image is missing from storage`);
      return null;
    }
    return {
      data: file.data,
      contentType: file.contentType,
      sha256: file.sha256,
    };
  }

  private async resolve(
    slot: string,
    who: {
      fullNameEn: string;
      fullNameNp: string | null;
      designationEn: string;
      designationNp: string | null;
    },
    mode: 'DIGITAL' | 'LINE',
    fileId: string | null,
    forceLine: boolean,
    warnings: string[],
  ): Promise<ResolvedSignature> {
    let image: LetterheadImage | null = null;
    let finalMode: 'DIGITAL' | 'LINE' = 'LINE';
    if (!forceLine && mode === 'DIGITAL') {
      image = await this.load(
        fileId,
        `signature of ${who.fullNameEn}`,
        warnings,
      );
      finalMode = image ? 'DIGITAL' : 'LINE'; // a missing image degrades to a blank line, never to a missing signature block
    }
    return {
      slot,
      nameEn: who.fullNameEn,
      nameNp: who.fullNameNp,
      designationEn: who.designationEn,
      designationNp: who.designationNp,
      mode: finalMode,
      image,
    };
  }

  async classTeacherSignature(
    academicYearId: string,
    sectionId: string,
    forceLine: boolean,
    warnings: string[],
  ): Promise<ResolvedSignature | null> {
    const assignment = await this.prisma.classTeacherAssignment.findUnique({
      where: { academicYearId_sectionId: { academicYearId, sectionId } },
      select: {
        staff: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            fullNameNp: true,
            signatureMode: true,
            signatureFileId: true,
          },
        },
      },
    });
    if (!assignment) {
      warnings.push(
        'A section has no class teacher assigned for that academic year',
      );
      return null;
    }
    const { staff } = assignment;
    return this.resolve(
      'CLASS_TEACHER',
      {
        fullNameEn: displayName(staff),
        fullNameNp: staff.fullNameNp,
        designationEn: CLASS_TEACHER_LABEL.en,
        designationNp: CLASS_TEACHER_LABEL.np,
      },
      staff.signatureMode,
      staff.signatureFileId,
      forceLine,
      warnings,
    );
  }
}
