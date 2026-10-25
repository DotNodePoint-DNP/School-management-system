import { Prisma } from '../../generated/prisma/client.js';

type Dec = Prisma.Decimal;
const D = (value: string | number | Dec): Dec => new Prisma.Decimal(value);
const ZERO = D(0);
const round2 = (d: Dec): Dec =>
  d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const round4 = (d: Dec): Dec =>
  d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

export interface CalcBand {
  grade: string;
  minPercent: number;
  gradePoint: number;
  description: string;
  isPass: boolean;
}
export interface CalcComponent {
  examId: string;
  examName: string;
  weightPercent: number;
}
export interface CalcSubject {
  subjectId: string;
  code: string;
  name: string;
  isCompulsory: boolean;
  creditHours: number | null;
}
export interface CalcSetup {
  examId: string;
  subjectId: string;
  fullTheory: number;
  passTheory: number;
  fullPractical: number | null;
  passPractical: number | null;
}
export interface CalcStudent {
  enrollmentId: string;
  sectionId: string;
  optionalSubjectIds: string[];
}
export interface CalcMark {
  examId: string;
  subjectId: string;
  enrollmentId: string;
  theory: number | null;
  practical: number | null;
  absent: boolean;
}

export interface CalcInput {
  bands: CalcBand[];
  components: CalcComponent[];
  subjects: CalcSubject[];
  setups: CalcSetup[];
  students: CalcStudent[];
  marks: CalcMark[];
}

export interface ExamPart {
  examId: string;
  examName: string;
  /** Effective weight (%) after spreading the weight of exams where this subject is not set up. */
  weightPercent: number;
  theory: number | null;
  practical: number | null;
  absent: boolean;
  fullTheory: number;
  passTheory: number;
  fullPractical: number | null;
  passPractical: number | null;
}

export type SubjectStatus = 'PASSED' | 'FAILED' | 'ABSENT' | 'MISSING';
export interface SubjectResult {
  subjectId: string;
  code: string;
  name: string;
  isCompulsory: boolean;
  creditHours: number | null;
  status: SubjectStatus;
  /** Weighted percentage, rounded to 2 decimals. This rounded value decides the grade. */
  percentage: number | null;
  grade: string | null;
  gradePoint: number | null;
  weightedMarks: number | null;
  weightedFull: number;
  failedBecause: ('THEORY' | 'PRACTICAL' | 'GRADE' | 'ABSENT')[];
  exams: ExamPart[];
}

export interface StudentResult {
  enrollmentId: string;
  sectionId: string;
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  totalMarks: number | null;
  totalFull: number | null;
  percentage: number | null;
  gpa: number | null;
  creditBasis: 'CREDIT_HOURS' | 'EQUAL';
  failedSubjects: string[];
  missing: string[];
  sectionRank: number | null;
  classRank: number | null;
  subjects: SubjectResult[];
}

export interface CalcOutput {
  students: StudentResult[];
  warnings: string[];
}

interface Plan {
  subject: CalcSubject;
  exams: { comp: CalcComponent; setup: CalcSetup; weight: Dec }[];
  weightedFull: Dec;
}

