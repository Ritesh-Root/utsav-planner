import { addDays, compactDate } from './dates.js';

/** A "create event" link for Google Calendar (all-day). No API key needed. */
export function googleCalendarUrl(input: {
  title: string;
  date: string;
  days?: number;
  details?: string;
  location?: string;
}): string {
  const end = addDays(input.date, Math.max(input.days ?? 1, 1));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${compactDate(input.date)}/${compactDate(end)}`,
  });
  if (input.details) params.set('details', input.details);
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * A Google Maps search for a vendor type near the event. The app never names
 * businesses itself; this lets people find and judge real ones.
 */
export function googleMapsSearchUrl(category: string, location: string): string {
  const params = new URLSearchParams({ api: '1', query: `${category} near ${location}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
