import { createApiClient } from "@/lib/api/client";
export type Adjustment = {
  advanceId?: string | null;
  deferred?: boolean;
  kind: "ADDITION" | "DEDUCTION";
  label: string;
  reason: string;
  amountPaisa: number;
};
export type Method = "BANK" | "CASH" | "WALLET" | "CHEQUE" | "OTHER";
export type PaymentInput = {
  requestId: string;
  amountPaisa: number;
  paidOn: string;
  method: Method;
  reference: string;
};
export type Payment = PaymentInput & {
  id: string;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
};
export type Entry = {
  id: string;
  staffId: string;
  staffNo: string;
  name: string;
  designation: string | null;
  basicPaisa: number | null;
  supplementalDraft: boolean;
  totalDays: number | null;
  presentDays: number | null;
  leaveMode: "NONE" | "AUTO" | "OVERRIDE";
  leaveOverridePaisa: number | null;
  leavePaisa: number;
  partialMonth: boolean;
  reviewNote: string | null;
  revision: number;
  adjustments: Adjustment[];
  payments: Payment[];
  additions: number;
  deductions: number;
  net: number;
  paid: number;
  outstanding: number;
};
export type Register = {
  month: string;
  startDate: string;
  endDate: string;
  exists: boolean;
  finalizedAt: string | null;
  entries: Entry[];
};
export type Staff = {
  id: string;
  staffNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  designation: string | null;
  status: string;
  payrollPreference: {method: Method; accountRef: string | null} | null;
  joinDate: string;
  leftOn: string | null;
  salaryRates: { effectiveMonth: string; basicPaisa: number }[];
};
export type PaidReport = {
  startDate: string;
  endDate: string;
  advancesIssued: number;
  totalPaid: number;
  paymentCount: number;
  staffCount: number;
  rows: {
    staffId: string;
    staffNo: string;
    name: string;
    payments: number;
    paid: number;
  }[];
};
export type Filter = { month: string } | { from: string; to: string };
const client = createApiClient;
const periods = (month: string) =>
  "/payroll/periods/" + encodeURIComponent(month);
type Advance = {
  id: string; issuedOn: string; amountPaisa: number; note: string;
  staff: { staffNo: string; firstName: string; lastName: string };
  settledEntry: { period: {month: string} } | null;
};
export const payroll = {
  attendance: (month: string, id: string) => client().get<{presentDays: number; leave: {fromDate: string; toDate: string}[]}>(periods(month) + "/staff/" + id + "/attendance"),
  advances: () => client().get<Advance[]>("/payroll/advances"),
  advance: (input: {staffId: string; issuedOn: string; amountPaisa: number; note: string; requestId: string}) => client().post("/payroll/advances", input),
  preference: (id: string, method: string, accountRef: string) => client().put("/payroll/staff/" + id + "/preference", {method, accountRef}),
  missing: (id: string) => client().get<{month: string; state: string}[]>("/payroll/staff/" + id + "/missing-months"),
  transfer: (id: string, input: Omit<PaymentInput,"amountPaisa"> & {allocations: {entryId: string; amountPaisa: number}[]}) => client().post("/payroll/staff/" + id + "/transfers", input),
  supplement: (month: string, id: string, reason: string) => client().post<{id:string}>(periods(month) + "/supplements/" + id, {reason}),
  lockSupplement: (month: string, id: string) => client().post(periods(month) + "/entries/" + id + "/lock", {}),
  today: () =>
    client().get<{ date: string; month: string | null }>("/payroll/today"),
  register: (m: string) => client().get<Register>(periods(m)),
  staff: () => client().get<Staff[]>("/payroll/staff"),
  history: (id: string) =>
    client().get<(Entry & { month: string; finalizedAt: string | null })[]>(
      "/payroll/staff/" + id + "/history",
    ),
  rate: (id: string, effectiveMonth: string, basicPaisa: number) =>
    client().put("/payroll/staff/" + id + "/rate", {
      effectiveMonth,
      basicPaisa,
    }),
  generate: (m: string) => client().post(periods(m) + "/generate", {}),
  review: (
    m: string,
    row: Entry,
    reviewNote: string,
    adjustments: Adjustment[],
    options: {totalDays?:number; presentDays:number|null; leaveMode:Entry["leaveMode"]; leaveOverridePaisa?:number; deferredAdvanceIds:string[]},
  ) =>
    client().put(periods(m) + "/entries/" + row.id, {
      revision: row.revision,
      reviewNote,
      adjustments,
      ...options,
    }),
  finalize: (m: string) => client().post(periods(m) + "/finalize", {}),
  reopen: (m: string, reason: string) =>
    client().post(periods(m) + "/reopen", { reason }),
  pay: (m: string, id: string, input: PaymentInput) =>
    client().post(periods(m) + "/entries/" + id + "/payments", input),
  void: (m: string, id: string, reason: string) =>
    client().post(periods(m) + "/payments/" + id + "/void", { reason }),
  report: (filter: Filter) =>
    client().get<PaidReport>(
      "/payroll/reports/paid?" + new URLSearchParams({ ...filter }).toString(),
    ),
};
