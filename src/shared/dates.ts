import { LIMITS } from './limits.js';

/**
 * Calendar maths on `YYYY-MM-DD` strings. Everything works in whole UTC days so
 * results never depend on the machine's time zone or daylight-saving rules.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for a strict ISO date, or `null` if it is not a real date. */
export function toDayNumber(iso: string): number | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms / MS_PER_DAY;
}

/** True for a real calendar date written as `YYYY-MM-DD`. */
export function isISODate(value: string): boolean {
  return toDayNumber(value) !== null;
}

/** The `YYYY-MM-DD` date for a count of days since 1970-01-01. */
export function fromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

function mustParse(iso: string): number {
  const dayNumber = toDayNumber(iso);
  if (dayNumber === null) throw new RangeError(`Invalid ISO date: ${iso}`);
  return dayNumber;
}

/** The date `days` after `iso` (before it when negative). */
export function addDays(iso: string, days: number): string {
  return fromDayNumber(mustParse(iso) + days);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  return mustParse(to) - mustParse(from);
}

/** The later of two dates. */
export function maxDate(a: string, b: string): string {
  return diffDays(a, b) > 0 ? b : a;
}

/** The user's local calendar date. On the server this is only used as a fallback. */
export function localToday(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today in UTC, which the server checks client dates against. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** `YYYYMMDD`, as used by iCalendar and Google Calendar links. */
export function compactDate(iso: string): string {
  mustParse(iso);
  return iso.replaceAll('-', '');
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Human-readable date, e.g. "Sat, 14 Nov 2026". */
export function formatDate(iso: string, locale = 'en-IN'): string {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(new Date(mustParse(iso) * MS_PER_DAY));
}

/** A run-sheet start time as whole minutes after midnight, within one day. */
export function clampStartMinute(minutes: number): number {
  return Math.min(Math.max(Math.round(minutes), 0), LIMITS.dayMinutesMax);
}

/** "18:30" from minutes after midnight. */
export function formatMinutes(minutes: number): string {
  const clamped = clampStartMinute(minutes);
  const hours = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mins = String(clamped % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}
