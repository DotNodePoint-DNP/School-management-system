"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Term, TermStatus, TermValues } from "./types";
import { TERM_STATUSES, btnGhost, btnPrimary, inputCls } from "./utils";
import { Field, Modal } from "./Modal";

interface TermForm {
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: string;
}

type TermErrors = Partial<Record<keyof TermForm, string>>;

interface TermModalProps {
  initial: Term | null;
  takenKeys: string[]; // lower-case "name|academicYear" of the other terms
  onSave: (values: TermValues) => void;
  onClose: () => void;
}

export function TermModal({
  initial,
  takenKeys,
  onSave,
  onClose,
}: TermModalProps) {
  const [f, setF] = useState<TermForm>({
    name: initial?.name ?? "",
    academicYear: initial?.academicYear ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    status: initial?.status ?? "Upcoming",
  });
  const [errors, setErrors] = useState<TermErrors>({});

  const set =
    (k: keyof TermForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setF((p) => ({ ...p, [k]: value }));
      setErrors((p) => ({ ...p, [k]: undefined }));
    };

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er: TermErrors = {};
    const name = f.name.trim();
    const year = f.academicYear.trim();

    if (!name) er.name = "Enter the term name.";
    if (!year) er.academicYear = "Enter the academic year.";
    if (name && year && takenKeys.includes(`${name}|${year}`.toLowerCase()))
      er.name = "This term already exists for that academic year.";
    if (!f.startDate) er.startDate = "Pick a start date.";
    if (!f.endDate) er.endDate = "Pick an end date.";
    if (f.startDate && f.endDate && f.endDate < f.startDate)
      er.endDate = "End date must be on or after the start date.";

    setErrors(er);
    if (Object.keys(er).length) return;

    onSave({
      name,
      academicYear: year,
      startDate: f.startDate,
      endDate: f.endDate,
      status: f.status as TermStatus,
    });
  }

  return (
    <Modal
      title={initial ? "Edit term" : "Create term"}
      description="Set the term period, then add its exams."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Term name" required error={errors.name}>
            <input
              autoFocus
              className={inputCls}
              value={f.name}
              onChange={set("name")}
              placeholder="First Term"
            />
          </Field>
          <Field label="Academic year" required error={errors.academicYear}>
            <input
              className={inputCls}
              value={f.academicYear}
              onChange={set("academicYear")}
              placeholder="2026/27"
            />
          </Field>
          <Field label="Start date" required error={errors.startDate}>
            <input
              type="date"
              className={inputCls}
              value={f.startDate}
              onChange={set("startDate")}
            />
          </Field>
          <Field label="End date" required error={errors.endDate}>
            <input
              type="date"
              className={inputCls}
              value={f.endDate}
              onChange={set("endDate")}
            />
          </Field>
        </div>
        <Field label="Status">
          <select
            className={inputCls}
            value={f.status}
            onChange={set("status")}
          >
            {TERM_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {initial ? "Save changes" : "Create term"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
