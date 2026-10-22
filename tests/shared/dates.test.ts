import { describe, expect, it } from 'vitest';

import {
  addDays,
  compactDate,
  diffDays,
  formatDate,
  formatMinutes,
  fromDayNumber,
  isISODate,
  localToday,
  maxDate,
  toDayNumber,
  utcToday,
} from '../../src/shared/dates.js';

describe('dates', () => {
  it('accepts real dates and rejects impossible or malformed ones', () => {
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2027-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-01')).toBe(false);
    expect(isISODate('2026-10-22T00:00')).toBe(false);
    expect(toDayNumber('1970-01-02')).toBe(1);
  });

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(fromDayNumber(0)).toBe('1970-01-01');
  });

  it('counts whole days in either direction', () => {
    expect(diffDays('2026-10-22', '2026-11-21')).toBe(30);
    expect(diffDays('2026-11-21', '2026-10-22')).toBe(-30);
    expect(maxDate('2026-10-22', '2026-10-23')).toBe('2026-10-23');
    expect(maxDate('2026-10-24', '2026-10-23')).toBe('2026-10-24');
  });

  it('throws on invalid input instead of producing nonsense', () => {
    expect(() => addDays('not-a-date', 1)).toThrow(RangeError);
    expect(() => compactDate('2026-02-30')).toThrow(RangeError);
  });

  it('reads the local calendar day and the UTC day separately', () => {
    // 20:00 UTC is already the next day in India (UTC+5:30).
    const late = new Date('2026-10-22T20:00:00.000Z');
    expect(utcToday(late)).toBe('2026-10-22');
    expect(localToday(new Date(2026, 9, 23, 1, 30))).toBe('2026-10-23');
  });

  it('formats dates and times for people', () => {
    expect(compactDate('2026-11-08')).toBe('20261108');
    expect(formatDate('2026-11-08')).toMatch(/8 Nov,? 2026/);
    expect(formatMinutes(18 * 60 + 30)).toBe('18:30');
    expect(formatMinutes(-5)).toBe('00:00');
    expect(formatMinutes(5000)).toBe('23:59');
  });
});
