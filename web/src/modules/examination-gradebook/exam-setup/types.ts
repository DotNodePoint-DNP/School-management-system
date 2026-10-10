export type TermStatus = "Upcoming" | "Ongoing" | "Completed";

export type ExamType =
  | "Unit test"
  | "Terminal"
  | "Final"
  | "Practical"
  | "Project";

export interface Term {
  id: string;
  name: string;
  academicYear: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  status: TermStatus;
}

export interface Exam {
  id: string;
  termId: string;
  name: string;
  type: ExamType;
  fullMarks: number;
  passMarks: number;
  weightage: number; // percent of the term result
  date: string; // yyyy-mm-dd or ""
  description: string;
}

export type TermValues = Omit<Term, "id">;
export type ExamValues = Omit<Exam, "id">;

export interface Data {
  terms: Term[];
  exams: Exam[];
}

export type ModalState =
  | { type: "term"; item: Term | null }
  | { type: "exam"; item: Exam | null }
  | { type: "deleteTerm"; item: Term }
  | { type: "deleteExam"; item: Exam }
  | null;
