import { createApiClient } from "@/lib/api/client";
import { listStudents } from "@/modules/admissions/services/students";
import { listSectionEnrollments } from "@/modules/admissions/services/enrollments";
import { listGuardians } from "@/modules/students/services/guardians";
import { listUsers } from "@/modules/settings/services/users";
import { displayFinanceData, rupees } from "./presentation";

export type Choice = { id: string; name: string };
export const lookupPermission: Record<string, string> = {
  billedStudent: "fees:read",
  billedEnrollment: "fees:read",
  studentId: "students:read",
  enrollmentId: "enrollments:read",
  periodId: "fees:read",
  invoiceId: "fees:read",
  paymentId: "fees:read",
  payerGuardianId: "guardians:read",
  cashierId: "users:read",
  receivedById: "users:read",
  assignmentId: "fees:read",
  discountId: "fees:read",
  adjustmentId: "fees:read",
  dayCloseId: "fees:reports",
  fineRun: "fees:read",
  reminderRun: "fees:remind",
};
export const searchable = new Set([
  "billedStudent",
  "billedEnrollment",
  "studentId",
  "invoiceId",
  "paymentId",
  "cashierId",
  "receivedById",
  "payerGuardianId",
]);
interface Row {
  id: string;
  name?: string;
  number?: string;
  receiptNo?: string;
  student?: { name: string; admissionNo: string };
  invoice?: { number: string };
  feeHead?: { name: string };
  amount?: number;
  status?: string;
  category?: string;
  type?: string;
  value?: number;
  date?: string;
  version?: number;
  sentAt?: string;
  appliedAt?: string;
  sentBy?: string;
  appliedBy?: string;
  period?: { name: string };
  periods?: { name: string }[];
}
const title = (r: Row) =>
  [
    r.receiptNo ??
      r.number ??
      r.invoice?.number ??
      r.feeHead?.name ??
      r.name ??
      r.date,
    r.student?.name,
    r.student?.admissionNo,
    r.category,
    r.type,
    r.value,
    r.version && "Version " + r.version,
    r.status,
    r.amount !== undefined ? rupees(r.amount) : null,
    r.periods?.map((p) => p.name).join(", "),
    r.appliedAt || r.sentAt
      ? displayFinanceData(r.appliedAt ?? r.sentAt)
      : null,
    r.appliedBy ?? r.sentBy,
  ]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .join(" · ");
export async function lookupRecords(
  key: string,
  term: string,
  page: number,
  year: string,
  section: string,
  enrollment: string,
) {
  const args = { search: term, page, pageSize: 15 };
  if (key === "billedStudent" || key === "billedEnrollment") {
    const data = await createApiClient().getPaginated<{
      student: { id: string; name: string; admissionNo: string };
      enrollmentId: string;
      className: string;
      sectionName: string;
    }>(
      "/invoices?" +
        new URLSearchParams({
          search: term,
          page: String(page),
          pageSize: "15",
        }),
    );
    const items = data.items.map((row) => ({
      id: key === "billedStudent" ? row.student.id : row.enrollmentId,
      name: [
        row.student.name,
        row.student.admissionNo,
        row.className,
        row.sectionName,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    return {
      items: [...new Map(items.map((r) => [r.id, r])).values()],
      pages: data.meta.totalPages,
    };
  }
  if (key === "studentId" || key === "payerGuardianId") {
    const rows =
      key === "studentId"
        ? await listStudents(args)
        : await listGuardians(args);
    return {
      items: rows.items.map((r) => ({
        id: r.id,
        name:
          [r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ") +
          " · " +
          ("admissionNo" in r ? r.admissionNo : (r.phone ?? "Guardian")),
      })),
      pages: rows.meta.totalPages,
    };
  }
  if (key === "cashierId" || key === "receivedById") {
    const rows = await listUsers({ ...args, sortBy: "fullName" });
    return {
      items: rows.items.map((r) => ({
        id: r.id,
        name: [r.fullName, r.staff?.staffNo ?? r.email]
          .filter(Boolean)
          .join(" · "),
      })),
      pages: rows.meta.totalPages,
    };
  }
  if (key === "enrollmentId") {
    const rows = await listSectionEnrollments(year, section);
    return {
      items: rows.map((r) => ({
        id: r.enrollmentId,
        name: r.name + " · " + r.admissionNo,
      })),
      pages: 1,
    };
  }
  const paths: Record<string, string> = {
    periodId: "/academic-years/" + year + "/billing-periods",
    assignmentId: "/enrollments/" + enrollment + "/fee-assignments",
    reminderRun: "/reminders/fees/runs",
    fineRun: "/late-fines/runs",
    dayCloseId: "/day-closes",
    discountId: "/discounts",
    adjustmentId: "/adjustments",
    invoiceId: "/invoices",
    paymentId: "/payments",
  };
  const path = paths[key];
  const client = createApiClient();
  if (["periodId", "assignmentId", "reminderRun", "fineRun"].includes(key)) {
    const rows = await client.get<Row[]>(path);
    return { items: rows.map((r) => ({ id: r.id, name: title(r) })), pages: 1 };
  }
  const params = new URLSearchParams({ page: String(page), pageSize: "15" });
  if (searchable.has(key) && term) params.set("search", term);
  const rows = await client.getPaginated<Row>(path + "?" + params);
  return {
    items: rows.items.map((r) => ({ id: r.id, name: title(r) })),
    pages: rows.meta.totalPages,
  };
}
