import { describe, expect, it } from 'vitest';
import {
  computeResults,
  type CalcBand,
  type CalcComponent,
  type CalcInput,
  type CalcMark,
  type CalcSetup,
  type CalcStudent,
  type CalcSubject,
} from '../src/modules/exams/result-calculator.js';

const SCALE: CalcBand[] = [
  ['A+', 90, 4.0, true],
  ['A', 80, 3.6, true],
  ['B+', 70, 3.2, true],
  ['B', 60, 2.8, true],
  ['C+', 50, 2.4, true],
  ['C', 40, 2.0, true],
  ['D', 35, 1.6, true],
  ['NG', 0, 0, false],
].map(
  ([grade, minPercent, gradePoint, isPass]) =>
    ({ grade, minPercent, gradePoint, isPass, description: grade }) as CalcBand,
);

const exam = (id: string, weightPercent: number): CalcComponent => ({
  examId: id,
  examName: id,
  weightPercent,
});
const subject = (
  id: string,
  extra: Partial<CalcSubject> = {},
): CalcSubject => ({
  subjectId: id,
  code: id.toUpperCase(),
  name: id,
  isCompulsory: true,
  creditHours: null,
  ...extra,
});
const setup = (
  examId: string,
  subjectId: string,
  extra: Partial<CalcSetup> = {},
): CalcSetup => ({
  examId,
  subjectId,
  fullTheory: 100,
  passTheory: 35,
  fullPractical: null,
  passPractical: null,
  ...extra,
});
const mark = (
  examId: string,
  subjectId: string,
  enrollmentId: string,
  theory: number | null,
  practical: number | null = null,
  absent = false,
): CalcMark => ({
  examId,
  subjectId,
  enrollmentId,
  theory,
  practical,
  absent,
});
const student = (
  enrollmentId: string,
  sectionId = 's1',
  optionalSubjectIds: string[] = [],
): CalcStudent => ({ enrollmentId, sectionId, optionalSubjectIds });
const run = (input: Partial<CalcInput>) =>
  computeResults({
    bands: SCALE,
    components: [exam('final', 100)],
    subjects: [],
    setups: [],
    students: [],
    marks: [],
    ...input,
  });
const MATHS = setup('final', 'maths', {
  fullTheory: 75,
  passTheory: 26.25,
  fullPractical: 25,
  passPractical: 10,
});

