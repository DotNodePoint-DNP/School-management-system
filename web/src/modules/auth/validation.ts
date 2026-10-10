export type IdentifierKind = "email" | "phone";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[1-9][\d\s().-]{6,18}$/;

export function normalizeIdentifier(value: string) {
  return value.trim();
}

export function getIdentifierKind(value: string): IdentifierKind | null {
  const identifier = normalizeIdentifier(value);
  if (emailPattern.test(identifier)) return "email";
  if (phonePattern.test(identifier)) return "phone";
  return null;
}

export function validateIdentifier(value: string) {
  if (!normalizeIdentifier(value)) {
    return "Enter your email address or phone number.";
  }
  if (!getIdentifierKind(value)) {
    return "Enter a valid email address or phone number.";
  }
  return null;
}

export function validateLoginPassword(value: string) {
  if (!value) return "Enter your password.";
  if (value.length < 8) return "Your password must be at least 8 characters.";
  return null;
}

export function validateNewPassword(value: string) {
  if (!value) return "Enter a new password.";
  if (value.length < 8) return "Your new password must be at least 8 characters.";
  return null;
}
