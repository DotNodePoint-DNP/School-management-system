export const roles = [
  "teacher_staff",
  "school_admin",
  "accountant",
  "parent",
] as const;

export type Role = (typeof roles)[number];

export interface ApiUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

const apiRoleMap = new Map<string, Role>([
  ["ADMIN", "school_admin"],
  ["TEACHER", "teacher_staff"],
  ["ACCOUNTANT", "accountant"],
  ["PARENT", "parent"],
]);

export function currentUserFromApi(value: unknown): CurrentUser {
  if (!value || typeof value !== "object") {
    throw new Error("The API returned an invalid user.");
  }
  const user = value as Partial<ApiUser>;
  if (
    typeof user.id !== "string" ||
    typeof user.fullName !== "string" ||
    user.fullName.trim().length === 0 ||
    (user.email !== undefined &&
      user.email !== null &&
      typeof user.email !== "string") ||
    (user.phone !== undefined &&
      user.phone !== null &&
      typeof user.phone !== "string") ||
    typeof user.mustChangePassword !== "boolean" ||
    !Array.isArray(user.roles) ||
    !user.roles.every((role) => typeof role === "string") ||
    !Array.isArray(user.permissions) ||
    !user.permissions.every((permission) => typeof permission === "string")
  ) {
    throw new Error("The API returned an invalid user.");
  }

  const mappedRoles = [
    ...new Set(user.roles.map((role) => apiRoleMap.get(role))),
  ].filter((role): role is Role => role !== undefined);
  if (mappedRoles.length === 0) {
    throw new Error("This account does not have a supported workspace role.");
  }

  const role = (
    ["school_admin", "teacher_staff", "accountant", "parent"] as const
  ).find((candidate) => mappedRoles.includes(candidate));
  if (!role) {
    throw new Error("This account does not have a supported workspace role.");
  }

  return {
    id: user.id,
    fullName: user.fullName,
    displayName: user.fullName,
    email: user.email ?? null,
    phone: user.phone ?? null,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles,
    permissions: user.permissions,
    role,
  };
}

export const roleDetails: Record<
  Role,
  { label: string; description: string; icon: string; accent: string; identifier: string }
> = {
  teacher_staff: {
    label: "Teacher / Staff",
    description: "Manage classes, attendance, schedules, and student support.",
    icon: '<svg aria-hidden="true" class="h-[74px] w-[74px]" fill="none" viewBox="0 0 100 100"><path d="M50 18 20 31l30 13 30-13-30-13Z" fill="currentColor" opacity="0.2" /><path d="M30 36 50 27l20 9v18L50 63 30 54V36Z" stroke="currentColor" stroke-linejoin="round" stroke-width="4" /><path d="M22 42 50 54l28-12" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M50 46v18" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M35 47v12h30V47" stroke="currentColor" stroke-width="4" stroke-linejoin="round" /><path d="M24 60h52v8H24z" fill="currentColor" opacity="0.9" /></svg>',
    accent: "teal",
    identifier: "teacher or staff email",
  },
  school_admin: {
    label: "School Admin",
    description: "Oversee school operations, people, academics, and reporting.",
    icon: '<svg aria-hidden="true" class="h-[72px] w-[72px]" fill="none" viewBox="0 0 100 100"><path d="M50 18v15M23 38h54M30 26h40" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><rect x="24" y="38" width="52" height="34" rx="3" stroke="currentColor" stroke-width="4" /><path d="M32 46h36M32 54h28M32 62h22" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M68 44v18" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M60 52h16" stroke="currentColor" stroke-width="4" stroke-linecap="round" /></svg>',
    accent: "navy",
    identifier: "administrator email",
  },
  accountant: {
    label: "Accountant",
    description: "Manage fees, payments, invoices, and financial reporting.",
    icon: '<svg aria-hidden="true" class="h-[78px] w-[78px]" fill="none" viewBox="0 0 100 100"><path d="M26 68V38h8v30M46 68V26h8v42M66 68V48h8v20" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /><path d="M18 74h64" stroke="currentColor" stroke-width="4" stroke-linecap="round" /></svg>',
    accent: "amber",
    identifier: "accounting email",
  },
  parent: {
    label: "Parent",
    description: "Follow attendance, learning, messages, and school updates.",
    icon: '<svg aria-hidden="true" class="h-[76px] w-[76px]" fill="none" viewBox="0 0 100 100"><circle cx="35" cy="34" r="10" fill="currentColor" /><circle cx="65" cy="34" r="10" fill="currentColor" /><path d="M20 68c2-13 10-20 22-20s20 7 22 20" stroke="currentColor" stroke-width="5" stroke-linecap="round" /><path d="M27 68c3-9 9-14 19-14s16 5 19 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.7" /></svg>',
    accent: "coral",
    identifier: "parent email",
  },
};

export function isRole(value: string): value is Role {
  return roles.includes(value as Role);
}

export interface CurrentUser {
  id: string;
  fullName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  role: Role;
}