"use client";

import type { ReactNode } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";

export const formFieldClass =
  "mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2.5 text-sm text-ink outline-none transition focus:border-teal focus:ring-1 focus:ring-teal disabled:opacity-60";

export function AdmissionHeader({
  eyebrow = "Admissions workspace",
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-line pb-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
    </header>
  );
}

export function AdmissionField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-ink">
      <span className="block text-xs font-semibold text-muted">
        {label}
        {required && <span className="ml-1 text-coral">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-4 text-muted">{hint}</span>}
    </label>
  );
}

export function AdmissionSelect({
  label,
  value,
  onChange,
  children,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <AdmissionField label={label} required={required}>
      <span className="relative block">
        <select
          className={`${formFieldClass} appearance-none pr-9`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted"
        />
      </span>
    </AdmissionField>
  );
}

export function AdmissionLoading({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {children}
      </span>
    </div>
  );
}

export function AdmissionError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="rounded-lg border border-coral/30 bg-coral/5 p-5 text-sm text-ink">
      <p className="font-semibold">We couldn&apos;t load this information.</p>
      <p className="mt-1 text-muted">
        {error instanceof Error ? error.message : "The request failed."}
      </p>
      <button
        className="mt-3 rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-background"
        onClick={retry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

export function AdmissionEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

export function AdmissionMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
