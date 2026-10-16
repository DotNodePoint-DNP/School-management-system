export type LoginIdentifier = { email: string } | { phone: string };

// Assumption: a bare 10-digit number is a Nepal mobile number (+977).
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (/^\d{10}$/.test(cleaned)) return `+977${cleaned}`;
  if (/^977\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  return null;
}

export function parseIdentifier(raw: string): LoginIdentifier | null {
  const value = raw.trim();
  if (value.includes('@')) return { email: value.toLowerCase() };
  const phone = normalizePhone(value);
  return phone ? { phone } : null;
}
