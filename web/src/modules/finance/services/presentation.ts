import { humanLabel, isRecord } from "@/components/RecordDetails";

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const internal =
  /^(id|uid|uuid|assets|requestKey|idempotencyKey|fingerprint|storageKey|assetKey)$|(?:Id|Ids)$|_(?:id|ids)$/;
const moneyField =
  /^(amount|gross|net|paid|outstanding|overdueAmount|balance|credit|allocated|unapplied|refunded|adjusted|expectedCash|countedCash|variance|netAmount|grossAmount|discountAmount|netTotal|totalOutstanding|totalCredit)$/;
const businessRef = /^(reference|receiptNo|admissionNo|transactionReference)$/;
export const rupees = (n: number) =>
  "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export function displayFinanceData(value: unknown, key = ""): unknown {
  if (internal.test(key) || uuid.test(key)) return undefined;
  if (Array.isArray(value))
    return value
      .map((v) => displayFinanceData(v, key))
      .filter((v) => v !== undefined);
  if (isRecord(value)) {
    const fields = Object.entries(value)
      .map(([k, v]) => [k, displayFinanceData(v, k)] as const)
      .filter(([, v]) => v !== undefined);
    return fields.length ? Object.fromEntries(fields) : undefined;
  }
  if (typeof value === "string" && uuid.test(value) && !businessRef.test(key)) {
    const remaining = value.replace(new RegExp(uuid.source, "gi"), "").trim();
    return remaining || undefined;
  }
  if (
    moneyField.test(key) &&
    (typeof value === "number" ||
      (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)))
  )
    return rupees(Number(value));
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kathmandu",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  if (
    typeof value === "string" &&
    ["method", "kind", "status", "frequency", "audience"].includes(key)
  )
    return humanLabel(value);
  return value;
}
export function financeLabel(key: string) {
  const labels: Record<string, string> = {
    pageSize: "Records per page",
    payerGuardianId: "Paying guardian",
    receivedById: "Received by",
    paymentId: "Receipt",
    paymentIds: "Receipts",
    sourceYearId: "Source academic year",
    yearId: "Academic year",
    fromPeriodId: "First billing period",
    toPeriodId: "Last billing period",
    periodId: "Billing period",
    periodIds: "Billing periods",
    runId: "Run",
    id: "Record",
  };
  return labels[key] ?? humanLabel(key.replace(/Ids$/, "s").replace(/Id$/, ""));
}
