import { addDays, compactDate } from './dates.js';
import type { Plan } from './schemas.js';

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

/** RFC 5545 §3.3.11 text escaping. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line so no physical line exceeds 75 octets (RFC 5545 §3.1).
 * Breaks only between code points, so multi-byte text such as Devanagari or
 * emoji is never split.
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = out.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

/** `YYYYMMDDTHHMMSSZ` in UTC. */
export function icsTimestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function allDayEvent(options: {
  uid: string;
  stamp: string;
  date: string;
  days: number;
  summary: string;
  description?: string;
  location?: string;
}): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${options.uid}`,
    `DTSTAMP:${options.stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(options.date)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(options.date, options.days))}`,
    `SUMMARY:${escapeIcsText(options.summary)}`,
  ];
  if (options.description) lines.push(`DESCRIPTION:${escapeIcsText(options.description)}`);
  if (options.location) lines.push(`LOCATION:${escapeIcsText(options.location)}`);
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  return lines;
}

/** Calendar file with the event, every open task and every booking deadline. */
export function buildIcs(plan: Plan, now: Date): string {
  const stamp = icsTimestamp(now);
  const domain = 'utsav-planner';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Utsav Planner//Event plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(plan.brief.title)}`,
    ...allDayEvent({
      uid: `event.${plan.id}@${domain}`,
      stamp,
      date: plan.brief.date,
      days: plan.brief.days,
      summary: plan.brief.title,
      description: plan.summary,
      location: plan.brief.location,
    }),
  ];
  for (const task of plan.tasks) {
    if (task.done) continue;
    lines.push(
      ...allDayEvent({
        uid: `task.${task.id}.${plan.id}@${domain}`,
        stamp,
        date: task.due,
        days: 1,
        summary: `${plan.brief.title}: ${task.title}`,
        description: task.details,
      }),
    );
  }
  for (const vendor of plan.vendors) {
    if (vendor.status === 'booked' || vendor.status === 'not-needed') continue;
    lines.push(
      ...allDayEvent({
        uid: `vendor.${vendor.id}.${plan.id}@${domain}`,
        stamp,
        date: vendor.bookBy,
        days: 1,
        summary: `${plan.brief.title}: book ${vendor.category}`,
        description: vendor.why,
      }),
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
