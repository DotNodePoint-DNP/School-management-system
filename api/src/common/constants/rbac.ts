export const SYSTEM_ROLES = [
  'ADMIN',
  'TEACHER',
  'PARENT',
  'ACCOUNTANT',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ADMIN_ROLE: SystemRole = 'ADMIN';
export const PARENT_ROLE: SystemRole = 'PARENT';

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
  'academic-years:read',
  'academic-years:manage',
  'academic-years:adjust-dates',
  'classes:read',
  'classes:manage',
  'subjects:read',
  'subjects:manage',
  'staff:read',
  'staff:manage',
  'staff:create-login',
  'teaching:read',
  'teaching:assign',

  'students:read',
  'students:read-all',
  'students:create',
  'students:update',
  'students:delete',
  'students:set-admission-no',
  'guardians:read',
  'guardians:manage',
  'guardians:create-login',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
