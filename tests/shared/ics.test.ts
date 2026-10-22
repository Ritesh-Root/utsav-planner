import { describe, expect, it } from 'vitest';

import { buildIcs, escapeIcsText, foldLine, icsTimestamp } from '../../src/shared/ics.js';
import { NOW, templatePlan, weddingBrief } from '../fixtures/plans.js';

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('ics', () => {
  it('escapes the characters RFC 5545 reserves', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('folds long lines at 75 octets', () => {
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => bytes(line) <= 75)).toBe(true);
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(
      `SUMMARY:${'x'.repeat(200)}`,
    );
  });

  it('never splits a multi-byte character (Devanagari, emoji)', () => {
    const text = `SUMMARY:${'उत्सव 🎉 '.repeat(20)}`;
    const lines = foldLine(text).split('\r\n');
    expect(lines.every((line) => bytes(line) <= 75)).toBe(true);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(text);
    expect(lines.join('')).not.toContain('�');
  });

  it('formats UTC timestamps', () => {
    expect(icsTimestamp(new Date('2026-10-22T06:30:05.123Z'))).toBe('20261022T063005Z');
  });

  it('exports the event, open tasks and booking deadlines with CRLF endings', () => {
    const plan = templatePlan(weddingBrief);
    const done = { ...plan, tasks: plan.tasks.map((t, i) => (i === 0 ? { ...t, done: true } : t)) };
    const ics = buildIcs(done, NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/);
    const events = ics.match(/BEGIN:VEVENT/g) ?? [];
    expect(events.length).toBe(1 + (plan.tasks.length - 1) + plan.vendors.length);
    // A 3-day wedding on 14 Feb ends (exclusive) on 17 Feb.
    expect(ics).toContain('DTSTART;VALUE=DATE:20270214\r\nDTEND;VALUE=DATE:20270217');
  });

  it('rolls all-day end dates over year ends and leap days, with stable UIDs', () => {
    const plan = templatePlan({ ...weddingBrief, date: '2028-02-28', days: 2 });
    const ics = buildIcs(plan, NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20280228\r\nDTEND;VALUE=DATE:20280301');
    expect(buildIcs(plan, NOW)).toBe(ics);
    expect(ics).toContain(`UID:event.${plan.id}@utsav-planner`);
  });

  it('leaves out booked and not-needed vendors', () => {
    const plan = templatePlan(weddingBrief);
    const vendors = plan.vendors.map((v, i) => ({
      ...v,
      status: i === 0 ? ('booked' as const) : i === 1 ? ('not-needed' as const) : v.status,
    }));
    const ics = buildIcs({ ...plan, vendors }, NOW);
    expect(ics).not.toContain(`vendor.${plan.vendors[0]?.id ?? ''}.`);
    expect(ics).not.toContain(`vendor.${plan.vendors[1]?.id ?? ''}.`);
  });
});
