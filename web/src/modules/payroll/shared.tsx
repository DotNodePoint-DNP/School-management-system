"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
export const PayrollUser = createContext("");
export function usePayrollKey() {
  return ["payroll", useContext(PayrollUser)] as const;
}
export const money = (paisa: number) =>
  "NPR " +
  (paisa / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const dateOnly = (value: string) => value.slice(0, 10);
export const card =
  "space-y-4 rounded-xl border border-line bg-panel p-5 text-ink shadow-sm";
export const field =
  "rounded-lg border border-muted bg-background px-3 py-2 text-sm text-ink";
export const button =
  "rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink hover:bg-background disabled:opacity-50";
export const primary =
  "rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-panel disabled:opacity-50";
export function Label({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {text}
      {children}
    </label>
  );
}
export function ErrorText({ error }: { error: Error | null }) {
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-coral bg-panel p-3 text-sm text-ink"
    >
      {error.message}
    </p>
  ) : null;
}
export function usePayrollAction() {
  const cache = useQueryClient();
  const key = usePayrollKey();
  return useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
}
export const months = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];
export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const [year, month] = value.split("-");
  return (
    <div className="flex flex-wrap gap-2">
      <Label text="BS year">
        <select
          className={field}
          value={year}
          onChange={(e) => onChange(e.target.value + "-" + month)}
        >
          {Array.from({ length: 85 }, (_, i) => 2000 + i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </Label>
      <Label text="BS month">
        <select
          className={field}
          value={month}
          onChange={(e) => onChange(year + "-" + e.target.value)}
        >
          {months.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </select>
      </Label>
    </div>
  );
}
export function Metrics({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-line bg-background p-4">
          <dt className="text-sm text-ink/75">{label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Status({
  final,
  net,
  paid,
}: {
  final: boolean;
  net: number;
  paid: number;
}) {
  return (
    <span>
      {!final
        ? "To review"
        : net === 0
          ? "Nothing due"
          : paid === net
            ? "Paid"
            : paid > 0
              ? "Partially paid"
              : "Payment due"}
    </span>
  );
}
