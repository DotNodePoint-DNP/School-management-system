export const SYSTEM_ROLES = [
  'ADMIN',
  'TEACHER',
  'PARENT',
  'ACCOUNTANT',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ADMIN_ROLE: SystemRole = 'ADMIN';

// format : "<modules>:<action>". Each new modules add its permissions here

export const PERMISSIONS = [
  'users:read',
  'users:create',
  'users:update',
  'users:assign-roles',
  'users:reset-password',
  'users:delete',
  'users:deactivate',
  'roles:read',
  'roles:manage',
  'audit-logs:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
