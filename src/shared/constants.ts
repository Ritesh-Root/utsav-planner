/**
 * The vocabulary of a plan, kept free of zod so the first screen can use it
 * without loading the validation library.
 */

/** Kinds of event Utsav plans. */
export const EVENT_TYPES = ['wedding', 'birthday', 'community'] as const;
/** Where the event can happen. */
export const VENUE_PREFERENCES = ['indoor', 'outdoor', 'either'] as const;
/** What matters most to the host; up to three are chosen. */
export const PRIORITIES = [
  'food',
  'decor',
  'photography',
  'entertainment',
  'guest-comfort',
  'saving-money',
  'sustainability',
  'traditions',
] as const;
/** Dietary needs the food ideas and caterer questions respect. */
export const DIETARY = ['vegetarian', 'vegan', 'jain', 'halal', 'gluten-free', 'nut-free'] as const;
/** Budget categories; the label shown is the plan’s own wording. */
export const BUDGET_KEYS = [
  'venue',
  'catering',
  'decor',
  'photography',
  'entertainment',
  'attire',
  'beauty',
  'invitations',
  'gifts',
  'transport',
  'accommodation',
  'rituals',
  'cake',
  'rentals',
  'sound-light',
  'permits',
  'safety',
  'volunteers',
  'marketing',
  'cleanup',
  'misc',
  'contingency',
] as const;
/** How urgent a task is. */
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
/** Where each vendor is on the way to being booked. */
export const VENDOR_STATUSES = [
  'not-started',
  'researching',
  'contacted',
  'quoted',
  'booked',
  'not-needed',
] as const;
/** Kinds of idea, used for filters. */
export const IDEA_CATEGORIES = [
  'theme',
  'decor',
  'food',
  'activity',
  'culture',
  'accessibility',
  'sustainability',
  'keepsake',
] as const;
/** Rough cost of an idea. */
export const COST_TIERS = ['low', 'medium', 'high'] as const;
/** Which part of the plan a refinement may change. */
export const REFINE_SCOPES = ['all', 'budget', 'timeline', 'vendors', 'ideas', 'dayOf'] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type VenuePreference = (typeof VENUE_PREFERENCES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Dietary = (typeof DIETARY)[number];
export type BudgetKey = (typeof BUDGET_KEYS)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type VendorStatus = (typeof VENDOR_STATUSES)[number];
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export type CostTier = (typeof COST_TIERS)[number];
export type RefineScope = (typeof REFINE_SCOPES)[number];

/** Stored plans carry this version so future formats can be migrated. */
export const PLAN_VERSION = 1;
