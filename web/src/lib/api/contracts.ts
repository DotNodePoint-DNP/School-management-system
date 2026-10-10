import type { CurrentUser, Role } from "@/core/authorization/roles";

export type ApiErrorPayload = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};

export type AuthLoginRequest = {
  identifier: string;
  password: string;
  role: Role;
};

export type AuthLoginResponse = {
  user: CurrentUser;
  session?: { expiresAt: string };
};

export type PasswordRecoveryRequest = {
  identifier: string;
  role: Role;
};

export type PasswordRecoveryResponse = {
  accepted: boolean;
};

export type PasswordResetRequest = {
  token: string;
  password: string;
  role: Role;
};

export type PasswordResetResponse = {
  completed: boolean;
};

export type CurrentSessionResponse = {
  user: CurrentUser;
  expiresAt: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export interface StudentSummary {
  id: string;
  name: string;
  grade: string;
  status: "active" | "inactive";
}
export interface AttendanceSummary {
  present: number;
  late: number;
  absent: number;
  recordedAt: string;
}
export interface DashboardSummary {
  students: number;
  attendance: AttendanceSummary;
  feeCollection: number;
  openTasks: number;
}
