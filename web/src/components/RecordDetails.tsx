import type { ReactNode } from "react";

export function humanLabel(key: string) {
  const value = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function RecordDetails({
  value,
  showIds = false,
}: {
  value: unknown;
  showIds?: boolean;
}): ReactNode {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted">—</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.length ? (
      <ul className="grid gap-3">
        {value.map((item, index) => (
          <li key={index} className="min-w-0 rounded-lg border border-line p-3">
            <RecordDetails value={item} showIds={showIds} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-muted">No entries</span>
    );
  if (!isRecord(value))
    return <span className="break-words">{String(value)}</span>;
  return (
    <dl className="grid min-w-0 gap-x-5 gap-y-2 sm:grid-cols-2">
      {Object.entries(value)
        .filter(([k]) => k !== "assets" && (showIds || !/^(id)$|Ids?$/.test(k)))
        .map(([key, item]) => (
          <div
            key={key}
            className={
              typeof item === "object" && item !== null
                ? "col-span-full min-w-0"
                : "min-w-0"
            }
          >
            <dt className="text-xs font-medium text-muted">
              {humanLabel(key)}
            </dt>
            <dd className="mt-1 min-w-0 break-words text-sm">
              <RecordDetails value={item} showIds={showIds} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
