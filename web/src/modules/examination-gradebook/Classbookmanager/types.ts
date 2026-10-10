export type NumOrEmpty = number | "";

export interface ClassItem {
  id: string;
  name: string;
}

export interface Book {
  id: string;
  classId: string;
  title: string;
  subject: string;
  publication: string;
  author: string;
  edition: string;
  year: NumOrEmpty;
  pages: NumOrEmpty;
  price: NumOrEmpty;
  isbn: string;
  language: string;
  description: string;
}

export type BookValues = Omit<Book, "id">;

export interface Data {
  classes: ClassItem[];
  books: Book[];
}

export type ModalState =
  | { type: "class"; item: ClassItem | null }
  | { type: "book"; item: Book | null }
  | { type: "deleteClass"; item: ClassItem }
  | { type: "deleteBook"; item: Book }
  | null;

export type ViewName = "classes" | "books" | "detail";