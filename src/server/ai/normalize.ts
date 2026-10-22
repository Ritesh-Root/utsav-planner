import { LIMITS } from '../../shared/limits.js';
import { estimateCap, toWholeAmount } from '../../shared/money.js';
import { cleanText, dedupeKey, uniqueBy } from '../../shared/sanitize.js';
import type {
  AiBudgetLine,
  AiDayOf,
  AiIdea,
  AiPlan,
  AiTask,
  AiVendor,
  Brief,
  BriefPatch,
  RefineResult,
  RefineScope,
} from '../../shared/schemas.js';
import { AiPlanSchema, AiRefineSchema, BriefPatchSchema } from '../../shared/schemas.js';
import {
  clampBookDays,
  clampDay,
  clampDaysBefore,
  clampStartMinute,
  eventDateIssue,
} from '../../shared/timeline.js';

/** The model answered, but not with something we can safely use. Retried once. */
export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

const { shortText, mediumText, longText } = LIMITS;

function cleanList(values: readonly string[], max: number, length: number): string[] {
  return uniqueBy(
    values.map((v) => cleanText(v, length)).filter((v) => v.length > 0),
    dedupeKey,
  ).slice(0, max);
}

function cleanBudget<T extends AiBudgetLine>(lines: readonly T[], budget: number): T[] {
  const cap = estimateCap(budget);
  const cleaned = lines
    .map((line) => ({
      ...line,
      category: cleanText(line.category, shortText),
      rationale: cleanText(line.rationale, mediumText),
      sharePct: Math.min(Math.max(Number.isFinite(line.sharePct) ? line.sharePct : 0, 0), 100),
      estLow: toWholeAmount(line.estLow, cap),
      estHigh: toWholeAmount(line.estHigh, cap),
    }))
    .filter((line) => line.category.length > 0);
  // One contingency line at most: merge any extras into the first.
  const firstContingency = cleaned.find((line) => line.key === 'contingency');
  const merged = cleaned.filter((line) => line.key !== 'contingency' || line === firstContingency);
  if (firstContingency) {
    const extra = cleaned
      .filter((line) => line.key === 'contingency' && line !== firstContingency)
      .reduce((acc, line) => acc + line.sharePct, 0);
    firstContingency.sharePct = Math.min(firstContingency.sharePct + extra, 100);
  }
  return uniqueBy(merged, (line) => dedupeKey(line.category)).slice(0, LIMITS.budgetLinesMax);
}

function cleanTasks<T extends AiTask>(tasks: readonly T[]): T[] {
  return uniqueBy(
    tasks
      .map((task) => ({
        ...task,
        title: cleanText(task.title, shortText),
        details: cleanText(task.details, mediumText),
        daysBefore: clampDaysBefore(task.daysBefore),
      }))
      .filter((task) => task.title.length > 0),
    (task) => dedupeKey(task.title),
  ).slice(0, LIMITS.tasksMax);
}

function cleanVendors<T extends AiVendor>(vendors: readonly T[]): T[] {
  return uniqueBy(
    vendors
      .map((vendor) => ({
        ...vendor,
        category: cleanText(vendor.category, shortText),
        why: cleanText(vendor.why, mediumText),
        bookDaysBefore: clampBookDays(vendor.bookDaysBefore),
        questions: cleanList(vendor.questions, LIMITS.questionsMax, mediumText),
      }))
      .filter((vendor) => vendor.category.length > 0 && vendor.questions.length > 0),
    (vendor) => dedupeKey(vendor.category),
  ).slice(0, LIMITS.vendorsMax);
}

function cleanIdeas<T extends AiIdea>(ideas: readonly T[]): T[] {
  return uniqueBy(
    ideas
      .map((idea) => ({
        ...idea,
        title: cleanText(idea.title, shortText),
        description: cleanText(idea.description, longText),
      }))
      .filter((idea) => idea.title.length > 0 && idea.description.length > 0),
    (idea) => dedupeKey(idea.title),
  ).slice(0, LIMITS.ideasMax);
}

