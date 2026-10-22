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
