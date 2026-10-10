"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Exam, ExamType, ExamValues, Term } from "./types";
import { EXAM_TYPES, btnGhost, btnPrimary, formatDate, inputCls } from "./utils";
import { Field, Modal } from "./Modal";

interface ExamForm {
  name: string;
  type: string;
  fullMarks: string;
  passMarks: string;
  weightage: string;
  date: string;
  description: string;
}

type ExamErrors = Partial<Record<keyof ExamForm, string>>;

interface ExamModalProps {
  initial: Exam | null;
  term: Term;
  remaining: number; // weightage still free in this term (excluding the exam being edited)
  onSave: (values: ExamValues) => void;
  onClose: () => void;
}

export function ExamModal({ initial, term, remaining, onSave, onClose }: ExamModalProps) {
  const [f, setF] = useState<ExamForm>({
    name: initial?.name ?? "",
    type: initial?.type ?? "Terminal",
    fullMarks: String(initial?.fullMarks ?? ""),
    passMarks: String(initial?.passMarks ?? ""),
    weightage: String(initial?.weightage ?? ""),
    date: initial?.date ?? "",
    description: initial?.description ?? "",
  });
  const [errors, setErrors] = useState<ExamErrors>({});

  const set =
    (k: keyof ExamForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setF((p) => ({ ...p, [k]: value }));
      setErrors((p) => ({ ...p, [k]: undefined }));
    };

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er: ExamErrors = {};
    const full = Number(f.fullMarks);
    const pass = Number(f.passMarks);
    const weight = Number(f.weightage);

    if (!f.name.trim()) er.name = "Enter the exam name.";

    if (f.fullMarks.trim() === "" || isNaN(full) || full <= 0)
      er.fullMarks = "Enter full marks greater than 0.";

    if (f.passMarks.trim() === "" || isNaN(pass) || pass < 0) er.passMarks = "Enter the pass marks.";
    else if (!er.fullMarks && pass > full) er.passMarks = "Pass marks can't exceed full marks.";

    if (f.weightage.trim() === "" || isNaN(weight) || weight < 0 || weight > 100)
      er.weightage = "Enter a weightage between 0 and 100.";
    else if (weight > remaining) er.weightage = `Only ${remaining}% is left in this term.`;

    if (f.date && (f.date < term.startDate || f.date > term.endDate))
      er.date = `Pick a date between ${formatDate(term.startDate)} and ${formatDate(term.endDate)}.`;

    setErrors(er);
    if (Object.keys(er).length) return;

    onSave({
      termId: term.id,
      name: f.name.trim(),
      type: f.type as ExamType,
      fullMarks: full,
      passMarks: pass,
      weightage: weight,
      date: f.date,
      description: f.description.trim(),
    });
  }

  return (
    <Modal
      title={initial ? "Edit exam" : "Add exam"}
      description={`${term.name}, ${term.academicYear}. ${remaining}% weightage left.`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam name" required error={errors.name}>
            <input
              autoFocus
              className={inputCls}
              value={f.name}
              onChange={set("name")}
              placeholder="First Terminal Exam"
            />
          </Field>
          <Field label="Type">
            <select className={inputCls} value={f.type} onChange={set("type")}>
              {EXAM_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Full marks" required error={errors.fullMarks}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={f.fullMarks}
              onChange={set("fullMarks")}
              placeholder="100"
            />
          </Field>
          <Field label="Pass marks" required error={errors.passMarks}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={f.passMarks}
              onChange={set("passMarks")}
              placeholder="40"
            />
          </Field>
          <Field label="Weightage (%)" required error={errors.weightage}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={f.weightage}
              onChange={set("weightage")}
              placeholder="75"
            />
          </Field>
          <Field label="Exam date" error={errors.date}>
            <input
              type="date"
              className={inputCls}
              value={f.date}
              min={term.startDate}
              max={term.endDate}
              onChange={set("date")}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            rows={3}
            className={inputCls}
            value={f.description}
            onChange={set("description")}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {initial ? "Save changes" : "Add exam"}
          </button>
        </div>
      </form>
    </Modal>
  );
}