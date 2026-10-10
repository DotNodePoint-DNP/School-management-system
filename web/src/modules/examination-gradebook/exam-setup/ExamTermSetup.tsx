"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  Exam,
  ExamValues,
  Data,
  ModalState,
  Term,
  TermValues,
} from "./types";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  buildSeed,
  byDate,
  byStart,
  focusRing,
  formatDate,
  statusStyle,
  totalWeightage,
  uid,
} from "./utils";
import { ConfirmModal } from "./ConfirmModal";
import { ExamModal } from "./ExamModal";
import { TermModal } from "./TermModal";

/* ----------------------------------- Icon ---------------------------------- */

const ICONS = {
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4",
  trash:
    "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  chevron: "M9 6l6 6-6 6",
} as const;

function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: keyof typeof ICONS;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ---------------------------------- Views ---------------------------------- */

function WeightageBar({ total }: { total: number }) {
  const complete = total === 100;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full ${complete ? "bg-teal" : "bg-amber"}`}
          style={{ width: `${Math.min(total, 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {complete ? "Weightage complete (100%)" : `Weightage ${total}% of 100%`}
      </p>
    </div>
  );
}

interface TermListProps {
  terms: Term[]; // sorted
  exams: Exam[];
  onOpen: (termId: string) => void;
  onCreate: () => void;
  onEdit: (t: Term) => void;
  onDelete: (t: Term) => void;
}

function TermList({
  terms,
  exams,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
}: TermListProps) {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            Exam and term setup
          </h1>
          <p className="mt-1 text-sm text-muted">
            {terms.length} terms and {exams.length} exams. Select a term to
            manage its exams.
          </p>
        </div>
        <button className={btnPrimary} onClick={onCreate}>
          <Icon name="plus" /> Create term
        </button>
      </div>

      {terms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-10 text-center">
          <p className="text-sm text-muted">
            No terms yet. Create the first term for this year.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {terms.map((t) => {
            const list = exams.filter((e) => e.termId === t.id);
            return (
              <li
                key={t.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel"
              >
                <button
                  onClick={() => onOpen(t.id)}
                  className={`flex-1 space-y-3 p-5 text-left transition hover:bg-mint ${focusRing}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-lg font-semibold text-ink">
                        {t.name}
                      </span>
                      <span className="block text-sm text-muted">
                        {t.academicYear}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle(t.status)}`}
                    >
                      {t.status}
                    </span>
                  </span>
                  <span className="block text-sm text-ink">
                    {formatDate(t.startDate)} to {formatDate(t.endDate)}
                  </span>
                  <span className="block text-sm text-muted">
                    {list.length} {list.length === 1 ? "exam" : "exams"}
                  </span>
                  <WeightageBar total={totalWeightage(list)} />
                </button>
                <div className="flex gap-2 border-t border-line p-3">
                  <button
                    className={`${btnGhost} flex-1`}
                    onClick={() => onEdit(t)}
                  >
                    <Icon name="edit" /> Edit
                  </button>
                  <button
                    className={`${btnDanger} flex-1`}
                    onClick={() => onDelete(t)}
                  >
                    <Icon name="trash" /> Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface ExamListProps {
  term: Term;
  exams: Exam[]; // exams of this term, sorted
  onAdd: () => void;
  onEditTerm: () => void;
  onDeleteTerm: () => void;
  onEditExam: (e: Exam) => void;
  onDeleteExam: (e: Exam) => void;
}

function ExamList({
  term,
  exams,
  onAdd,
  onEditTerm,
  onDeleteTerm,
  onEditExam,
  onDeleteExam,
}: ExamListProps) {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{term.name}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle(term.status)}`}
            >
              {term.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {term.academicYear}, {formatDate(term.startDate)} to{" "}
            {formatDate(term.endDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={onEditTerm}>
            <Icon name="edit" /> Edit term
          </button>
          <button className={btnDanger} onClick={onDeleteTerm}>
            <Icon name="trash" /> Delete term
          </button>
          <button className={btnPrimary} onClick={onAdd}>
            <Icon name="plus" /> Add exam
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-panel p-5">
        <WeightageBar total={totalWeightage(exams)} />
      </div>

      {exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-10 text-center">
          <p className="text-sm text-muted">
            This term has no exams. Add the first one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-176 text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Exam</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Full marks</th>
                <th className="px-4 py-3 text-right font-medium">Pass marks</th>
                <th className="px-4 py-3 text-right font-medium">Weightage</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-ink">{e.name}</span>
                    {e.description && (
                      <span className="block max-w-xs truncate text-xs text-muted">
                        {e.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink">{e.type}</td>
                  <td className="px-4 py-3 text-ink">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 text-right text-ink">
                    {e.fullMarks}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">
                    {e.passMarks}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">
                    {e.weightage}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className={`${btnGhost} py-1.5!`}
                        onClick={() => onEditExam(e)}
                        aria-label={`Edit ${e.name}`}
                      >
                        <Icon name="edit" /> Edit
                      </button>
                      <button
                        className={`${btnDanger} py-1.5!`}
                        onClick={() => onDeleteExam(e)}
                        aria-label={`Delete ${e.name}`}
                      >
                        <Icon name="trash" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------- Main component ---------------------------- */

export default function ExamTermSetup() {
  const [{ terms, exams }, setData] = useState<Data>(buildSeed);
  const [termId, setTermId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const sortedTerms = useMemo(() => [...terms].sort(byStart), [terms]);
  const activeTerm = terms.find((t) => t.id === termId) ?? null;
  const termExams = useMemo(
    () => exams.filter((e) => e.termId === termId).sort(byDate),
    [exams, termId],
  );

  const closeModal = () => setModal(null);

  /* ---- term actions ---- */
  function saveTerm(values: TermValues) {
    if (modal?.type !== "term") return;
    const item = modal.item;
    if (item) {
      setData((d) => ({
        ...d,
        terms: d.terms.map((t) => (t.id === item.id ? { ...t, ...values } : t)),
      }));
      toast.success(`${values.name} updated`);
    } else {
      setData((d) => ({ ...d, terms: [...d.terms, { id: uid(), ...values }] }));
      toast.success(`${values.name} created`);
    }
    closeModal();
  }

  function deleteTerm() {
    if (modal?.type !== "deleteTerm") return;
    const t = modal.item;
    const count = exams.filter((e) => e.termId === t.id).length;
    setData((d) => ({
      terms: d.terms.filter((x) => x.id !== t.id),
      exams: d.exams.filter((e) => e.termId !== t.id),
    }));
    if (termId === t.id) setTermId(null);
    toast.success(
      `${t.name} deleted${count ? ` with ${count} exam${count > 1 ? "s" : ""}` : ""}`,
    );
    closeModal();
  }

  /* ---- exam actions ---- */
  function saveExam(values: ExamValues) {
    if (modal?.type !== "exam") return;
    const item = modal.item;
    if (item) {
      setData((d) => ({
        ...d,
        exams: d.exams.map((e) => (e.id === item.id ? { ...e, ...values } : e)),
      }));
      toast.success(`${values.name} updated`);
    } else {
      setData((d) => ({ ...d, exams: [...d.exams, { id: uid(), ...values }] }));
      toast.success(`${values.name} added`);
    }
    closeModal();
  }

  function deleteExam() {
    if (modal?.type !== "deleteExam") return;
    const e = modal.item;
    setData((d) => ({ ...d, exams: d.exams.filter((x) => x.id !== e.id) }));
    toast.success(`${e.name} deleted`);
    closeModal();
  }

  /* ---- derived values for modals ---- */
  const editingExamId = modal?.type === "exam" ? modal.item?.id : undefined;
  const remaining =
    100 - totalWeightage(termExams.filter((e) => e.id !== editingExamId));

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {activeTerm && (
          <nav
            aria-label="Breadcrumb"
            className="mb-5 flex items-center gap-1.5 text-sm"
          >
            <button
              onClick={() => setTermId(null)}
              className={`rounded px-1 text-muted hover:text-ink ${focusRing}`}
            >
              Terms
            </button>
            <Icon name="chevron" className="h-3.5 w-3.5 text-muted" />
            <span className="font-semibold text-ink">{activeTerm.name}</span>
          </nav>
        )}

        {!activeTerm ? (
          <TermList
            terms={sortedTerms}
            exams={exams}
            onOpen={setTermId}
            onCreate={() => setModal({ type: "term", item: null })}
            onEdit={(t) => setModal({ type: "term", item: t })}
            onDelete={(t) => setModal({ type: "deleteTerm", item: t })}
          />
        ) : (
          <ExamList
            term={activeTerm}
            exams={termExams}
            onAdd={() => setModal({ type: "exam", item: null })}
            onEditTerm={() => setModal({ type: "term", item: activeTerm })}
            onDeleteTerm={() =>
              setModal({ type: "deleteTerm", item: activeTerm })
            }
            onEditExam={(e) => setModal({ type: "exam", item: e })}
            onDeleteExam={(e) => setModal({ type: "deleteExam", item: e })}
          />
        )}
      </div>

      {modal?.type === "term" && (
        <TermModal
          initial={modal.item}
          takenKeys={terms
            .filter((t) => t.id !== modal.item?.id)
            .map((t) => `${t.name}|${t.academicYear}`.toLowerCase())}
          onSave={saveTerm}
          onClose={closeModal}
        />
      )}

      {modal?.type === "exam" && activeTerm && (
        <ExamModal
          initial={modal.item}
          term={activeTerm}
          remaining={remaining}
          onSave={saveExam}
          onClose={closeModal}
        />
      )}

      {modal?.type === "deleteTerm" && (
        <ConfirmModal
          title={`Delete ${modal.item.name}?`}
          message={`This also deletes all ${exams.filter((e) => e.termId === modal.item.id).length} exams in this term. You can't undo this.`}
          confirmLabel="Delete term"
          onConfirm={deleteTerm}
          onClose={closeModal}
        />
      )}

      {modal?.type === "deleteExam" && (
        <ConfirmModal
          title="Delete this exam?"
          message={`"${modal.item.name}" will be removed from this term. You can't undo this.`}
          confirmLabel="Delete exam"
          onConfirm={deleteExam}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
