"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  Book,
  BookValues,
  ClassItem,
  Data,
  ModalState,
  ViewName,
} from "./types";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  buildSeed,
  byName,
  focusRing,
  money,
  show,
  stripeFor,
  uid,
} from "./utils";
import { BookModal } from "./Bookmodal";
import { ClassModal } from "./ClassModal";
import { ConfirmModal } from "./Confirmmodal";

/* ----------------------------------- Icon ---------------------------------- */

const ICONS = {
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4",
  trash:
    "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  close: "M6 6l12 12M18 6L6 18",
  chevron: "M9 6l6 6-6 6",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11",
} as const;

type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  className?: string;
}

function Icon({ name, className = "h-4 w-4" }: IconProps) {
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

interface BreadcrumbProps {
  view: ViewName;
  activeClass: ClassItem | null;
  activeBook: Book | null;
  onClasses: () => void;
  onBooks: () => void;
}

export function Breadcrumb({
  view,
  activeClass,
  activeBook,
  onClasses,
  onBooks,
}: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-5 flex flex-wrap items-center gap-1.5 text-sm"
    >
      <button
        onClick={onClasses}
        className={`rounded px-1 ${view === "classes" ? "font-semibold text-ink" : "text-muted hover:text-ink"} ${focusRing}`}
      >
        Classes
      </button>

      {activeClass && (
        <>
          <Icon name="chevron" className="h-3.5 w-3.5 text-muted" />
          <button
            onClick={onBooks}
            className={`rounded px-1 ${view === "books" ? "font-semibold text-ink" : "text-muted hover:text-ink"} ${focusRing}`}
          >
            {activeClass.name}
          </button>
        </>
      )}

      {activeBook && view === "detail" && (
        <>
          <Icon name="chevron" className="h-3.5 w-3.5 text-muted" />
          <span className="font-semibold text-ink">{activeBook.subject}</span>
        </>
      )}
    </nav>
  );
}

interface ClassListProps {
  classes: ClassItem[]; // already sorted
  books: Book[];
  onOpen: (classId: string) => void;
  onCreate: () => void;
  onEdit: (c: ClassItem) => void;
  onDelete: (c: ClassItem) => void;
}

