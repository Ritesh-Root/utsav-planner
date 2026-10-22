import { clampStartMinute } from '../dates.js';
import type {
  AiBudgetLine,
  AiPlan,
  Brief,
  BudgetKey,
  BudgetLine,
  DayOfItem,
  Idea,
  Plan,
  PlanSource,
  Task,
  TaskPriority,
  Vendor,
} from '../schemas.js';
import { allocate, withContingency } from '../budget.js';
import { LIMITS } from '../limits.js';
import { estimateCap, toWholeAmount } from '../money.js';
import { PLAN_VERSION } from '../constants.js';
import { clampBookDays, clampDay, clampDaysBefore, schedule, sortTasks } from '../timeline.js';
import { truncate } from '../sanitize.js';

export type IdFactory = (prefix: string) => string;

/** Short random ids such as `task-1a2b3c4d`; unique enough for one person's plans. */
export const randomId: IdFactory = (prefix) =>
  `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Budget lines
// ---------------------------------------------------------------------------

interface BudgetEntry {
  previous?: BudgetLine;
  key: BudgetKey;
  category: string;
  /** Relative weight on a 0–100 (percentage) scale. */
  share: number;
  perGuest: boolean;
  rationale: string;
  estLow: number;
  estHigh: number;
}

const CONTINGENCY_DEFAULTS = {
  category: 'Contingency buffer',
  rationale: 'A buffer for surprises, price changes and last-minute needs.',
};

/** A budget line from the model, as a share to apportion. */
export function entryFromAi(line: AiBudgetLine, previous?: BudgetLine): BudgetEntry {
  return {
    ...(previous ? { previous } : {}),
    key: line.key,
    category: line.category,
    share: line.sharePct,
    perGuest: line.perGuest,
    rationale: line.rationale,
    estLow: line.estLow,
    estHigh: line.estHigh,
  };
}

/** An existing budget line, as a share to apportion. */
export function entryFromLine(line: BudgetLine): BudgetEntry {
  return {
    previous: line,
    key: line.key,
    category: line.category,
    share: line.shareBp / 100,
    perGuest: line.perGuest,
    rationale: line.rationale,
    estLow: line.estLow,
    estHigh: line.estHigh,
  };
}

/**
 * Shares → basis points (with a 5–15% contingency), then exact amounts. Lines
 * the user locked keep their amount; previous ids and spend are preserved.
 */
export function buildBudgetLines(
  entries: readonly BudgetEntry[],
  total: number,
  newId: IdFactory,
): BudgetLine[] {
  const { keys, bp } = withContingency(entries.map((e) => ({ key: e.key, share: e.share })));
  const drafts: BudgetLine[] = keys.map((key, index) => {
    const entry = entries[index];
    const previous = entry?.previous;
    return {
      id: previous?.id ?? newId('budget'),
      key: (entry?.key ?? key) as BudgetKey,
      category: truncate(entry?.category ?? CONTINGENCY_DEFAULTS.category, LIMITS.shortText),
      shareBp: bp[index] ?? 0,
      perGuest: entry?.perGuest ?? false,
      rationale: truncate(entry?.rationale ?? CONTINGENCY_DEFAULTS.rationale, LIMITS.mediumText),
      estLow: entry?.estLow ?? 0,
      estHigh: entry?.estHigh ?? 0,
      amount: previous?.locked ? previous.amount : 0,
      locked: previous?.locked ?? false,
      actual: previous?.actual ?? 0,
    };
  });
  const { amounts } = allocate(total, drafts);
  const cap = estimateCap(total);
  return drafts.map((line, index) => {
    const amount = amounts[index] ?? 0;
    let low = toWholeAmount(Math.min(line.estLow, line.estHigh), cap);
    let high = toWholeAmount(Math.max(line.estLow, line.estHigh), cap);
    if (high === 0) {
      low = Math.round(amount * 0.8);
      high = Math.round(amount * 1.25);
    }
    return { ...line, amount, estLow: low, estHigh: high };
  });
}

/** Re-split unlocked lines so the plan adds up to `total` again. */
export function reallocate(budget: readonly BudgetLine[], total: number): BudgetLine[] {
  const { amounts } = allocate(total, budget);
  return budget.map((line, index) => ({ ...line, amount: amounts[index] ?? line.amount }));
}

// ---------------------------------------------------------------------------
// Building a plan
// ---------------------------------------------------------------------------

export interface FinalizeOptions {
  planId: string;
  today: string;
  now: Date;
  source: PlanSource;
  fallbackReason: string | null;
  model: string | null;
  newId: IdFactory;
}

/** A timeline task from a draft, scheduled back from the event date. */
export function makeTask(
  item: { title: string; details: string; daysBefore: number; priority: TaskPriority },
  brief: Brief,
  today: string,
  id: string,
): Task {
  const daysBefore = clampDaysBefore(item.daysBefore);
  return {
    id,
    title: truncate(item.title, LIMITS.shortText),
    details: truncate(item.details, LIMITS.mediumText),
    daysBefore,
    priority: item.priority,
    ...schedule(brief.date, daysBefore, today),
    done: false,
    custom: false,
  };
}

/** A vendor from a draft, with its book-by date and an empty private record. */
export function makeVendor(
  item: AiPlan['vendors'][number],
  brief: Brief,
  today: string,
  id: string,
): Vendor {
  const bookDaysBefore = clampBookDays(item.bookDaysBefore);
  return {
    id,
    category: truncate(item.category, LIMITS.shortText),
    budgetKey: item.budgetKey,
    why: truncate(item.why, LIMITS.mediumText),
    questions: item.questions
      .slice(0, LIMITS.questionsMax)
      .map((q) => truncate(q, LIMITS.mediumText)),
    bookDaysBefore,
    bookBy: schedule(brief.date, bookDaysBefore, today).due,
    status: 'not-started',
    contactName: '',
    contact: '',
    quote: 0,
    notes: '',
  };
}

/** A run-sheet item from a draft, kept within the event’s days. */
export function makeDayOf(item: AiPlan['dayOf'][number], brief: Brief, id: string): DayOfItem {
  return {
    id,
    day: clampDay(item.day, brief.days),
    startMinute: clampStartMinute(item.startMinute),
    title: truncate(item.title, LIMITS.shortText),
  };
}

/** An idea from a draft, not yet saved. */
export function makeIdea(item: AiPlan['ideas'][number], id: string): Idea {
  return {
    id,
    category: item.category,
    title: truncate(item.title, LIMITS.shortText),
    description: truncate(item.description, LIMITS.longText),
    costTier: item.costTier,
    saved: false,
  };
}

/** Vendors in the order they need booking. */
export const byBookBy = (a: Vendor, b: Vendor) => a.bookBy.localeCompare(b.bookBy);
/** Run-sheet items in day, then time, order. */
export const byDayAndTime = (a: DayOfItem, b: DayOfItem) =>
  a.day - b.day || a.startMinute - b.startMinute;

/** Turn a draft (from Gemini or a template) into a complete plan with exact numbers. */
export function finalizePlan(draft: AiPlan, brief: Brief, options: FinalizeOptions): Plan {
  const { newId, today } = options;
  const stamp = options.now.toISOString();
  return {
    version: PLAN_VERSION,
    id: options.planId,
    createdAt: stamp,
    updatedAt: stamp,
    createdOn: today,
    brief,
    source: options.source,
    fallbackReason: options.fallbackReason,
    model: options.model,
    title: truncate(draft.title, LIMITS.shortText),
    summary: truncate(draft.summary, LIMITS.longText),
    assumptions: draft.assumptions
      .slice(0, LIMITS.assumptionsMax)
      .map((a) => truncate(a, LIMITS.mediumText)),
    budget: buildBudgetLines(
      draft.budget.map((line) => entryFromAi(line)),
      brief.budget,
      newId,
    ),
    tasks: sortTasks(draft.timeline.map((t) => makeTask(t, brief, today, newId('task')))),
    vendors: draft.vendors.map((v) => makeVendor(v, brief, today, newId('vendor'))).sort(byBookBy),
    ideas: draft.ideas.map((idea) => makeIdea(idea, newId('idea'))),
    dayOf: draft.dayOf.map((d) => makeDayOf(d, brief, newId('day'))).sort(byDayAndTime),
  };
}
