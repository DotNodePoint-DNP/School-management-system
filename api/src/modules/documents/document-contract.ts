import type { Letterhead } from '../school/letterhead.service.js';

/** The shape the web app prints. Add 'MARKSHEET' | 'CERTIFICATE' | 'ID_CARD' here when those documents exist. */
export type PrintDocumentKind = 'REPORT_CARD';

export interface PrintSignatory {
  /** PRINCIPAL, EXAM_CONTROLLER, ACCOUNTANT, OTHER:<label>, or CLASS_TEACHER. */
  slot: string;
  nameEn: string;
  nameNp: string | null;
  designationEn: string;
  designationNp: string | null;
  /** DIGITAL: print the image in `assets[assetKey]`. LINE: print a blank line to sign by hand. */
  mode: 'DIGITAL' | 'LINE';
  assetKey: string | null;
}

export interface SkippedDocument {
  enrollmentId: string;
  admissionNo: string | null;
  reason: 'INCOMPLETE';
}

/** Everything shared by all documents of a batch, so images are sent once. */
export interface PrintEnvelope {
  schemaVersion: 1;
  issuedOn: { ad: string; bs: string | null };
  language: { mode: 'EN' | 'NP' | 'BOTH'; nepaliDigits: boolean };
  /** A hint only. The web app owns the print CSS. */
  paper: { size: 'A4'; orientation: 'portrait' };
  profileVersion: number;
  school: Omit<Letterhead['school'], 'documentLanguage' | 'nepaliDigits'>;
  /** key -> data URI: "logo", "seal", "sig:PRINCIPAL", "sig:CLASS_TEACHER:<sectionId>", ... */
  assets: Record<string, string>;
  /** Batch-wide signatories in print order. */
  signatories: PrintSignatory[];
  /** By section id. null when the section has no class teacher assigned. */
  classTeachers: Record<string, PrintSignatory | null>;
  warnings: string[];
}

export interface PrintBatch<
  K extends PrintDocumentKind,
  D,
> extends PrintEnvelope {
  kind: K;
  documents: D[];
  skipped: SkippedDocument[];
}
