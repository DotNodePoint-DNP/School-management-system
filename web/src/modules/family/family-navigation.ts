import type { ChildTab } from "./services/portal";
export const familyPath = "/dashboard/family";
export const tabLabels: Record<ChildTab, string> = {
  fees: "Pay fees",
  results: "Exam results",
  attendance: "Attendance",
  invoices: "Invoices",
  payments: "Receipts",
  statement: "Fee statement",
  profile: "Student profile",
};
export function childHref(admissionNo: string, tab: ChildTab) {
  return (
    familyPath +
    "/children?" +
    new URLSearchParams({ student: admissionNo, view: tab })
  );
}
export const formatNpr = (amount: number) =>
  "NPR " + amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
