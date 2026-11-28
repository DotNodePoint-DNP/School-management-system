import { displayFinanceData } from "../services/presentation";
import {
  humanLabel,
  isRecord,
  RecordDetails,
} from "@/components/RecordDetails";

function summary(row: Record<string, unknown>, index: number) {
  const student = isRecord(row.student) ? row.student.name : undefined;
  const invoice = isRecord(row.invoice) ? row.invoice.number : undefined;
  const name =
    row.number ??
    row.receiptNo ??
    row.name ??
    row.label ??
    row.code ??
    invoice ??
    student ??
    row.date ??
    row.createdAt;
  return name ? String(name) : "Record " + (index + 1);
}
export function FinanceResult({ value }: { value: unknown }) {
  const page =
    isRecord(value) && Array.isArray(value.items) && isRecord(value.meta)
      ? value
      : null;
  const entries = page ? page.items : value;
  if (!Array.isArray(entries)) {
    const details = displayFinanceData(entries);
    if (details === undefined) return <p role="status">Operation completed.</p>;
    if (!isRecord(details)) return <RecordDetails value={details} />;
    const metrics = [
      "outstanding",
      "amount",
      "paid",
      "net",
      "totalOutstanding",
      "totalCredit",
    ].filter((key) => typeof details[key] === "string");
    return (
      <div className="space-y-4">
        {metrics.length > 0 && (
          <dl className="grid gap-2 sm:grid-cols-3">
            {metrics.map((key) => (
              <div
                key={key}
                className="rounded-lg border border-line bg-background p-3"
              >
                <dt className="text-sm text-muted">{humanLabel(key)}</dt>
                <dd className="font-semibold tabular-nums">
                  {String(details[key])}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <RecordDetails
          value={Object.fromEntries(
            Object.entries(details).filter(([key]) => !metrics.includes(key)),
          )}
        />
      </div>
    );
  }
  if (!entries.length)
    return <p className="text-muted">No matching records.</p>;
  return (
    <div>
      {page && isRecord(page.meta) && (
        <p className="mb-3 text-sm text-muted">
          Page {String(page.meta.page)} of {String(page.meta.totalPages)} ·{" "}
          {String(page.meta.total)} records
        </p>
      )}
      <ul className="divide-y divide-line">
        {entries.map((row, i) => (
          <li
            key={isRecord(row) && typeof row.id === "string" ? row.id : i}
            className="py-1"
          >
            {isRecord(row) ? (
              <details>
                <summary className="min-h-11 cursor-pointer py-3">
                  <span className="font-semibold">
                    {summary(
                      (displayFinanceData(row) as Record<string, unknown>) ??
                        {},
                      i,
                    )}
                  </span>
                  <span className="ml-3 text-sm text-muted">
                    {typeof row.status === "string"
                      ? humanLabel(row.status)
                      : ""}
                  </span>
                  {["outstanding", "amount", "net"]
                    .filter((k) => typeof row[k] === "number")
                    .slice(0, 1)
                    .map((k) => (
                      <span key={k} className="ml-3 inline-block text-sm">
                        {humanLabel(k)} · NPR{" "}
                        {Number(row[k]).toLocaleString("en-IN")}
                      </span>
                    ))}
                </summary>
                <div className="mb-3 rounded-lg bg-background p-3">
                  <RecordDetails value={displayFinanceData(row)} />
                </div>
              </details>
            ) : (
              <RecordDetails value={displayFinanceData(row)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
