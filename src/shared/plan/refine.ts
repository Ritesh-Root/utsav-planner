import type { Brief, Plan, RefineContext, RefineResult } from '../schemas.js';
import { LIMITS } from '../limits.js';
import { truncate } from '../sanitize.js';
import { sortTasks } from '../timeline.js';
import { vendorHasUserData } from '../vendors.js';
import type { IdFactory } from './build.js';
import {
  buildBudgetLines,
  byBookBy,
  byDayAndTime,
  entryFromAi,
  entryFromLine,
  makeDayOf,
  makeIdea,
  makeTask,
  makeVendor,
} from './build.js';
import { applyBriefChange } from './edits.js';

// ---------------------------------------------------------------------------
// Refinement
// ---------------------------------------------------------------------------

/** What the model sees when refining: no contacts, quotes, notes or spend. */
export function toRefineContext(plan: Plan): RefineContext {
  return {
    title: truncate(plan.title, LIMITS.shortText),
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

/**
 * The model's items that fit under a section's cap beside the user's kept ones. Its
 * versions of the user's own items always fit; new suggestions fill what room is left.
 */
function fitting<T>(
  fromModel: readonly T[],
  keptCount: number,
  max: number,
  isUsers: (item: T) => boolean,
): T[] {
  let room = max - keptCount - fromModel.filter(isUsers).length;
  return fromModel.filter((item) => {
    if (isUsers(item)) return true;
    room -= 1;
    return room >= 0;
  });
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
    const keptEntries = kept.map(entryFromLine);
    // One place is held back for the contingency line the builder may add.
    const fitted = fitting(
      entries,
      keptEntries.length,
      LIMITS.planBudgetLinesMax - 1,
      (entry) => Boolean(entry.previous?.locked) || (entry.previous?.actual ?? 0) > 0,
    );
    next = { ...next, budget: buildBudgetLines([...fitted, ...keptEntries], brief.budget, newId) };
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
    const fitted = fitting(updated, kept.length, LIMITS.planTasksMax, (t) => t.done || t.custom);
    next = { ...next, tasks: sortTasks([...fitted, ...kept]) };
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
    const fitted = fitting(updated, kept.length, LIMITS.planVendorsMax, vendorHasUserData);
    next = { ...next, vendors: [...fitted, ...kept].sort(byBookBy) };
  }

  if (sections.ideas) {
    const ids = claimer(plan.ideas);
    const updated = sections.ideas.map((item) => {
      const previous = ids.claim(item.id);
      return { ...makeIdea(item, previous?.id ?? newId('idea')), saved: previous?.saved ?? false };
    });
    const kept = plan.ideas.filter((idea) => !ids.isClaimed(idea.id) && idea.saved);
    const fitted = fitting(updated, kept.length, LIMITS.planIdeasMax, (idea) => idea.saved);
    next = { ...next, ideas: [...kept, ...fitted] };
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
