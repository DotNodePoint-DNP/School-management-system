import {
  humanLabel,
  isRecord,
  RecordDetails,
} from "@/components/RecordDetails";

function summary(row: Record<string, unknown>, index: number) {
  const student = isRecord(row.student) ? row.student.name : undefined;
  const name =
    row.number ??
    row.receiptNo ??
    row.name ??
    row.label ??
    row.code ??
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
  if (!Array.isArray(entries)) return <RecordDetails value={value} showIds />;
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
                  <span className="font-semibold">{summary(row, i)}</span>
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
                  <RecordDetails value={row} showIds />
                </div>
              </details>
            ) : (
              <RecordDetails value={row} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