export function computeResults(input: CalcInput): CalcOutput {
  const warnings: string[] = [];
  const bands = [...input.bands].sort((a, b) => b.minPercent - a.minPercent);
  const setupBy = new Map(
    input.setups.map((s) => [`${s.examId}:${s.subjectId}`, s] as const),
  );
  const marksBy = new Map(
    input.marks.map(
      (m) => [`${m.examId}:${m.subjectId}:${m.enrollmentId}`, m] as const,
    ),
  );

  const plans: Plan[] = [];
  for (const subject of input.subjects) {
    const included = input.components.filter((c) =>
      setupBy.has(`${c.examId}:${subject.subjectId}`),
    );
    if (included.length === 0) {
      warnings.push(
        `${subject.code} is in the curriculum but in none of the exams, so it is not part of the result`,
      );
      continue;
    }
    if (included.length < input.components.length) {
      warnings.push(
        `${subject.code} is not set up in every exam; its weight is spread over ${included.map((c) => c.examName).join(', ')}`,
      );
    }
    const total = included.reduce((n, c) => n.plus(c.weightPercent), ZERO);
    const exams = included.map((comp) => ({
      comp,
      setup: setupBy.get(`${comp.examId}:${subject.subjectId}`) as CalcSetup,
      weight: D(comp.weightPercent).mul(100).div(total),
    }));
    const weightedFull = exams.reduce(
      (n, e) =>
        n.plus(
          e.weight
            .div(100)
            .mul(D(e.setup.fullTheory).plus(e.setup.fullPractical ?? 0)),
        ),
      ZERO,
    );
    plans.push({ subject, exams, weightedFull });
  }

  const students = input.students.map((st) => {
    const chosen = new Set(st.optionalSubjectIds);
    const subjects = plans
      .filter((p) => p.subject.isCompulsory || chosen.has(p.subject.subjectId))
      .map((p) => evaluate(p, st.enrollmentId, bands, marksBy));
    return summarize(st, subjects);
  });
  assignRanks(students, (s) => s.sectionId, 'sectionRank');
  assignRanks(students, () => 'class', 'classRank');
  return { students, warnings };
}

function evaluate(
  plan: Plan,
  enrollmentId: string,
  bands: CalcBand[],
  marksBy: Map<string, CalcMark>,
): SubjectResult {
  const { subject } = plan;
  const base = {
    subjectId: subject.subjectId,
    code: subject.code,
    name: subject.name,
    isCompulsory: subject.isCompulsory,
    creditHours: subject.creditHours,
    weightedFull: round4(plan.weightedFull).toNumber(),
  };
  const exams: ExamPart[] = [];
  let missing = false;
  let absent = false;
  let pctRaw = ZERO;
  let theoryObtained = ZERO;
  let theoryPass = ZERO;
  let practicalObtained = ZERO;
  let practicalPass = ZERO;

  for (const e of plan.exams) {
    const mark = marksBy.get(
      `${e.comp.examId}:${subject.subjectId}:${enrollmentId}`,
    );
    exams.push({
      examId: e.comp.examId,
      examName: e.comp.examName,
      weightPercent: round4(e.weight).toNumber(),
      theory: mark?.theory ?? null,
      practical: mark?.practical ?? null,
      absent: mark?.absent ?? false,
      fullTheory: e.setup.fullTheory,
      passTheory: e.setup.passTheory,
      fullPractical: e.setup.fullPractical,
      passPractical: e.setup.passPractical,
    });
    if (!mark) {
      missing = true;
      continue;
    }
    if (mark.absent) {
      absent = true;
      continue;
    }

    const fullTheory = D(e.setup.fullTheory);
    const fullPractical =
      e.setup.fullPractical === null ? ZERO : D(e.setup.fullPractical);
    const theory = D(mark.theory ?? 0);
    const practical = D(mark.practical ?? 0);
    pctRaw = pctRaw.plus(
      e.weight.mul(theory.plus(practical).div(fullTheory.plus(fullPractical))),
    );
    theoryObtained = theoryObtained.plus(e.weight.mul(theory.div(fullTheory)));
    theoryPass = theoryPass.plus(
      e.weight.mul(D(e.setup.passTheory).div(fullTheory)),
    );
    if (e.setup.fullPractical !== null && e.setup.passPractical !== null) {
      practicalObtained = practicalObtained.plus(
        e.weight.mul(practical.div(fullPractical)),
      );
      practicalPass = practicalPass.plus(
        e.weight.mul(D(e.setup.passPractical).div(fullPractical)),
      );
    }
  }

  if (missing) {
    return {
      ...base,
      status: 'MISSING',
      percentage: null,
      grade: null,
      gradePoint: null,
      weightedMarks: null,
      failedBecause: [],
      exams,
    };
  }
  if (absent) {
    return {
      ...base,
      status: 'ABSENT',
      percentage: null,
      grade: null,
      gradePoint: 0,
      weightedMarks: 0,
      failedBecause: ['ABSENT'],
      exams,
    };
  }

  const percentage = round2(pctRaw);
  const band =
    bands.find((b) => percentage.gte(b.minPercent)) ??
    (bands[bands.length - 1] as CalcBand);
  const failedBecause: SubjectResult['failedBecause'] = [];
  if (theoryObtained.lt(theoryPass)) failedBecause.push('THEORY');
  if (practicalObtained.lt(practicalPass)) failedBecause.push('PRACTICAL');
  if (!band.isPass) failedBecause.push('GRADE');
  const passed = failedBecause.length === 0;

  let { grade, gradePoint } = band;
  if (!passed) {
    // Never show a passing grade next to a fail: use the scale's lowest (failing) band.
    const lowest = bands[bands.length - 1] as CalcBand;
    if (!lowest.isPass) ({ grade, gradePoint } = lowest);
  }
  return {
    ...base,
    status: passed ? 'PASSED' : 'FAILED',
    percentage: percentage.toNumber(),
    grade,
    gradePoint,
    weightedMarks: round4(pctRaw.div(100).mul(plan.weightedFull)).toNumber(),
    failedBecause,
    exams,
  };
}

