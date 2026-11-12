// Israeli mobile numbers. Canonical form: 05XXXXXXXX (10 digits).

const MOBILE_RE = /^05\d{8}$/;

// Accepts 054-111-2233, 054 1112233, +972 54-111-2233, 972541112233, and 541112233 (Sheets drops the leading 0)
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
  return MOBILE_RE.test(digits) ? digits : null;
}

/** 054-111-2233 */
export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}` : phone;
}
