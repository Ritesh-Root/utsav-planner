import { allocate, projectGuests, toBasisPoints, withContingency } from './budget.js';
import { diffDays } from './dates.js';
import { LIMITS } from './limits.js';
import { toWholeAmount } from './money.js';
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
  RefineContext,
  RefineResult,
  Task,
  TaskPriority,
  Vendor,
} from './schemas.js';
import { PLAN_VERSION } from './schemas.js';
import { clampDaysBefore, schedule, sortTasks } from './timeline.js';
import { truncate } from './sanitize.js';
import { vendorHasUserData } from './vendors.js';

export type IdFactory = (prefix: string) => string;

export const randomId: IdFactory = (prefix) =>
  `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Budget lines
// ---------------------------------------------------------------------------

interface BudgetEntry {
  previous?: BudgetLine;
  key: BudgetKey;
  category: string;
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

function entryFromAi(line: AiBudgetLine, previous?: BudgetLine): BudgetEntry {
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

function entryFromLine(line: BudgetLine): BudgetEntry {
  return {
    previous: line,
    key: line.key,
    category: line.category,
    share: line.shareBp,
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
function buildBudgetLines(
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
  const estimateCap = total * 3;
  return drafts.map((line, index) => {
    const amount = amounts[index] ?? 0;
    let low = toWholeAmount(Math.min(line.estLow, line.estHigh), estimateCap);
    let high = toWholeAmount(Math.max(line.estLow, line.estHigh), estimateCap);
    if (high === 0) {
      low = Math.round(amount * 0.8);
      high = Math.round(amount * 1.25);
    }
    return { ...line, amount, estLow: low, estHigh: high };
  });
}

function reallocate(budget: readonly BudgetLine[], total: number): BudgetLine[] {
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

function makeTask(
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

function makeVendor(
  item: AiPlan['vendors'][number],
  brief: Brief,
  today: string,
  id: string,
): Vendor {
  const bookDaysBefore = Math.max(clampDaysBefore(item.bookDaysBefore), 0);
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

function makeDayOf(item: AiPlan['dayOf'][number], brief: Brief, id: string): DayOfItem {
  return {
    id,
    day: Math.min(Math.max(Math.round(item.day), 1), brief.days),
    startMinute: Math.min(Math.max(Math.round(item.startMinute), 0), 24 * 60 - 1),
    title: truncate(item.title, LIMITS.shortText),
  };
}

function makeIdea(item: AiPlan['ideas'][number], id: string): Idea {
  return {
    id,
    category: item.category,
    title: truncate(item.title, LIMITS.shortText),
    description: truncate(item.description, LIMITS.longText),
    costTier: item.costTier,
    saved: false,
  };
}

const byBookBy = (a: Vendor, b: Vendor) => a.bookBy.localeCompare(b.bookBy);
const byDayAndTime = (a: DayOfItem, b: DayOfItem) => a.day - b.day || a.startMinute - b.startMinute;

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

// ---------------------------------------------------------------------------
// Edits that never need the AI
// ---------------------------------------------------------------------------

function touch(plan: Plan, now: Date, changes: Partial<Plan>): Plan {
  return { ...plan, ...changes, updatedAt: now.toISOString() };
}

/** Apply new brief details: re-split the budget and, if the date moved, reschedule. */
export function applyBriefChange(plan: Plan, brief: Brief, today: string, now: Date): Plan {
  const dateChanged = brief.date !== plan.brief.date;
  const tasks = dateChanged
    ? sortTasks(
        plan.tasks.map((task) =>
          task.done ? task : { ...task, ...schedule(brief.date, task.daysBefore, today) },
        ),
      )
    : plan.tasks;
  const vendors = dateChanged
    ? plan.vendors
        .map((v) => ({ ...v, bookBy: schedule(brief.date, v.bookDaysBefore, today).due }))
        .sort(byBookBy)
    : plan.vendors;
  return touch(plan, now, {
    brief,
    budget: reallocate(plan.budget, brief.budget),
    tasks,
    vendors,
    dayOf: plan.dayOf.map((item) => ({ ...item, day: Math.min(item.day, brief.days) })),
  });
}

/** The user types an amount: lock that line and rebalance the others exactly. */
export function setLineAmount(plan: Plan, lineId: string, amount: number, now: Date): Plan {
  const budget = plan.budget.map((line) =>
    line.id === lineId
      ? { ...line, locked: true, amount: toWholeAmount(amount, LIMITS.budgetMax) }
      : line,
  );
  return touch(plan, now, { budget: reallocate(budget, plan.brief.budget) });
}

export function unlockLine(plan: Plan, lineId: string, now: Date): Plan {
  const budget = plan.budget.map((line) =>
    line.id === lineId ? { ...line, locked: false } : line,
  );
  return touch(plan, now, { budget: reallocate(budget, plan.brief.budget) });
}

export function setLineActual(plan: Plan, lineId: string, actual: number, now: Date): Plan {
  return touch(plan, now, {
    budget: plan.budget.map((line) =>
      line.id === lineId ? { ...line, actual: toWholeAmount(actual, LIMITS.budgetMax) } : line,
    ),
  });
}

export type GuestChangeMode = 'raise-budget' | 'keep-budget';

/**
 * Change the head count. Per-guest lines scale with it; then either the budget
 * grows to keep per-guest quality, or the same budget is re-split.
 */
export function applyGuestChange(
  plan: Plan,
  guests: number,
  mode: GuestChangeMode,
  now: Date,
): Plan {
  const target = Math.min(Math.max(Math.round(guests), LIMITS.guestsMin), LIMITS.guestsMax);
  const projection = projectGuests(plan.budget, plan.brief.guests, target, plan.brief.budget);
  const shares = toBasisPoints(projection.amounts);
  const total =
    mode === 'raise-budget'
      ? Math.min(Math.max(projection.projectedTotal, 1), LIMITS.budgetMax)
      : plan.brief.budget;
  const budget = plan.budget.map((line, index) => ({
    ...line,
    shareBp: shares[index] ?? line.shareBp,
    amount: line.locked ? (projection.amounts[index] ?? line.amount) : line.amount,
  }));
  return touch(plan, now, {
    brief: { ...plan.brief, guests: target, budget: total },
    budget: reallocate(budget, total),
  });
}

export function addCustomTask(
  plan: Plan,
  input: { title: string; due: string; priority: TaskPriority },
  newId: IdFactory,
  now: Date,
): Plan {
  const daysBefore = clampDaysBefore(diffDays(input.due, plan.brief.date));
  const task: Task = {
    id: newId('task'),
    title: input.title.trim().slice(0, LIMITS.shortText),
    details: '',
    daysBefore,
    priority: input.priority,
    due: input.due,
    doNow: false,
    done: false,
    custom: true,
  };
  return touch(plan, now, { tasks: sortTasks([...plan.tasks, task]) });
}

// ---------------------------------------------------------------------------
// Refinement
// ---------------------------------------------------------------------------

/** What the model sees when refining: no contacts, quotes, notes or spend. */
export function toRefineContext(plan: Plan): RefineContext {
  return {
    title: plan.title.slice(0, LIMITS.shortText),
    budget: plan.budget.map((line) => ({
      id: line.id,
      key: line.key,
      category: line.category,
      sharePct: line.shareBp / 100,
      amount: line.amount,
      locked: line.locked,
    })),
    timeline: plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      daysBefore: task.daysBefore,
      priority: task.priority,
      done: task.done,
    })),
    vendors: plan.vendors.map((vendor) => ({
      id: vendor.id,
      category: vendor.category,
      budgetKey: vendor.budgetKey,
      bookDaysBefore: vendor.bookDaysBefore,
      status: vendor.status,
    })),
    ideas: plan.ideas.map((idea) => ({
      id: idea.id,
      category: idea.category,
      title: idea.title,
      saved: idea.saved,
    })),
    dayOf: plan.dayOf.map((item) => ({
      id: item.id,
      day: item.day,
      startMinute: item.startMinute,
      title: item.title,
    })),
  };
}

/** Hands out each existing item at most once, so duplicate ids from the model become new items. */
function claimer<T extends { id: string }>(items: readonly T[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const claimed = new Set<string>();
  return {
    claim(id: string | undefined): T | undefined {
      if (id === undefined || claimed.has(id)) return undefined;
      const found = byId.get(id);
      if (found) claimed.add(id);
      return found;
    },
    isClaimed: (id: string) => claimed.has(id),
  };
}

export interface MergeOptions {
  today: string;
  now: Date;
  newId: IdFactory;
}

/**
 * Merge a refinement into the plan. Only the returned sections change; inside
 * them, items the user has worked on (locked lines, spend, done or custom tasks,
 * vendors with progress, saved ideas) are never dropped.
 */
export function mergeRefinement(plan: Plan, result: RefineResult, options: MergeOptions): Plan {
  const { today, newId } = options;
  const patch = result.briefPatch ?? {};
  const brief: Brief = { ...plan.brief, ...patch };
  const { sections } = result;
  let next: Plan = { ...plan, brief };

  if (sections.budget) {
    const ids = claimer(plan.budget);
    const entries = sections.budget.map((item) => entryFromAi(item, ids.claim(item.id)));
    const kept = plan.budget.filter((l) => !ids.isClaimed(l.id) && (l.locked || l.actual > 0));
    // Kept lines carry basis points; express everything on the same 0–100 scale.
    const keptEntries = kept.map((line) => ({ ...entryFromLine(line), share: line.shareBp / 100 }));
    next = { ...next, budget: buildBudgetLines([...entries, ...keptEntries], brief.budget, newId) };
  }

  if (sections.timeline) {
    const ids = claimer(plan.tasks);
    const updated = sections.timeline.map((item) => {
      const previous = ids.claim(item.id);
      const fresh = makeTask(item, brief, today, previous?.id ?? newId('task'));
      return previous
        ? {
            ...fresh,
            done: previous.done,
            custom: previous.custom,
            ...(previous.done ? { due: previous.due, doNow: previous.doNow } : {}),
          }
        : fresh;
    });
    const kept = plan.tasks.filter((t) => !ids.isClaimed(t.id) && (t.done || t.custom));
    next = { ...next, tasks: sortTasks([...updated, ...kept]) };
  }

  if (sections.vendors) {
    const ids = claimer(plan.vendors);
    const updated = sections.vendors.map((item) => {
      const previous = ids.claim(item.id);
      const fresh = makeVendor(item, brief, today, previous?.id ?? newId('vendor'));
      return previous
        ? {
            ...fresh,
            status: previous.status,
            contactName: previous.contactName,
            contact: previous.contact,
            quote: previous.quote,
            notes: previous.notes,
          }
        : fresh;
    });
    const kept = plan.vendors.filter((v) => !ids.isClaimed(v.id) && vendorHasUserData(v));
    next = { ...next, vendors: [...updated, ...kept].sort(byBookBy) };
  }

  if (sections.ideas) {
    const ids = claimer(plan.ideas);
    const updated = sections.ideas.map((item) => {
      const previous = ids.claim(item.id);
      return { ...makeIdea(item, previous?.id ?? newId('idea')), saved: previous?.saved ?? false };
    });
    const kept = plan.ideas.filter((idea) => !ids.isClaimed(idea.id) && idea.saved);
    next = { ...next, ideas: [...kept, ...updated] };
  }

  if (sections.dayOf) {
    const ids = claimer(plan.dayOf);
    next = {
      ...next,
      dayOf: sections.dayOf
        .map((item) => makeDayOf(item, brief, ids.claim(item.id)?.id ?? newId('day')))
        .sort(byDayAndTime),
    };
  }

  // Brief changes (date, budget, days) flow through the same deterministic maths.
  return applyBriefChange({ ...next, brief: plan.brief }, brief, today, options.now);
}

// ---------------------------------------------------------------------------
// Describing changes
// ---------------------------------------------------------------------------

export interface SectionDiff {
  added: number;
  removed: number;
  changed: number;
}

export interface PlanDiff {
  budget: SectionDiff;
  tasks: SectionDiff;
  vendors: SectionDiff;
  ideas: SectionDiff;
  dayOf: SectionDiff;
  brief: (keyof Brief)[];
}

function diffSection<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  fingerprint: (item: T) => string,
): SectionDiff {
  const old = new Map(before.map((item) => [item.id, fingerprint(item)]));
  const fresh = new Set(after.map((item) => item.id));
  let added = 0;
  let changed = 0;
  for (const item of after) {
    const previous = old.get(item.id);
    if (previous === undefined) added += 1;
    else if (previous !== fingerprint(item)) changed += 1;
  }
  const removed = before.filter((item) => !fresh.has(item.id)).length;
  return { added, removed, changed };
}

export function diffPlans(before: Plan, after: Plan): PlanDiff {
  const briefKeys = Object.keys(after.brief) as (keyof Brief)[];
  return {
    budget: diffSection(before.budget, after.budget, (l) =>
      [l.key, l.category, l.amount, l.perGuest].join('|'),
    ),
    tasks: diffSection(before.tasks, after.tasks, (t) =>
      [t.title, t.details, t.due, t.priority].join('|'),
    ),
    vendors: diffSection(before.vendors, after.vendors, (v) =>
      [v.category, v.why, v.bookBy, v.questions.join('/')].join('|'),
    ),
    ideas: diffSection(before.ideas, after.ideas, (i) =>
      [i.category, i.title, i.description, i.costTier].join('|'),
    ),
    dayOf: diffSection(before.dayOf, after.dayOf, (d) => [d.day, d.startMinute, d.title].join('|')),
    brief: briefKeys.filter(
      (key) => JSON.stringify(before.brief[key]) !== JSON.stringify(after.brief[key]),
    ),
  };
}

const SECTION_NAMES: Record<Exclude<keyof PlanDiff, 'brief'>, string> = {
  budget: 'Budget',
  tasks: 'Timeline',
  vendors: 'Vendors',
  ideas: 'Ideas',
  dayOf: 'Run sheet',
};

/** e.g. "Budget: 2 updated, 1 added. Ideas: 3 added." */
export function describeDiff(diff: PlanDiff): string {
  const parts: string[] = [];
  for (const [section, name] of Object.entries(SECTION_NAMES) as [
    keyof typeof SECTION_NAMES,
    string,
  ][]) {
    const { added, removed, changed } = diff[section];
    const bits = [
      changed > 0 ? `${changed} updated` : '',
      added > 0 ? `${added} added` : '',
      removed > 0 ? `${removed} removed` : '',
    ].filter(Boolean);
    if (bits.length > 0) parts.push(`${name}: ${bits.join(', ')}.`);
  }
  if (diff.brief.length > 0) parts.push(`Event details changed: ${diff.brief.join(', ')}.`);
  return parts.length > 0 ? parts.join(' ') : 'No changes.';
}
