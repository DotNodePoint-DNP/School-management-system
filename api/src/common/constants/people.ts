export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type GenderValue = (typeof GENDERS)[number];
export const STAFF_KINDS = ['TEACHING', 'NON_TEACHING'] as const;
export type StaffKindValue = (typeof STAFF_KINDS)[number];
export const STAFF_STATUSES = ['ACTIVE', 'LEFT'] as const;