export function ClassList({
  classes,
  books,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
}: ClassListProps) {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Classes</h1>
          <p className="mt-1 text-sm text-muted">
            {classes.length} classes and {books.length} books. Select a class to
            see its books.
          </p>
        </div>
        <button className={btnPrimary} onClick={onCreate}>
          <Icon name="plus" /> Create class
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-10 text-center">
          <p className="text-sm text-muted">
            No classes yet. Create one to start adding books.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {classes.map((c) => {
            const list = books.filter((b) => b.classId === c.id);
            return (
              <li
                key={c.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel"
              >
                <button
                  onClick={() => onOpen(c.id)}
                  className={`flex-1 p-5 text-left transition hover:bg-mint ${focusRing}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-ink">
                      {c.name}
                    </span>
                    <Icon name="chevron" className="h-4 w-4 text-muted" />
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {list.length} {list.length === 1 ? "book" : "books"}
                  </span>
                  <span className="mt-3 block line-clamp-2 text-xs text-muted">
                    {list.length
                      ? list.map((b) => b.subject).join(", ")
                      : "No books yet"}
                  </span>
                </button>
                <div className="flex gap-2 border-t border-line p-3">
                  <button
                    className={`${btnGhost} flex-1`}
                    onClick={() => onEdit(c)}
                  >
                    <Icon name="edit" /> Edit
                  </button>
                  <button
                    className={`${btnDanger} flex-1`}
                    onClick={() => onDelete(c)}
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

interface BookListProps {
  activeClass: ClassItem;
  books: Book[]; // books of the active class
  onOpen: (bookId: string) => void;
  onAdd: () => void;
  onEditClass: () => void;
  onDeleteClass: () => void;
  onEditBook: (b: Book) => void;
  onDeleteBook: (b: Book) => void;
}

export function BookList({
  activeClass,
  books,
  onOpen,
  onAdd,
  onEditClass,
  onDeleteClass,
  onEditBook,
  onDeleteBook,
}: BookListProps) {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {activeClass.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {books.length} {books.length === 1 ? "book" : "books"}. Select a
            book to see publication details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={onEditClass}>
            <Icon name="edit" /> Edit class
          </button>
          <button className={btnDanger} onClick={onDeleteClass}>
            <Icon name="trash" /> Delete class
          </button>
          <button className={btnPrimary} onClick={onAdd}>
            <Icon name="plus" /> Add book
          </button>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-10 text-center">
          <p className="text-sm text-muted">
            This class has no books. Add the first one.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <li
              key={b.id}
              className="flex overflow-hidden rounded-2xl border border-line bg-panel"
            >
              <span
                className={`w-2 shrink-0 ${stripeFor(b.subject)}`}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <button
                  onClick={() => onOpen(b.id)}
                  className={`flex-1 p-4 text-left transition hover:bg-mint ${focusRing}`}
                >
                  <span className="block text-xs font-medium text-teal">
                    {b.subject}
                  </span>
                  <span className="mt-1 block font-semibold text-ink">
                    {b.title}
                  </span>
                  <span className="mt-2 block text-sm text-muted">
                    {b.publication}
                  </span>
                  <span className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted">{show(b.year)}</span>
                    <span className="font-medium text-ink">
                      {money(b.price)}
                    </span>
                  </span>
                </button>
                <div className="flex gap-2 border-t border-line p-2.5">
                  <button
                    className={`${btnGhost} flex-1 py-1.5!`}
                    onClick={() => onEditBook(b)}
                  >
                    <Icon name="edit" /> Edit
                  </button>
                  <button
                    className={`${btnDanger} flex-1 py-1.5!`}
                    onClick={() => onDeleteBook(b)}
                  >
                    <Icon name="trash" /> Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface BookDetailProps {
  book: Book;
  activeClass: ClassItem;
  classBooks: Book[]; // all books in the same class (includes this one)
  onOpen: (bookId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function BookDetail({
  book,
  activeClass,
  classBooks,
  onOpen,
  onEdit,
  onDelete,
}: BookDetailProps) {
  const others = classBooks.filter((b) => b.id !== book.id);

  const rows: [string, string | number][] = [
    ["Publication", book.publication],
    ["Author", show(book.author)],
    ["Edition", show(book.edition)],
    ["Published year", show(book.year)],
    ["ISBN", show(book.isbn)],
    ["Language", show(book.language)],
    ["Pages", show(book.pages)],
    ["Price", money(book.price)],
  ];

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <span
            className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${stripeFor(book.subject)}`}
          >
            <Icon name="book" className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{book.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {book.subject} for {activeClass.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onEdit}>
            <Icon name="edit" /> Edit book
          </button>
          <button className={btnDanger} onClick={onDelete}>
            <Icon name="trash" /> Delete book
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-panel p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-ink">Publication details</h2>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="border-b border-line pb-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="mb-2 font-semibold text-ink">About this book</h2>
            <p className="text-sm leading-relaxed text-muted">
              {book.description || "No description added."}
            </p>
          </div>
          <div className="rounded-2xl bg-mint p-6">
            <h2 className="mb-1 font-semibold text-ink">
              Also in {activeClass.name}
            </h2>
            <p className="mb-3 text-sm text-muted">
              {others.length} other {others.length === 1 ? "book" : "books"}
            </p>
            <ul className="space-y-1">
              {others.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => onOpen(b.id)}
                    className={`rounded text-sm text-ink underline-offset-2 hover:underline ${focusRing}`}
                  >
                    {b.subject}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Main component ---------------------------- */

export default function ClassBookManager() {
  const [{ classes, books }, setData] = useState<Data>(buildSeed);
  const [classId, setClassId] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const sortedClasses = useMemo(() => [...classes].sort(byName), [classes]);
  const activeClass = classes.find((c) => c.id === classId) ?? null;
  const activeBook = books.find((b) => b.id === bookId) ?? null;
  const classBooks = useMemo(
    () => books.filter((b) => b.classId === classId),
    [books, classId],
  );

  const view: ViewName =
    activeBook && activeClass ? "detail" : activeClass ? "books" : "classes";

  const closeModal = () => setModal(null);

  /* ---- navigation ---- */
  const goClasses = () => {
    setClassId(null);
    setBookId(null);
  };
  const goBooks = () => setBookId(null);

  /* ---- class actions ---- */
  function saveClass(name: string) {
    if (modal?.type !== "class") return;
    const item = modal.item;
    if (item) {
      setData((d) => ({
        ...d,
        classes: d.classes.map((c) => (c.id === item.id ? { ...c, name } : c)),
      }));
      toast.success(`Class renamed to "${name}"`);
    } else {
      setData((d) => ({ ...d, classes: [...d.classes, { id: uid(), name }] }));
      toast.success(`${name} created`);
    }
    closeModal();
  }

  function deleteClass() {
    if (modal?.type !== "deleteClass") return;
    const c = modal.item;
    const count = books.filter((b) => b.classId === c.id).length;
    setData((d) => ({
      classes: d.classes.filter((x) => x.id !== c.id),
      books: d.books.filter((b) => b.classId !== c.id),
    }));
    if (classId === c.id) goClasses();
    toast.success(
      `${c.name} deleted${count ? ` with ${count} book${count > 1 ? "s" : ""}` : ""}`,
    );
    closeModal();
  }

  /* ---- book actions ---- */
  function saveBook(values: BookValues) {
    if (modal?.type !== "book") return;
    const item = modal.item;
    if (item) {
      setData((d) => ({
        ...d,
        books: d.books.map((b) => (b.id === item.id ? { ...b, ...values } : b)),
      }));
      if (bookId === item.id) setClassId(values.classId);
      toast.success(`"${values.title}" updated`);
    } else {
      setData((d) => ({ ...d, books: [...d.books, { id: uid(), ...values }] }));
      toast.success(`"${values.title}" added`);
    }
    closeModal();
  }

  function deleteBook() {
    if (modal?.type !== "deleteBook") return;
    const b = modal.item;
    setData((d) => ({ ...d, books: d.books.filter((x) => x.id !== b.id) }));
    if (bookId === b.id) setBookId(null);
    toast.success(`"${b.title}" deleted`);
    closeModal();
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Breadcrumb
          view={view}
          activeClass={activeClass}
          activeBook={activeBook}
          onClasses={goClasses}
          onBooks={goBooks}
        />

        {view === "classes" && (
          <ClassList
            classes={sortedClasses}
            books={books}
            onOpen={setClassId}
            onCreate={() => setModal({ type: "class", item: null })}
            onEdit={(c) => setModal({ type: "class", item: c })}
            onDelete={(c) => setModal({ type: "deleteClass", item: c })}
          />
        )}

        {view === "books" && activeClass && (
          <BookList
            activeClass={activeClass}
            books={classBooks}
            onOpen={setBookId}
            onAdd={() => setModal({ type: "book", item: null })}
            onEditClass={() => setModal({ type: "class", item: activeClass })}
            onDeleteClass={() =>
              setModal({ type: "deleteClass", item: activeClass })
            }
            onEditBook={(b) => setModal({ type: "book", item: b })}
            onDeleteBook={(b) => setModal({ type: "deleteBook", item: b })}
          />
        )}

        {view === "detail" && activeBook && activeClass && (
          <BookDetail
            book={activeBook}
            activeClass={activeClass}
            classBooks={classBooks}
            onOpen={setBookId}
            onEdit={() => setModal({ type: "book", item: activeBook })}
            onDelete={() => setModal({ type: "deleteBook", item: activeBook })}
          />
        )}
      </div>

      {modal?.type === "class" && (
        <ClassModal
          initial={modal.item}
          takenNames={classes
            .filter((c) => c.id !== modal.item?.id)
            .map((c) => c.name.toLowerCase())}
          onSave={saveClass}
          onClose={closeModal}
        />
      )}

      {modal?.type === "book" && (
        <BookModal
          initial={modal.item}
          classes={sortedClasses}
          defaultClassId={classId ?? sortedClasses[0]?.id ?? ""}
          onSave={saveBook}
          onClose={closeModal}
        />
      )}

      {modal?.type === "deleteClass" && (
        <ConfirmModal
          title={`Delete ${modal.item.name}?`}
          message={`This also deletes all ${books.filter((b) => b.classId === modal.item.id).length} books in this class. You can't undo this.`}
          confirmLabel="Delete class"
          onConfirm={deleteClass}
          onClose={closeModal}
        />
      )}

      {modal?.type === "deleteBook" && (
        <ConfirmModal
          title="Delete this book?"
          message={`"${modal.item.title}" will be removed from its class. You can't undo this.`}
          confirmLabel="Delete book"
          onConfirm={deleteBook}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
