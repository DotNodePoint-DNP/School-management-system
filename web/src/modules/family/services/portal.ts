import { createApiClient } from "@/lib/api/client";

export interface Child {
  id: string;
  name: string;
  admissionNo: string;
  current: {
    className: string;
    sectionName: string;
    enrollmentId: string;
  } | null;
  attendance: { percentage: number | null } | null;
  latestResult: { status: string; percentage: number | null } | null;
  fees: { outstanding: number } | null;
}
export interface FamilyHome {
  guardian: { name: string };
  asOf: string;
  children: Child[];
  fees: { outstanding: number; overdue: number; credit: number };
}
export type ChildTab =
  | "profile"
  | "attendance"
  | "results"
  | "fees"
  | "invoices"
  | "payments"
  | "statement";
export type FamilyDocument =
  "receipt" | "invoice" | "report-card" | "statement";
export type FamilyRecord = Record<string, unknown>;
export interface Result {
  enrollmentId: string;
  exam: { id: string; name: string } | null;
  academicYear: { name: string };
  status: string;
  percentage: number | null;
}
const childPath = (id: string) => "/portal/children/" + encodeURIComponent(id);
export interface ChildProfile {
  id: string;
  name: string;
  nameNp: string | null;
  admissionNo: string;
  status: string;
  gender: string;
  dateOfBirth: string;
  dateOfBirthBs: string | null;
  admissionDate: string;
  admissionDateBs: string | null;
  statusChangedOn: string | null;
  statusChangedOnBs: string | null;
  enrollments: {
    enrollmentId: string;
    academicYear: { id: string; name: string };
    className: string;
    sectionName: string;
    rollNo: number | null;
    status: string;
  }[];
  guardians: { name: string; relationship: string; isPrimary: boolean }[];
}
export const childProfile = (id: string) =>
  createApiClient().get<ChildProfile>(childPath(id));
export const familyHome = () =>
  createApiClient().get<FamilyHome>("/portal/home");
export const familyAccount = () =>
  createApiClient().get<{
    guardian: { name: string };
    children: (Pick<Child, "id" | "admissionNo" | "name" | "current"> & {
      relationship: string;
      isPrimary: boolean;
      status: string;
    })[];
  }>("/portal/me");
export const familyFees = () =>
  createApiClient().get<{
    asOf: string;
    totals: {
      outstanding: number;
      overdue: number;
      notYetDue: number;
      credit: number;
    };
    children: {
      student: { id: string; name: string; admissionNo: string };
      outstanding: number;
      overdue: number;
      credit: number;
      openInvoices: number;
      oldestDueDate: string | null;
      buckets: Record<string, number>;
    }[];
  }>("/portal/fees");
export const childSummary = (
  id: string,
  tab: "attendance" | "statement" | "fees",
  query: string,
) => createApiClient().get<FamilyRecord>(childPath(id) + "/" + tab + query);
export const childRegister = (
  id: string,
  tab: "invoices" | "payments",
  query: string,
) =>
  createApiClient().getPaginated<FamilyRecord>(
    childPath(id) + "/" + tab + query,
  );
export const childResults = (id: string) =>
  createApiClient().get<Result[]>(childPath(id) + "/results");
export const childReport = (id: string, query: string) =>
  createApiClient().get<FamilyRecord>(childPath(id) + "/report-card" + query);
export const familyTransaction = (type: "invoices" | "payments", id: string) =>
  createApiClient().get<FamilyRecord>(
    "/portal/" + type + "/" + encodeURIComponent(id),
  );
export const familyDocument = (
  kind: FamilyDocument,
  body: Record<string, string>,
) => createApiClient().post<FamilyRecord>("/portal/print/" + kind, body);
