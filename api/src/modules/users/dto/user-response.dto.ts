import type { Prisma } from '../../../generated/prisma/client.js';

export const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface UserResponse {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: { id: string; name: string }[];
}

export function toUserResponse(row: UserRow): UserResponse {
  return { ...row, roles: row.roles.map((r) => r.role) };
}