function cleanDayOf<T extends AiDayOf>(items: readonly T[], days: number): T[] {
  return items
    .map((item) => ({
      ...item,
      title: cleanText(item.title, shortText),
      day: clampDay(item.day, days),
      startMinute: clampStartMinute(item.startMinute),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, LIMITS.dayOfMax);
}

function requireAtLeast(items: readonly unknown[], min: number, what: string): void {
  if (items.length < min) throw new InvalidOutputError(`too few ${what}`);
}

/** Validate and clean a generated plan, or throw `InvalidOutputError`. */
export function normalizePlanDraft(raw: unknown, brief: Brief): AiPlan {
  const parsed = AiPlanSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidOutputError('plan does not match the schema');
  const plan = parsed.data;

  const draft: AiPlan = {
    title: cleanText(plan.title, shortText) || `${brief.title}: plan`,
    summary: cleanText(plan.summary, longText),
    assumptions: cleanList(plan.assumptions, LIMITS.assumptionsMax, mediumText),
    budget: cleanBudget(plan.budget, brief.budget),
    timeline: cleanTasks(plan.timeline),
    vendors: cleanVendors(plan.vendors),
    ideas: cleanIdeas(plan.ideas),
    dayOf: cleanDayOf(plan.dayOf, brief.days),
  };
  requireAtLeast(draft.budget, LIMITS.budgetLinesMin, 'budget lines');
  requireAtLeast(draft.timeline, LIMITS.tasksMin, 'tasks');
  requireAtLeast(draft.vendors, LIMITS.vendorsMin, 'vendors');
  requireAtLeast(draft.ideas, LIMITS.ideasMin, 'ideas');
  requireAtLeast(draft.dayOf, 1, 'run sheet items');
  if (draft.budget.every((line) => line.sharePct <= 0)) {
    throw new InvalidOutputError('budget shares are all zero');
  }
  return draft;
}

/** Fewer items than this in a returned section would wipe out the plan. */
const REFINE_MINIMUMS = { budget: 3, timeline: 3, vendors: 2, ideas: 3, dayOf: 1 } as const;

function keepId<T extends { id?: string | undefined }>(item: T): T {
  if (item.id === undefined || (item.id.length > 0 && item.id.length <= LIMITS.idMax)) return item;
  const { id: _dropped, ...rest } = item;
  return rest as T;
}

function cleanPatch(patch: Record<string, unknown> | undefined, today: string): BriefPatch | null {
  if (!patch) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const cleaned = typeof value === 'string' ? cleanText(value, shortText) : value;
    const single = BriefPatchSchema.safeParse({ [key]: cleaned });
    if (!single.success) continue;
    if (key === 'date' && typeof cleaned === 'string' && eventDateIssue(cleaned, today)) continue;
    result[key] = cleaned;
  }
  const validated = BriefPatchSchema.safeParse(result);
  return validated.success && Object.keys(validated.data).length > 0 ? validated.data : null;
}

/** Validate and clean a refinement, keeping only sections the scope allows. */
export function normalizeRefine(
  raw: unknown,
  scope: RefineScope,
  brief: Brief,
  today: string,
): RefineResult {
  const parsed = AiRefineSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidOutputError('refinement does not match the schema');
  const value = parsed.data;
  const allowed = (section: Exclude<RefineScope, 'all'>) => scope === 'all' || scope === section;

  const sections: RefineResult['sections'] = {};
  if (value.budget && allowed('budget')) {
    sections.budget = cleanBudget(value.budget, value.briefPatch?.budget ?? brief.budget).map(
      keepId,
    );
  }
  if (value.timeline && allowed('timeline'))
    sections.timeline = cleanTasks(value.timeline).map(keepId);
  if (value.vendors && allowed('vendors'))
    sections.vendors = cleanVendors(value.vendors).map(keepId);
  if (value.ideas && allowed('ideas')) sections.ideas = cleanIdeas(value.ideas).map(keepId);
  if (value.dayOf && allowed('dayOf')) {
    sections.dayOf = cleanDayOf(value.dayOf, value.briefPatch?.days ?? brief.days).map(keepId);
  }

  for (const [section, min] of Object.entries(REFINE_MINIMUMS) as [
    keyof typeof REFINE_MINIMUMS,
    number,
  ][]) {
    const items = sections[section];
    if (items) requireAtLeast(items, min, section);
  }
  if (scope !== 'all' && !sections[scope]) {
    throw new InvalidOutputError(`missing the ${scope} section`);
  }

  return {
    message: cleanText(value.message, mediumText) || 'Updated your plan.',
    briefPatch: cleanPatch(value.briefPatch, today),
    sections,
  };
}
