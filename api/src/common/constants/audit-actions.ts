// Each new module adds its actions here, so action names can't be mistyped.
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.password_changed',
  'auth.refresh_reuse_detected',
  'user.created',
  'user.updated',
  'user.roles_changed',
  'user.deactivated',
  'user.activated',
  'user.password_reset',
  'role.created',
  'role.updated',
  'role.permissions_changed',
  'role.deleted',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];