import { Injectable } from '@nestjs/common';
import { adToBsString } from '../../common/utils/bs-date.js';
import {
  LetterheadService,
  type LetterheadImage,
  type ResolvedSignature,
} from '../school/letterhead.service.js';
import type { PrintEnvelope, PrintSignatory } from './document-contract.js';

const dataUri = (image: LetterheadImage): string =>
  `data:${image.contentType};base64,${image.data.toString('base64')}`;

/** Builds the part of a print batch that every document kind shares: school header, images, and signatories. */
@Injectable()
export class PrintAssemblyService {
  constructor(private readonly letterhead: LetterheadService) {}

  async envelope(opts: {
    academicYearId: string;
    sectionIds: string[];
    issuedOn: string;
    forceLine: boolean;
    slots?: string[];
  }): Promise<PrintEnvelope> {
    const lh = await this.letterhead.assemble({
      asOf: opts.issuedOn,
      signatures: opts.forceLine ? 'line' : 'auto',
      slots: opts.slots,
    });
    const assets: Record<string, string> = {};
    if (lh.logo) assets.logo = dataUri(lh.logo);
    if (lh.seal) assets.seal = dataUri(lh.seal);

    const toSignatory = (s: ResolvedSignature, key: string): PrintSignatory => {
      if (s.image) assets[key] = dataUri(s.image);
      return {
        slot: s.slot,
        nameEn: s.nameEn,
        nameNp: s.nameNp,
        designationEn: s.designationEn,
        designationNp: s.designationNp,
        mode: s.mode,
        assetKey: s.image ? key : null,
      };
    };
    const signatories = lh.signatures.map((s) =>
      toSignatory(s, `sig:${s.slot}`),
    );

    const warnings = [...lh.warnings];
    const classTeachers: Record<string, PrintSignatory | null> = {};
    for (const sectionId of opts.sectionIds) {
      const ct = await this.letterhead.classTeacherSignature(
        opts.academicYearId,
        sectionId,
        opts.forceLine,
        warnings,
      );
      classTeachers[sectionId] = ct
        ? toSignatory(ct, `sig:CLASS_TEACHER:${sectionId}`)
        : null;
    }

    const { documentLanguage, nepaliDigits, ...school } = lh.school;
    return {
      schemaVersion: 1,
      issuedOn: { ad: opts.issuedOn, bs: adToBsString(opts.issuedOn) },
      language: { mode: documentLanguage, nepaliDigits },
      paper: { size: 'A4', orientation: 'portrait' },
      profileVersion: lh.profileVersion,
      school,
      assets,
      signatories,
      classTeachers,
      warnings,
    };
  }
}
