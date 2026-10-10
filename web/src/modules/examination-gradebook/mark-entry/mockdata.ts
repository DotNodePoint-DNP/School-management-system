import type {
  ClassSection,
  Exam,
  Student,
  Subject,
  SubmitPayload,
  Teacher,
} from "../types";

export const subjects: Subject[] = [
  {
    id: "eng",
    name: "English",
    department: "Languages",
    practical: { maxMarks: 25, passPercent: 40 },
  },
  { id: "math", name: "Mathematics", department: "Math & Science" },
  // Science has a practical: 100 = 75 theory + 25 practical. Grade uses the combined total (set separatePass: true for per-part pass)
  {
    id: "sci",
    name: "Science",
    department: "Math & Science",
    practical: { maxMarks: 25, passPercent: 40 },
  },
];

export const classes: ClassSection[] = [
  { id: "8a", name: "Grade 8 – A" },
  { id: "8b", name: "Grade 8 – B" },
];

export const exams: Exam[] = [
  { id: "mid", name: "Mid-term", maxMarks: 100, passPercent: 40 },
  { id: "ut2", name: "Unit Test 2", maxMarks: 25, passPercent: 40 },
  {
    id: "final",
    name: "Final exam",
    maxMarks: 100,
    passPercent: 40,
    includesPractical: true,
  },
];

// Math & Science teacher -> subject defaults to Mathematics
export const teacher: Teacher = {
  id: "t1",
  name: "Sunita Sharma",
  department: "Math & Science",
  assignments: [
    { classId: "8a", subjectId: "eng" },
    { classId: "8a", subjectId: "math" },
    { classId: "8a", subjectId: "sci" },
    { classId: "8b", subjectId: "sci" },
  ],
};

const names = [
  "Aarav Thapa",
  "Anisha Gurung",
  "Bikash Rai",
  "Diya Shrestha",
  "Kabir Karki",
  "Mira Tamang",
  "Nabin Adhikari",
  "Pooja Basnet",
  "Rohan Magar",
  "Sita Lama",
  "Utsav Joshi",
  "Yuna Bhandari",
];
// 40 students so pagination is visible
export const loadStudents = async (classId: string): Promise<Student[]> =>
  Array.from({ length: 40 }, (_, i) => ({
    id: `${classId}-${i + 1}`,
    rollNo: i + 1,
    name: i < names.length ? names[i] : `Student ${i + 1}`,
  }));

export const onSubmit = async (payload: SubmitPayload): Promise<void> => {
  // replace with: await fetch("/api/marks", { method: "POST", body: JSON.stringify(payload) })
  console.log("submit", payload);
};
