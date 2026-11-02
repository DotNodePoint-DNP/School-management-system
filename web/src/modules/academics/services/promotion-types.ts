export interface PromotionSummary {
  run: {
    id: string;
    status: "DRAFT" | "APPLYING" | "APPLIED";
    fromYear: { id: string; name: string };
    toYear: { id: string; name: string };
    createdAt: string;
    appliedAt: string | null;
  };
  totals: {
    students: number;
    promote: number;
    repeat: number;
    graduate: number;
    hold: number;
    applied: number;
    needsSection: number;
    stale: number;
  };
  classes: {
    classId: string;
    className: string;
    sortOrder: number;
    nextClass: { id: string; name: string } | null;
    resultVersion: number | null;
    stale: boolean;
    counts: {
      promote: number;
      repeat: number;
      graduate: number;
      hold: number;
      applied: number;
      needsSection: number;
    };
  }[];
  readiness: {
    code: string;
    blocking: boolean;
    classId: string | null;
    sectionId: string | null;
    message: string;
  }[];
  refresh?: {
    students: number;
    created: number;
    manualKept: number;
    resultChanged: number;
    removed: number;
  };
}

export interface PromotionClassDecisions {
  runId: string;
  status: PromotionSummary["run"]["status"];
  class: {
    id: string;
    name: string;
    nextClass: { id: string; name: string } | null;
  };
  students: {
    enrollmentId: string;
    studentId: string;
    admissionNo: string;
    name: string;
    rollNo: number | null;
    section: { id: string; name: string };
    action: "PROMOTE" | "REPEAT" | "GRADUATE" | "HOLD";
    basis: string;
    toClass: { id: string; name: string } | null;
    toSection: { id: string; name: string } | null;
    note: string | null;
    applied: boolean;
    result: {
      status: "PASS" | "FAIL" | "INCOMPLETE" | null;
      percentage: number | null;
      classRank: number | null;
      sectionRank: number | null;
      version: number | null;
    } | null;
    stale: boolean;
  }[];
}
