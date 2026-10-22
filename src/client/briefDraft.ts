import { addDays } from '../shared/dates.js';
import { LIMITS } from '../shared/limits.js';
import type { Currency } from '../shared/money.js';
import { parseWholeNumber } from '../shared/money.js';
import type { Brief, Dietary, EventType, Priority, VenuePreference } from '../shared/schemas.js';
import { BriefSchema } from '../shared/schemas.js';
import { eventDateIssue } from '../shared/timeline.js';

/** The form keeps raw strings so people can type freely; `toBrief` turns them into a Brief. */
export interface BriefDraft {
  type: EventType;
  title: string;
  date: string;
  location: string;
  guests: string;
  budget: string;
  currency: Currency;
  venue: VenuePreference;
  style: string;
  priorities: Priority[];
  dietary: Dietary[];
  days: string;
  honoreeAge: string;
  notes: string;
}

export type BriefField = keyof BriefDraft;
export type FieldErrors = Partial<Record<BriefField, string>>;

/** Field order for the error summary, matching the order on screen. */
export const FIELD_ORDER: BriefField[] = [
  'type',
  'title',
  'date',
  'location',
  'guests',
  'budget',
  'currency',
  'venue',
  'days',
  'honoreeAge',
  'style',
  'priorities',
  'dietary',
  'notes',
];

export const FIELD_LABELS: Record<BriefField, string> = {
  type: 'Type of event',
  title: 'Event name',
  date: 'Date',
  location: 'City or area',
  guests: 'Number of guests',
  budget: 'Total budget',
  currency: 'Currency',
  venue: 'Venue',
  style: 'Theme or style',
  priorities: 'What matters most',
  dietary: 'Dietary needs',
  days: 'Number of days',
  honoreeAge: 'Age they are turning',
  notes: 'Anything else',
};

/** A blank form for a new event, dated a month from today. */
export function emptyDraft(today: string): BriefDraft {
  return {
    type: 'birthday',
    title: '',
    date: addDays(today, 30),
    location: '',
    guests: '',
    budget: '',
    currency: 'INR',
    venue: 'either',
    style: '',
    priorities: [],
    dietary: [],
    days: '1',
    honoreeAge: '',
    notes: '',
  };
}

/** The form state for an existing brief (a sample, or a plan being edited). */
export function draftFromBrief(brief: Brief): BriefDraft {
  return {
    ...brief,
    guests: String(brief.guests),
    budget: String(brief.budget),
    days: String(brief.days),
    honoreeAge: brief.honoreeAge === null ? '' : String(brief.honoreeAge),
  };
}

const MESSAGES: Partial<Record<BriefField, string>> = {
  title: 'Give the event a name.',
  location: 'Add the city or area.',
  guests: `Enter a whole number of guests from ${LIMITS.guestsMin} to ${LIMITS.guestsMax}.`,
  budget: 'Enter the total budget as a whole number above zero.',
  date: 'Enter a real date.',
  days: `Enter a number of days from 1 to ${LIMITS.weddingDaysMax}.`,
  honoreeAge: `Enter an age from 0 to ${LIMITS.honoreeAgeMax}, or leave it blank.`,
  notes: `Keep this under ${LIMITS.notesMax} characters.`,
  style: `Keep this under ${LIMITS.styleMax} characters.`,
  priorities: `Choose up to ${LIMITS.prioritiesMax}.`,
};

const DATE_MESSAGES = {
  past: 'Choose today or a date in the future.',
  'too-far': 'Choose a date within the next three years.',
} as const;

/** The draft's raw strings as the values a Brief holds; numbers that don't parse become null. */
function candidate(draft: BriefDraft) {
  const birthday = draft.type === 'birthday';
  const age = draft.honoreeAge.trim();
  return {
    ...draft,
    guests: parseWholeNumber(draft.guests),
    budget: parseWholeNumber(draft.budget),
    days: birthday ? 1 : parseWholeNumber(draft.days),
    honoreeAge: birthday && age !== '' ? parseWholeNumber(age) : null,
  };
}

/** The first problem with each field, in words a person can act on. */
function issueErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0] as BriefField;
    errors[field] ??= MESSAGES[field] ?? issue.message;
  }
  return errors;
}

/** Validate the form: a Brief, or a plain-language message for each field to fix. */
export function toBrief(
  draft: BriefDraft,
  today: string,
): { brief: Brief; errors: null } | { brief: null; errors: FieldErrors } {
  const parsed = BriefSchema.safeParse(candidate(draft));
  const errors = parsed.success ? {} : issueErrors(parsed.error.issues);
  // An age that was typed but is not a number becomes null, which the schema allows.
  const age = draft.honoreeAge.trim();
  if (draft.type === 'birthday' && age !== '' && parseWholeNumber(age) === null) {
    errors.honoreeAge = MESSAGES.honoreeAge;
  }
  const dateIssue = errors.date ? null : eventDateIssue(draft.date, today);
  if (dateIssue) errors.date = DATE_MESSAGES[dateIssue];
  if (!parsed.success || Object.keys(errors).length > 0) return { brief: null, errors };
  return { brief: parsed.data, errors: null };
}

/** Map server-side validation paths (`brief.guests`) back onto form fields. */
export function errorsFromServer(fields: { path: string; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of fields) {
    const field = path.replace(/^brief\./, '').split('.')[0] as BriefField;
    if (FIELD_ORDER.includes(field)) errors[field] ??= MESSAGES[field] ?? message;
  }
  return errors;
}
