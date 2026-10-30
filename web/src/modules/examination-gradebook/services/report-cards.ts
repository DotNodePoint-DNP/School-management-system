import { client } from "./client";

export interface PrintReportCardsInput {
  academicYearId: string;
  classId: string;
  sectionId?: string;
  enrollmentIds?: string[];
  examId?: string;
  version?: number;
  issuedOn?: string;
  issuedOnBs?: string;
  signatures?: "auto" | "line";
  order?: "ROLL" | "RANK";
  slots?: string[];
}

export interface PrintSignatory {
  slot: string;
  nameEn: string;
  nameNp: string | null;
  designationEn: string;
  designationNp: string | null;
  mode: "DIGITAL" | "LINE";
  assetKey: string | null;
}

export interface PrintReportCardsResponse {
  schemaVersion: number;
  kind: "REPORT_CARD";
  issuedOn: { ad: string; bs: string | null };
  language: { mode: "EN" | "NP" | "BOTH"; nepaliDigits: boolean };
  paper: { size: "A4"; orientation: "portrait" };
  profileVersion: number;
  school: Record<string, unknown>;
  assets: Record<string, string>;
  signatories: PrintSignatory[];
  classTeachers: Record<string, PrintSignatory | null>;
  warnings: string[];
  documents: PrintReportCardData[];
  skipped: {
    enrollmentId: string;
    admissionNo: string | null;
    reason: "INCOMPLETE";
  }[];
}

export interface PrintReportCardData {
  ref: string;
  checksum: string;
  enrollmentId: string;
  student: {
    id: string;
    admissionNo: string;
    name: string;
    fullNameNp: string | null;
    gender: string;
    dateOfBirth: string;
    dateOfBirthBs: string | null;
  };
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
  rollNo: number | null;
  exam: { id: string; name: string } | null;
  run: { version: number; createdAt?: string };
  result: {
    status: string;
    totalMarks: number | null;
    totalFull: number | null;
    percentage: number | null;
    gpa: number | null;
    creditBasis: string;
    sectionRank: number | null;
    classRank: number | null;
    sectionSize: number;
    classSize: number;
    failedSubjects: string[];
    missing: string[];
  };
  subjects: {
    code: string;
    name: string;
    status: string;
    percentage: number | null;
    grade: string | null;
    gradePoint: number | null;
    weightedMarks: number | null;
    weightedFull: number;
  }[];
  attendance: {
    from: string;
    to: string;
    totalDays: number;
    present: number;
    absent: number;
    late: number;
    leave: number;
    percentage: number | null;
  };
  remark: { text: string; updatedAt: string } | null;
}

export async function printReportCards(
  input: PrintReportCardsInput,
): Promise<PrintReportCardsResponse> {
  return client().post<PrintReportCardsResponse>("/print/report-cards", input);
}
