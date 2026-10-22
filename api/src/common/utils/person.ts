export const displayName = (p: {
  firstName: string;
  middleName?: string | null;
  lastName: string | null;
}): string => [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
