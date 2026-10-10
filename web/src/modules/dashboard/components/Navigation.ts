// src/modules/dashboard/navigation.ts
import type { Role } from "@/core/authorization/roles";

/**
 * Icons are referenced by name (not by component) so this config stays
 * serializable and can be passed from Server Components to Client Components.
 */
export type IconName = "users" | "book" | "wallet" | "settings" | "userCog"|"calandarFold" |"UserShield";

export type NavSection = {
  slug: string;
  label: string;
  icon?: IconName;
};

export type NavModule = {
  slug: string;
  label: string;
  icon: IconName;
  /** Roles that can see this module. */
  roles: Role[];
  sections: NavSection[];
};

export const NAV_MODULES: NavModule[] = [
    {
    slug: "settings",
    label: "Settings & School Setup",
    icon: "settings",
    roles: ["school_admin"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "user-management", label: "User Management", icon: "book" },
      {slug: "class-section-setup",label: "Class & Section" , icon:"calandarFold"},
      {slug: "grading-scale", label:"Grading Scale", icon:"book"},
      {slug: "fee-structure", label: "Fee Structure", icon: "wallet" },
      {slug:"document-template", label: "Document & Notification", icon: "book"},
    ],
  },
  
  {
    slug: "student-info",
    label: "School information (SIS)",
    icon: "users",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "student-directory", label: "Student directory" },
      { slug: "teacher-directory", label: "Teacher directory" },
      { slug: "parent-directory", label: "Parent directory" },
      { slug: "attendance", label: "Attendance" },
      { slug: "health-records", label: "Health records" },
    ],
  },
  {
    slug: "Admission-Enrollment",
    label: "Admission & Enrollment",
    icon: "users",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      {slug:"overview", label: "Overview", icon: "UserShield"},
      { slug: "admission-form", label: "Admission form", icon: "UserShield" },
      
    ],
  },
  {
    slug: "academic",
    label: "Academic",
    icon: "book",
    roles: ["school_admin", "teacher_staff", "parent"],
    sections: [
      { slug: "classes", label: "Classes" },
      { slug: "timetable", label: "Timetable" },
      { slug: "assignments", label: "Assignments" },
      { slug: "exams-results", label: "Exams & results" },
    ],
  },
  {
    slug: "payroll",
    label: "HR & Payroll",
    icon: "wallet",
    roles: ["school_admin", "accountant"],
    sections: [
      { slug: "staff-salaries", label: "Staff salaries" },
      { slug: "payslips", label: "Payslips" },
      { slug: "deductions", label: "Deductions" },
      { slug: "payroll-reports", label: "Reports" },
    ],
  },

   {
    slug: "Accounting",
    label: "Accounting",
    icon: "wallet",
    roles: ["school_admin", "accountant"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
   {
    slug: "Attendance ",
    label: "Attendance Management",
    icon: "calandarFold",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
   {
    slug: "Examination-Gradebook",
    label: "Examination & Gradebook",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "exam-setup", label: "Exam/Term setup", icon: "userCog" },
      { slug: "exam-schedule", label: "Exam schedule", icon: "calandarFold" },
      { slug: "marks-entry", label: "Marks entry", icon: "UserShield" },
      { slug: "marks-locking", label: "Result processing/locking", icon: "book" },
      { slug: "report-card", label: "Report Card / Marksheet", icon: "book" },
      { slug: "grade-book", label: "Gradebook/analytics", icon: "book"},
      { slug: "results", label: "Results publish", icon: "book"},
    ],
  },
   {
    slug: "Fee Management   ",
    label: "Fee Management",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
   {
    slug: "ID Card Studio ",
    label: "ID Card Studio",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
  {
    slug: "Library ",
    label: "Library Management",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
  {
    slug: "Transport ",
    label: "Transport Management",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
   
  {
    slug: "Reports & Analytics  ",
    label: "Reports & Analytics",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
   {
    slug: "communication-notice  ",
    label: "Communication & notice",
    icon: "book",
    roles: ["school_admin", "teacher_staff"],
    sections: [
      { slug: "school-profile", label: "School profile", icon: "userCog" },
      { slug: "academic-year", label: "Academic year", icon: "calandarFold" },
      { slug: "roles-permissions", label: "Roles & permissions", icon: "UserShield" },
      { slug: "integrations", label: "Integrations", icon: "book" },
    ],
  },
];

export const DASHBOARD_HREF = "/dashboard";

export const moduleHref = (m: NavModule) => `${DASHBOARD_HREF}/${m.slug}`;

export const sectionHref = (m: NavModule, s: NavSection) =>
  `${DASHBOARD_HREF}/${m.slug}/${s.slug}`;

export function modulesForRole(role: Role): NavModule[] {
  return NAV_MODULES.filter((m) => m.roles.includes(role));
}

export function findModule(role: Role, slug: string): NavModule | undefined {
  return modulesForRole(role).find((m) => m.slug === slug);
}