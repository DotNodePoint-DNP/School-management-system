import { BadRequestException } from '@nestjs/common';
import {
  BSDateFormatError,
  DateOutOfRangeError,
  InvalidBSDateError,
  adToBs,
  bsToAd,
  formatBsDate,
  parseBsDate,
} from 'bikram-sambat-ts';

// The library documents less-certain calendar data from BS 2085 onward (and 1979-1999).
// Raise MAX_SUPPORTED_BS_YEAR only after checking those years against the official calendar.
export const MIN_SUPPORTED_BS_YEAR = 2000;
export const MAX_SUPPORTED_BS_YEAR = 2084;

const MIN_AD_YEAR = 1950;
const MAX_AD_YEAR = 2100;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Validates a YYYY-MM-DD calendar date and returns it as UTC midnight. */
export function parseIsoDate(value: string, field: string): Date {
  const match = ISO_DATE.exec(value);
  if (match) {
    const [year, month, day] = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    ] as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day &&
      year >= MIN_AD_YEAR &&
      year <= MAX_AD_YEAR
    ) {
      return date;
    }
  }
  throw new BadRequestException(
    `${field} must be a real date in YYYY-MM-DD format (years ${MIN_AD_YEAR}-${MAX_AD_YEAR})`,
  );
}

/** For ISO strings that were already validated. */
export const isoToDate = (iso: string): Date =>
  new Date(`${iso}T00:00:00.000Z`);

/** Prisma returns @db.Date values at UTC midnight, so this is timezone-safe. */
export const toIsoDate = (date: Date): string =>
  date.toISOString().slice(0, 10);

/** AD (YYYY-MM-DD) to BS (YYYY-MM-DD), or null when outside the supported range. */
export function adToBsString(iso: string): string | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  try {
    // A local-calendar Date built from components: the library reads local fields, so no timezone shift.
    const bs = adToBs(
      new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    if (bs.year < MIN_SUPPORTED_BS_YEAR || bs.year > MAX_SUPPORTED_BS_YEAR)
      return null;
    return formatBsDate(bs);
  } catch (error) {
    if (error instanceof DateOutOfRangeError) return null;
    throw error;
  }
}

/** BS (YYYY-MM-DD) to AD (YYYY-MM-DD). Throws 400 for anything invalid or unsupported. */
export function bsToIso(value: string, field: string): string {
  try {
    const bs = parseBsDate(value);
    if (bs.year < MIN_SUPPORTED_BS_YEAR || bs.year > MAX_SUPPORTED_BS_YEAR) {
      throw new BadRequestException(
        `${field}: only BS years ${MIN_SUPPORTED_BS_YEAR}-${MAX_SUPPORTED_BS_YEAR} are supported`,
      );
    }
    const ad = bsToAd(bs);
    return `${ad.getFullYear()}-${pad(ad.getMonth() + 1)}-${pad(ad.getDate())}`;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    if (
      error instanceof BSDateFormatError ||
      error instanceof InvalidBSDateError ||
      error instanceof DateOutOfRangeError
    ) {
      throw new BadRequestException(
        `${field} is not a valid Bikram Sambat date (YYYY-MM-DD): ${error.message}`,
      );
    }
    throw error;
  }
}

export function dateParts(date: Date): { ad: string; bs: string | null } {
  const ad = toIsoDate(date);
  return { ad, bs: adToBsString(ad) };
}

/** One date from either `<label>` (AD) or `<label>Bs` (BS). Returns AD, or undefined if neither was sent. */
export function resolveDate(
  label: string,
  ad?: string,
  bs?: string,
): string | undefined {
  if (ad !== undefined && bs !== undefined) {
    throw new BadRequestException(
      `Send either ${label} (AD) or ${label}Bs (BS), not both`,
    );
  }
  if (ad !== undefined) {
    parseIsoDate(ad, label);
    return ad;
  }
  if (bs !== undefined) return bsToIso(bs, `${label}Bs`);
  return undefined;
}

export function requireDate(label: string, ad?: string, bs?: string): string {
  const value = resolveDate(label, ad, bs);
  if (value === undefined)
    throw new BadRequestException(
      `${label} (AD) or ${label}Bs (BS) is required`,
    );
  return value;
}
