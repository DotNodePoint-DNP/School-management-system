import type { Book, ClassItem, Data, NumOrEmpty } from "./types";

/* Demo data for Class 1 to 10. Replace buildSeed() with your API data later. */

const PUBLISHERS = [
  "Himal Publication",
  "Sagarmatha Books",
  "Gandaki Education Press",
  "Lumbini Learning House",
  "Koshi Academic Publishers",
];

const AUTHORS = [
  "R. Sharma",
  "S. Adhikari",
  "M. Thapa",
  "K. Gurung",
  "P. Shrestha",
  "A. Poudel",
];

function subjectsFor(n: number): string[] {
  if (n <= 3) return ["English", "Mathematics", "Nepali", "Social Studies"];
  if (n <= 5) return ["English", "Mathematics", "Nepali", "Science", "Social Studies"];
  if (n <= 8)
    return ["English", "Mathematics", "Nepali", "Science", "Social Studies", "Computer"];
  return [
    "English",
    "Compulsory Mathematics",
    "Nepali",
    "Science",
    "Social Studies",
    "Optional Mathematics",
    "Computer Science",
  ];
}

export function buildSeed(): Data {
  const classes: ClassItem[] = [];
  const books: Book[] = [];
  let k = 0;

  for (let n = 1; n <= 10; n++) {
    classes.push({ id: `c${n}`, name: `Class ${n}` });

    subjectsFor(n).forEach((subject, i) => {
      k += 1;
      books.push({
        id: `b${k}`,
        classId: `c${n}`,
        title: `${subject} Book ${n}`,
        subject,
        publication: PUBLISHERS[(n + i) % PUBLISHERS.length],
        author: AUTHORS[(n * 2 + i) % AUTHORS.length],
        edition: `${((n + i) % 4) + 1}th edition`,
        year: 2020 + ((n + i) % 6),
        pages: 80 + ((n * 17 + i * 23) % 180),
        price: 180 + ((n * 31 + i * 47) % 320),
        isbn: `978-9937-${String(1000 + k * 7).padStart(4, "0")}-${(k % 9) + 1}`,
        language: subject === "Nepali" ? "Nepali" : "English",
        description: `Textbook for ${subject} covering the full Class ${n} syllabus with exercises and revision questions.`,
      });
    });
  }

  return { classes, books };
}

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const byName = (a: ClassItem, b: ClassItem): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

export const money = (v: NumOrEmpty | null | undefined): string =>
  v === "" || v == null ? "—" : `NPR ${Number(v).toLocaleString("en-IN")}`;

export const show = (v: string | number | null | undefined): string | number =>
  v === "" || v == null ? "—" : v;

const STRIPES = ["bg-teal", "bg-amber", "bg-coral", "bg-navy"];

export const stripeFor = (s: string): string =>
  STRIPES[s.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % STRIPES.length];

/* Shared Tailwind class strings */

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";

const btnBase = `inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${focusRing}`;

export const btnPrimary = `${btnBase} bg-teal text-white hover:opacity-90`;
export const btnGhost = `${btnBase} border border-line bg-panel text-ink hover:bg-mint`;
export const btnDanger = `${btnBase} border border-line bg-panel text-coral hover:bg-coral hover:text-white`;
export const btnDangerSolid = `${btnBase} bg-coral text-white hover:opacity-90`;

export const inputCls = `w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink placeholder:text-muted ${focusRing}`;