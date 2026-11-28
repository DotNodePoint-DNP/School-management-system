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
  href?: string;
  hasDetail?: boolean;
  icon?: IconName;
  permissions: readonly string[];
};
export type NavModule = {
  slug: string;
  label: string;
  icon: IconName;
  sections: NavSection[];
};
const NAV_MODULES: NavModule[] = [
  {
    slug: "Admission-Enrollment",
    label: "Students & Guardians",
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
        slug: "student-directory",
        label: "Student directory",
        href: "/dashboard/student-info/student-directory",
        hasDetail: true,
        permissions: ["students:read", "students:read-all"],
      },
      {
        slug: "parent-directory",
        label: "Guardian directory",
        href: "/dashboard/student-info/parent-directory",
        hasDetail: true,
        permissions: ["guardians:read"],
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
      {
        slug: "attendance",
        label: "Staff attendance & leave",
        permissions: ["staff-attendance:self", "staff-attendance:review"],
      },
      {
        slug: "payroll",
        label: "Payroll",
        permissions: ["payroll:read"],
      },
      {
        slug: "teacher-directory",
        label: "Teacher directory",
        href: "/dashboard/student-info/teacher-directory",
        hasDetail: true,
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
        slug: "academic-year",
        label: "Academic years",
        href: "/dashboard/settings/academic-year",
        permissions: ["academic-years:read"],
      },
      {
        slug: "class-section-setup",
        label: "Classes & sections",
        href: "/dashboard/settings/class-section-setup",
        permissions: ["classes:read"],
      },
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
    label: "Exams & Results",
    icon: "book",
    sections: [
      { slug: "exam-setup", label: "Exam setup", permissions: ["exams:read"] },
      {
        slug: "grading-scale",
        label: "Grading scale",
        href: "/dashboard/settings/grading-scale",
        permissions: ["exams:read"],
      },
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
    slug: "documents",
    label: "Documents",
    icon: "book",
    sections: [
      { slug: "create", label: "Create document", permissions: ["documents:issue"] },
      { slug: "register", label: "Issued register", permissions: ["documents:issue"] },
    ],
  },
  {
    slug: "finance",
    label: "Finance",
    icon: "wallet",
    sections: financeSections,
  },
  {
    slug: "family",
    label: "Family Portal",
    icon: "users",
    sections: [
      { slug: "children", label: "Children", permissions: ["portal:access"] },
      { slug: "balance", label: "Family balance", permissions: ["portal:access"] },
      { slug: "account", label: "Account", permissions: ["portal:access"] },
    ],
  },
  {
    slug: "settings",
    label: "Administration",
    icon: "settings",
    sections: [
      {
        slug: "school-profile",
        label: "School profile",
        permissions: ["school:manage"],
      },
      {
        slug: "website",
        label: "Website CMS",
        href: "/dashboard/website",
        permissions: ["school:manage"],
      },
      {
        slug: "signatories",
        label: "Signatories & letterhead",
        permissions: ["school:manage-signatories"],
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
        slug: "document-template",
        label: "Document & notification templates",
        permissions: ["school:manage", "documents:design", "documents:publish"],
      },
    ],
  },
];

export const DASHBOARD_HREF = "/dashboard";
export const moduleHref = (m: NavModule) => `${DASHBOARD_HREF}/${m.slug}`;
export const sectionHref = (m: NavModule, s: NavSection) =>
  s.href ?? `${moduleHref(m)}/${s.slug}`;

const aliases = new Map([
  ["/dashboard/settings/fee-structure", "/dashboard/finance/fee-heads"],
  ["/dashboard/student-info/admissions", "/dashboard/Admission-Enrollment/overview"],
  ["/dashboard/Admission-Enrollment/students", "/dashboard/student-info/student-directory"],
  ["/dashboard/Examination-Gradebook/grade-book", "/dashboard/Examination-Gradebook/results"],
]);

export function matchDashboardPath(modules: NavModule[], pathname: string) {
  const path = pathname.replace(/\/+$/, "");
  const target = aliases.get(path) ?? path;
  for (const module of modules) {
    if (moduleHref(module) === path) return { module };
    for (const section of module.sections) {
      const href = sectionHref(module, section);
      if (target === href) return { module, section };
      if (section.hasDetail && path.startsWith(href + "/") &&
          !path.slice(href.length + 1).includes("/")) return { module, section };
    }
  }
  // Retired directory root and bookmarks to a module whose sections moved.
  if (path === "/dashboard/student-info" || path === "/dashboard/settings") {
    for (const module of modules) {
      const section = module.sections.find(s => sectionHref(module, s).startsWith(path + "/"));
      if (section) return { module, section };
    }
  }
}

export function modulesForPermissions(
  permissions: readonly string[],
): NavModule[] {
  const allowed = (codes: readonly string[]) =>
    codes.some((code) => permissions.includes(code));
  return NAV_MODULES.flatMap((module) => {
    const sections = module.sections.filter((section) =>
      allowed(section.permissions),
    );
    return sections.length ? [{ ...module, sections }] : [];
  });
}
export function findModule(permissions: readonly string[], slug: string) {
  return modulesForPermissions(permissions).find(
    (module) => module.slug === slug,
  );
}
