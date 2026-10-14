export const SYSTEM_ROLES = [
  'ADMIN',
  'TEACHER',
  'PARENT',
  'ACCOUNTANT',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

// format : "<modules>:<action>". Each new modules add its permissions here

export const PERMISSIONS = [
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'users:deactivate',
  'roles:read',
  'roles:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
