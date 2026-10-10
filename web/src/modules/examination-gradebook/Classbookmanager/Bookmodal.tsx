"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Book, BookValues, ClassItem } from "./types";
import { btnGhost, btnPrimary, inputCls } from "./utils";
import { Field, Modal } from "./Modals";

interface BookForm {
  classId: string;
  title: string;
  subject: string;
  publication: string;
  author: string;
  edition: string;
  year: string;
  pages: string;
  price: string;
  isbn: string;
  language: string;
  description: string;
}

type BookErrors = Partial<Record<keyof BookForm, string>>;

interface BookModalProps {
  initial: Book | null;
  classes: ClassItem[];
  defaultClassId: string;
  onSave: (values: BookValues) => void;
  onClose: () => void;
}

export function BookModal({ initial, classes, defaultClassId, onSave, onClose }: BookModalProps) {
  const [f, setF] = useState<BookForm>(() => ({
    classId: initial?.classId ?? defaultClassId,
    title: initial?.title ?? "",
    subject: initial?.subject ?? "",
    publication: initial?.publication ?? "",
    author: initial?.author ?? "",
    edition: initial?.edition ?? "",
    year: String(initial?.year ?? ""),
    pages: String(initial?.pages ?? ""),
    price: String(initial?.price ?? ""),
    isbn: initial?.isbn ?? "",
    language: initial?.language ?? "English",
    description: initial?.description ?? "",
  }));
  const [errors, setErrors] = useState<BookErrors>({});

  const set =
    (k: keyof BookForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setF((p) => ({ ...p, [k]: value }));
      setErrors((p) => ({ ...p, [k]: undefined }));
    };

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er: BookErrors = {};
    if (!f.title.trim()) er.title = "Enter the book title.";
    if (!f.subject.trim()) er.subject = "Enter the subject.";
    if (!f.publication.trim()) er.publication = "Enter the publication.";
    if (f.year && !/^\d{4}$/.test(f.year)) er.year = "Enter a 4-digit year.";
    if (f.pages && !/^\d+$/.test(f.pages)) er.pages = "Enter a whole number.";
    if (f.price !== "" && (isNaN(Number(f.price)) || Number(f.price) < 0))
      er.price = "Enter a valid price.";
    setErrors(er);
    if (Object.keys(er).length) return;

    onSave({
      classId: f.classId,
      title: f.title.trim(),
      subject: f.subject.trim(),
      publication: f.publication.trim(),
      author: f.author.trim(),
      edition: f.edition.trim(),
      year: f.year ? Number(f.year) : "",
      pages: f.pages ? Number(f.pages) : "",
      price: f.price !== "" ? Number(f.price) : "",
      isbn: f.isbn.trim(),
      language: f.language,
      description: f.description.trim(),
    });
  }

  return (
    <Modal
      title={initial ? "Edit book" : "Add book"}
      description="Fields marked * are required."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" required>
            <select className={inputCls} value={f.classId} onChange={set("classId")}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject" required error={errors.subject}>
            <input
              autoFocus
              className={inputCls}
              value={f.subject}
              onChange={set("subject")}
              placeholder="Science"
            />
          </Field>
        </div>
        <Field label="Book title" required error={errors.title}>
          <input
            className={inputCls}
            value={f.title}
            onChange={set("title")}
            placeholder="Science Book 6"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Publication" required error={errors.publication}>
            <input
              className={inputCls}
              value={f.publication}
              onChange={set("publication")}
              placeholder="Himal Publication"
            />
          </Field>
          <Field label="Author">
            <input className={inputCls} value={f.author} onChange={set("author")} />
          </Field>
          <Field label="Edition">
            <input
              className={inputCls}
              value={f.edition}
              onChange={set("edition")}
              placeholder="2nd edition"
            />
          </Field>
          <Field label="Published year" error={errors.year}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={f.year}
              onChange={set("year")}
              placeholder="2025"
            />
          </Field>
          <Field label="Pages" error={errors.pages}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={f.pages}
              onChange={set("pages")}
            />
          </Field>
          <Field label="Price (NPR)" error={errors.price}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={f.price}
              onChange={set("price")}
            />
          </Field>
          <Field label="ISBN">
            <input className={inputCls} value={f.isbn} onChange={set("isbn")} />
          </Field>
          <Field label="Language">
            <select className={inputCls} value={f.language} onChange={set("language")}>
              <option>English</option>
              <option>Nepali</option>
              <option>Bilingual</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
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
            {initial ? "Save changes" : "Add book"}
          </button>
        </div>
      </form>
    </Modal>
  );
}