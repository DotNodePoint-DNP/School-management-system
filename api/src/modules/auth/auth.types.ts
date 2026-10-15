import type { Request } from 'express';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: string;
}

export interface RequestMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