describe('result calculation', () => {
  it('grades a single exam and applies component pass marks independently', () => {
    const out = run({
      subjects: [subject('maths')],
      setups: [MATHS],
      students: ['a', 'b', 'c', 'd', 'e'].map((id) => student(id)),
      marks: [
        mark('final', 'maths', 'a', 60, 20), // 80 -> A
        mark('final', 'maths', 'b', 26.25, 10), // exactly the pass marks: 36.25% -> D, passes
        mark('final', 'maths', 'c', 26, 25), // theory just below its pass marks, though the total is 51%
        mark('final', 'maths', 'd', 75, 9), // practical below its pass marks
        mark('final', 'maths', 'e', 75, 25), // 100 -> A+
      ],
    });
    const bySubject = (id: string) =>
      out.students.find((s) => s.enrollmentId === id)?.subjects[0];
    expect(bySubject('a')).toMatchObject({
      status: 'PASSED',
      percentage: 80,
      grade: 'A',
      gradePoint: 3.6,
    });
    expect(bySubject('b')).toMatchObject({
      status: 'PASSED',
      percentage: 36.25,
      grade: 'D',
      gradePoint: 1.6,
    });
    expect(bySubject('c')).toMatchObject({
      status: 'FAILED',
      percentage: 51,
      grade: 'NG',
      gradePoint: 0,
      failedBecause: ['THEORY'],
    });
    expect(bySubject('d')).toMatchObject({
      status: 'FAILED',
      percentage: 84,
      grade: 'NG',
      failedBecause: ['PRACTICAL'],
    });
    expect(bySubject('e')).toMatchObject({
      status: 'PASSED',
      grade: 'A+',
      gradePoint: 4,
    });
  });

  it('fails a subject whose total falls in the failing band', () => {
    const out = run({
      subjects: [subject('eng')],
      setups: [setup('final', 'eng')],
      students: [student('a'), student('b')],
      marks: [mark('final', 'eng', 'a', 34.99), mark('final', 'eng', 'b', 35)],
    });
    expect(out.students[0]?.subjects[0]).toMatchObject({
      status: 'FAILED',
      grade: 'NG',
      failedBecause: ['THEORY', 'GRADE'],
    });
    expect(out.students[1]?.subjects[0]).toMatchObject({
      status: 'PASSED',
      grade: 'D',
    });
  });

  it('combines weighted exams by percentage', () => {
    const out = run({
      components: [exam('t1', 20), exam('t2', 20), exam('final', 60)],
      subjects: [subject('eng')],
      setups: [setup('t1', 'eng'), setup('t2', 'eng'), setup('final', 'eng')],
      students: [student('a')],
      marks: [
        mark('t1', 'eng', 'a', 50),
        mark('t2', 'eng', 'a', 60),
        mark('final', 'eng', 'a', 80),
      ],
    });
    expect(out.students[0]?.subjects[0]).toMatchObject({
      percentage: 70,
      grade: 'B+',
      gradePoint: 3.2,
    }); // 10 + 12 + 48
    expect(out.warnings).toEqual([]);
  });

  it('spreads the weight of exams where a subject is not set up, and says so', () => {
    const out = run({
      components: [exam('t1', 20), exam('t2', 20), exam('final', 60)],
      subjects: [subject('art')],
      setups: [setup('t2', 'art'), setup('final', 'art')],
      students: [student('a')],
      marks: [mark('t2', 'art', 'a', 60), mark('final', 'art', 'a', 80)],
    });
    expect(out.students[0]?.subjects[0]).toMatchObject({ percentage: 75 }); // 25% x 60 + 75% x 80
    expect(out.warnings[0]).toMatch(/ART is not set up in every exam/);
  });

  it('rounds to 2 decimals half-up before grading, so the printed number decides', () => {
    const out = run({
      components: [exam('e1', 50), exam('e2', 50)],
      subjects: [subject('eng')],
      setups: [setup('e1', 'eng'), setup('e2', 'eng')],
      students: [student('a')],
      marks: [mark('e1', 'eng', 'a', 89.99), mark('e2', 'eng', 'a', 90)],
    });
    expect(out.students[0]?.subjects[0]).toMatchObject({
      percentage: 90,
      grade: 'A+',
    }); // 89.995 rounds up to 90.00
  });

  it('computes totals across subjects with different full marks', () => {
    const out = run({
      subjects: [subject('maths'), subject('comp')],
      setups: [
        MATHS,
        setup('final', 'comp', { fullTheory: 50, passTheory: 17.5 }),
      ],
      students: [student('a')],
      marks: [
        mark('final', 'maths', 'a', 60, 20),
        mark('final', 'comp', 'a', 40),
      ],
    });
    expect(out.students[0]).toMatchObject({
      status: 'PASS',
      totalMarks: 120,
      totalFull: 150,
      percentage: 80,
    });
  });

  it('weights GPA by credit hours, falling back to equal weights when any are missing', () => {
    const marks = [
      mark('final', 'a', 'x', 85),
      mark('final', 'b', 'x', 65),
      mark('final', 'c', 'x', 55), // A 3.6, B 2.8, C+ 2.4
    ];
    const setups = ['a', 'b', 'c'].map((id) => setup('final', id));
    const withCredits = run({
      subjects: [
        subject('a', { creditHours: 4 }),
        subject('b', { creditHours: 3 }),
        subject('c', { creditHours: 3 }),
      ],
      setups,
      students: [student('x')],
      marks,
    });
    expect(withCredits.students[0]).toMatchObject({
      creditBasis: 'CREDIT_HOURS',
      gpa: 3.0,
    }); // (14.4 + 8.4 + 7.2) / 10
    const partial = run({
      subjects: [
        subject('a', { creditHours: 4 }),
        subject('b'),
        subject('c', { creditHours: 3 }),
      ],
      setups,
      students: [student('x')],
      marks,
    });
    expect(partial.students[0]).toMatchObject({
      creditBasis: 'EQUAL',
      gpa: 2.93,
    }); // (3.6 + 2.8 + 2.4) / 3
  });

  it('treats an absent student as failing the subject, with no grade and zero points', () => {
    const out = run({
      subjects: [subject('eng'), subject('art', { isCompulsory: false })],
      setups: [setup('final', 'eng'), setup('final', 'art')],
      students: [student('a', 's1', ['art']), student('b', 's1', ['art'])],
      marks: [
        mark('final', 'eng', 'a', null, null, true),
        mark('final', 'art', 'a', 70),
        mark('final', 'eng', 'b', 80),
        mark('final', 'art', 'b', null, null, true),
      ],
    });
    expect(out.students[0]).toMatchObject({
      status: 'FAIL',
      failedSubjects: ['ENG'],
    });
    expect(out.students[0]?.subjects[0]).toMatchObject({
      status: 'ABSENT',
      grade: null,
      gradePoint: 0,
      percentage: null,
    });
    expect(out.students[1]).toMatchObject({
      status: 'PASS',
      failedSubjects: ['ART'],
    }); // an absent optional subject does not fail the student
  });

  it('marks students with missing marks as incomplete and does not rank them', () => {
    const out = run({
      subjects: [subject('eng')],
      setups: [setup('final', 'eng')],
      students: [student('a'), student('b')],
      marks: [mark('final', 'eng', 'a', 70)],
    });
    expect(out.students[0]).toMatchObject({ status: 'PASS', classRank: 1 });
    expect(out.students[1]).toMatchObject({
      status: 'INCOMPLETE',
      missing: ['ENG'],
      percentage: null,
      classRank: null,
      sectionRank: null,
    });
  });

  it('includes optional subjects only for the students who chose them', () => {
    const out = run({
      subjects: [subject('eng'), subject('comp', { isCompulsory: false })],
      setups: [setup('final', 'eng'), setup('final', 'comp')],
      students: [student('a', 's1', ['comp']), student('b')],
      marks: [
        mark('final', 'eng', 'a', 70),
        mark('final', 'comp', 'a', 90),
        mark('final', 'eng', 'b', 70),
      ],
    });
    expect(out.students[0]?.subjects.map((s) => s.code)).toEqual([
      'ENG',
      'COMP',
    ]);
    expect(out.students[1]?.subjects.map((s) => s.code)).toEqual(['ENG']);
  });

  it('ranks passed students first, shares ranks on ties, and ranks sections separately', () => {
    const out = run({
      subjects: [subject('eng')],
      setups: [setup('final', 'eng')],
      students: [
        student('top', 's1'),
        student('tie1', 's2'),
        student('tie2', 's1'),
        student('low', 's2'),
        student('failed', 's1'),
      ],
      marks: [
        mark('final', 'eng', 'top', 90),
        mark('final', 'eng', 'tie1', 75),
        mark('final', 'eng', 'tie2', 75),
        mark('final', 'eng', 'low', 40),
        mark('final', 'eng', 'failed', 20), // the failed student scores below everyone anyway
      ],
    });
    const rank = (id: string) =>
      out.students.find((s) => s.enrollmentId === id);
    expect([
      rank('top')?.classRank,
      rank('tie1')?.classRank,
      rank('tie2')?.classRank,
      rank('low')?.classRank,
      rank('failed')?.classRank,
    ]).toEqual([1, 2, 2, 4, 5]);
    expect([
      rank('top')?.sectionRank,
      rank('tie2')?.sectionRank,
      rank('failed')?.sectionRank,
    ]).toEqual([1, 2, 3]);
    expect([rank('tie1')?.sectionRank, rank('low')?.sectionRank]).toEqual([
      1, 2,
    ]);
  });

  it('ranks every failed student after every passed one, even with a higher percentage', () => {
    const out = run({
      subjects: [subject('maths'), subject('eng')],
      setups: [MATHS, setup('final', 'eng')],
      students: [student('passed'), student('failed')],
      marks: [
        mark('final', 'maths', 'passed', 30, 12),
        mark('final', 'eng', 'passed', 40), // low total, passes
        mark('final', 'maths', 'failed', 75, 25),
        mark('final', 'eng', 'failed', 30), // 100% in maths, fails English
      ],
    });
    const [passed, failed] = out.students;
    expect(passed).toMatchObject({ status: 'PASS', classRank: 1 });
    expect(failed).toMatchObject({ status: 'FAIL', classRank: 2 });
    expect((failed?.percentage ?? 0) > (passed?.percentage ?? 0)).toBe(true);
  });
});
