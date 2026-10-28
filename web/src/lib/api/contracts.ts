import type { CurrentUser } from "@/core/authorization/roles";
import type { ApiUser } from "@/core/authorization/roles";

export type ApiErrorPayload = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};

export type AuthLoginRequest = {
  identifier: string;
  password: string;
};

export type AuthLoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: CurrentUser;
};

export type BackendAuthSession = {
  accessToken: string;
  expiresIn: number;
  user: ApiUser;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
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
