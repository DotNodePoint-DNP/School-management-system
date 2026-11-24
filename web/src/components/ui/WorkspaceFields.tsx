import type { ReactNode } from "react";

export const inputClass =
  "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-line bg-background px-3 text-ink focus:outline-teal";
export const buttonClass =
  "min-h-11 rounded-lg border border-line bg-panel px-4 text-sm font-semibold text-ink hover:border-teal focus-visible:outline-teal disabled:opacity-50";
export const primaryClass =
  "min-h-11 rounded-lg bg-navy px-5 text-sm font-semibold text-white focus-visible:outline-teal disabled:opacity-50";
export const panelClass =
  "min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-6";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-ink">
      {label}
      {children}
    </label>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-coral p-3 text-sm text-ink"
    >
      {error instanceof Error ? error.message : "The request failed."}{" "}
      {retry && (
        <button type="button" className="underline" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