function summarize(st: CalcStudent, subjects: SubjectResult[]): StudentResult {
  const missing = subjects
    .filter((s) => s.status === 'MISSING')
    .map((s) => s.code);
  const failedSubjects = subjects
    .filter((s) => s.status === 'FAILED' || s.status === 'ABSENT')
    .map((s) => s.code);
  if (subjects.length === 0 || missing.length > 0) {
    return {
      enrollmentId: st.enrollmentId,
      sectionId: st.sectionId,
      status: 'INCOMPLETE',
      totalMarks: null,
      totalFull: null,
      percentage: null,
      gpa: null,
      creditBasis: 'EQUAL',
      failedSubjects,
      missing,
      sectionRank: null,
      classRank: null,
      subjects,
    };
  }

  const totalMarks = subjects.reduce(
    (n, s) => n.plus(s.weightedMarks ?? 0),
    ZERO,
  );
  const totalFull = subjects.reduce((n, s) => n.plus(s.weightedFull), ZERO);
  const useCredits = subjects.every(
    (s) => s.creditHours !== null && s.creditHours > 0,
  );
  let weighted = ZERO;
  let weights = ZERO;
  for (const s of subjects) {
    const credit = useCredits ? D(s.creditHours as number) : D(1);
    weighted = weighted.plus(credit.mul(s.gradePoint ?? 0));
    weights = weights.plus(credit);
  }
  const passedAllCompulsory = subjects
    .filter((s) => s.isCompulsory)
    .every((s) => s.status === 'PASSED');
  return {
    enrollmentId: st.enrollmentId,
    sectionId: st.sectionId,
    status: passedAllCompulsory ? 'PASS' : 'FAIL',
    totalMarks: round2(totalMarks).toNumber(),
    totalFull: round2(totalFull).toNumber(),
    percentage: totalFull.isZero()
      ? null
      : round2(totalMarks.div(totalFull).mul(100)).toNumber(),
    gpa: round2(weighted.div(weights)).toNumber(),
    creditBasis: useCredits ? 'CREDIT_HOURS' : 'EQUAL',
    failedSubjects,
    missing,
    sectionRank: null,
    classRank: null,
    subjects,
  };
}

/** Passed students first, then failed; within each by percentage. Ties share a rank (1, 2, 2, 4). */
function assignRanks(
  students: StudentResult[],
  groupOf: (s: StudentResult) => string,
  field: 'sectionRank' | 'classRank',
): void {
  const groups = new Map<string, StudentResult[]>();
  for (const s of students) {
    if (s.status === 'INCOMPLETE') continue;
    const key = groupOf(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const list of groups.values()) {
    list.sort(
      (a, b) =>
        (a.status === b.status ? 0 : a.status === 'PASS' ? -1 : 1) ||
        (b.percentage as number) - (a.percentage as number),
    );
    list.forEach((s, i) => {
      const prev = list[i - 1];
      s[field] =
        prev && prev.status === s.status && prev.percentage === s.percentage
          ? (prev[field] as number)
          : i + 1;
    });
  }
}
