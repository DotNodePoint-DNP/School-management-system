import { financeSections } from "@/modules/finance/sections";

export type IconName =
  | "users"
  | "book"
  | "wallet"
  | "settings"
  | "userCog"
  | "calandarFold"
  | "UserShield";
export type NavSection = {
  slug: string;
  label: string;
  icon?: IconName;
  permissions: readonly string[];
};
export type NavModule = {
  slug: string;
  label: string;
  icon: IconName;
  sections: NavSection[];
  permissions?: readonly string[];
};
const NAV_MODULES: NavModule[] = [
  {
    slug: "family",
    label: "Family portal",
    icon: "users",
    permissions: ["portal:access"],
    sections: [],
  },
  {
    slug: "settings",
    label: "Settings & School Setup",
    icon: "settings",
    sections: [
      {
        slug: "school-profile",
        label: "School profile",
        permissions: ["school:manage"],
      },
      {
        slug: "signatories",
        label: "Signatories & letterhead",
        permissions: ["school:manage-signatories"],
      },
      {
        slug: "academic-year",
        label: "Academic year",
        permissions: ["academic-years:read"],
      },
      {
        slug: "roles-permissions",
        label: "Roles & permissions",
        permissions: ["roles:read"],
      },
      {
        slug: "user-management",
        label: "User management",
        permissions: ["users:read", "users:create"],
      },
      {
        slug: "audit-log",
        label: "Audit log",
        permissions: ["audit-logs:read"],
      },
      {
        slug: "class-section-setup",
        label: "Classes & sections",
        permissions: ["classes:read"],
      },
      {
        slug: "grading-scale",
        label: "Grading scale",
        permissions: ["exams:read"],
      },
      {
        slug: "document-template",
        label: "Document & notification templates",
        permissions: ["school:manage"],
      },
    ],
  },
  {
    slug: "student-info",
    label: "School information",
    icon: "users",
    sections: [
      {
        slug: "student-directory",
        label: "Student directory",
        permissions: ["students:read", "students:read-all"],
      },
      {
        slug: "teacher-directory",
        label: "Teacher directory",
        permissions: ["staff:read", "staff:manage"],
      },
      {
        slug: "parent-directory",
        label: "Parent directory",
        permissions: ["guardians:read"],
      },
    ],
  },
  {
    slug: "Admission-Enrollment",
    label: "Admission & enrollment",
    icon: "users",
    sections: [
      {
        slug: "overview",
        label: "Overview",
        permissions: [
          "students:read",
          "students:read-all",
          "students:create",
          "enrollments:read",
          "enrollments:manage",
        ],
      },
      {
        slug: "admission-form",
        label: "Student admission",
        permissions: ["students:create"],
      },
      {
        slug: "enrollment",
        label: "Enrollment & rosters",
        permissions: [
          "enrollments:manage",
          "enrollments:read",
          "students:read",
          "students:read-all",
        ],
      },
      {
        slug: "students",
        label: "Student register",
        permissions: ["students:read", "students:read-all"],
      },
    ],
  },
  {
    slug: "staff",
    label: "Staff",
    icon: "users",
    sections: [
      {
        slug: "directory",
        label: "Staff directory",
        permissions: ["staff:read", "staff:manage"],
      },
    ],
  },
  {
    slug: "academics",
    label: "Academics",
    icon: "book",
    sections: [
      {
        slug: "subjects",
        label: "Subjects & curriculum",
        permissions: ["subjects:read"],
      },
      {
        slug: "teaching",
        label: "Teaching assignments",
        permissions: ["teaching:read"],
      },
      {
        slug: "promotion",
        label: "Promotion",
        permissions: ["promotion:read", "promotion:manage", "promotion:apply"],
      },
    ],
  },
  {
    slug: "attendance",
    label: "Attendance",
    icon: "calandarFold",
    sections: [
      {
        slug: "daily-attendance",
        label: "Daily attendance",
        permissions: [
          "attendance:read",
          "attendance:read-all",
          "attendance:mark",
          "attendance:mark-any",
          "attendance:correct",
        ],
      },
      {
        slug: "reports",
        label: "Attendance reports",
        permissions: [
          "attendance:read",
          "attendance:read-all",
          "attendance:mark-any",
          "attendance:correct",
        ],
      },
      {
        slug: "pending",
        label: "Pending sections",
        permissions: [
          "attendance:read-all",
          "attendance:mark-any",
          "attendance:correct",
        ],
      },
      {
        slug: "corrections",
        label: "Correction history",
        permissions: ["attendance:read-all", "attendance:correct"],
      },
      {
        slug: "calendar",
        label: "School calendar",
        permissions: [
          "attendance:read",
          "attendance:read-all",
          "attendance:mark-any",
          "attendance:correct",
          "attendance:calendar-manage",
        ],
      },
    ],
  },
  {
    slug: "Examination-Gradebook",
    label: "Examination & gradebook",
    icon: "book",
    sections: [
      { slug: "exam-setup", label: "Exam setup", permissions: ["exams:read"] },
      {
        slug: "exam-schedule",
        label: "Exam schedule",
        permissions: ["exams:read"],
      },
      {
        slug: "marks-entry",
        label: "Marks entry",
        permissions: [
          "marks:read",
          "marks:read-all",
          "marks:enter",
          "marks:enter-any",
          "marks:correct",
        ],
      },
      {
        slug: "marks-locking",
        label: "Exam workflow",
        permissions: ["marks:read-all", "exams:lock", "exams:publish"],
      },
      {
        slug: "report-card",
        label: "Report cards",
        permissions: ["reportcards:print", "reportcards:print-signed"],
      },
      {
        slug: "results",
        label: "Results",
        permissions: [
          "results:preview",
          "results:read",
          "results:read-all",
          "exams:manage",
        ],
      },
      {
        slug: "releases",
        label: "Parent result releases",
        permissions: ["exams:release"],
      },
    ],
  },
  {
    slug: "finance",
    label: "Finance",
    icon: "wallet",
    sections: financeSections,
  },
];

export const DASHBOARD_HREF = "/dashboard";
export const moduleHref = (m: NavModule) => `${DASHBOARD_HREF}/${m.slug}`;
export const sectionHref = (m: NavModule, s: NavSection) =>
  `${moduleHref(m)}/${s.slug}`;

export function modulesForPermissions(
  permissions: readonly string[],
): NavModule[] {
  const allowed = (codes: readonly string[]) =>
    codes.some((code) => permissions.includes(code));
  return NAV_MODULES.flatMap((module) => {
    const sections = module.sections.filter((section) =>
      allowed(section.permissions),
    );
    return sections.length ||
      (module.permissions && allowed(module.permissions))
      ? [{ ...module, sections }]
      : [];
  });
}
export function findModule(permissions: readonly string[], slug: string) {
  return modulesForPermissions(permissions).find(
    (module) => module.slug === slug,
  );
}
