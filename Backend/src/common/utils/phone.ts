import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';

/** Numbers typed without a country code (e.g. 0901...) are treated. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'NG';

/** * Converts a phone number to international format (E.164). *. */
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();

  // Digits-only input that already starts with the country code (no "+")
  const candidate = /^234\d{10}$/.test(trimmed.replace(/[\s-]/g, ''))
    ? `+${trimmed.replace(/[\s-]/g, '')}`
    : trimmed;

  const parsed = parsePhoneNumberFromString(candidate, DEFAULT_PHONE_COUNTRY);
  return parsed?.isValid() ? parsed.number : value;
}
