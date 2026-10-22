import type {
  Brief,
  BudgetKey,
  BudgetLine,
  DayOfItem,
  Idea,
  IdeaCategory,
  Plan,
  Task,
  TaskPriority,
  Vendor,
} from '../schemas.js';
import { projectGuests, toBasisPoints } from '../budget.js';
import { clampStartMinute, diffDays } from '../dates.js';
import { BASIS_POINTS, LIMITS } from '../limits.js';
import { toWholeAmount } from '../money.js';
import { clampBookDays, clampDay, clampDaysBefore, schedule, sortTasks } from '../timeline.js';
import { truncate } from '../sanitize.js';
import type { IdFactory } from './build.js';
import { byBookBy, byDayAndTime, reallocate } from './build.js';

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

/** Let Utsav set this line again: unlock it and rebalance. */
export function unlockLine(plan: Plan, lineId: string, now: Date): Plan {
  const budget = plan.budget.map((line) =>
    line.id === lineId ? { ...line, locked: false } : line,
  );
  return touch(plan, now, { budget: reallocate(budget, plan.brief.budget) });
}

/** Record money spent on a line; the plan itself does not change. */
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

/** The most each section of a plan can hold (see LIMITS), so a stored plan always stays valid. */
const SECTION_MAX = {
  budget: LIMITS.planBudgetLinesMax,
  tasks: LIMITS.planTasksMax,
  vendors: LIMITS.planVendorsMax,
  ideas: LIMITS.planIdeasMax,
  dayOf: LIMITS.planDayOfMax,
} as const;

/** True when a section has no room for another item; the add helpers then change nothing. */
export function planIsFull(plan: Plan, section: keyof typeof SECTION_MAX): boolean {
  return plan[section].length >= SECTION_MAX[section];
}

/** Add the user's own task, scheduled relative to the event date. */
export function addCustomTask(
  plan: Plan,
  input: { title: string; due: string; priority: TaskPriority },
  newId: IdFactory,
  now: Date,
): Plan {
  if (planIsFull(plan, 'tasks')) return plan;
  const daysBefore = clampDaysBefore(diffDays(input.due, plan.brief.date));
  const task: Task = {
    id: newId('task'),
    title: truncate(input.title.trim(), LIMITS.shortText),
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

/** Tick a task as done, or untick it. */
export function toggleTaskDone(plan: Plan, taskId: string, now: Date): Plan {
  return touch(plan, now, {
    tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)),
  });
}

/** Take a task off the timeline. */
export function removeTask(plan: Plan, taskId: string, now: Date): Plan {
  return touch(plan, now, { tasks: plan.tasks.filter((task) => task.id !== taskId) });
}

export type VendorChanges = Partial<
  Pick<Vendor, 'status' | 'contactName' | 'contact' | 'quote' | 'notes'>
>;

/** Change a vendor's status or the user's own notes about it. */
export function updateVendor(
  plan: Plan,
  vendorId: string,
  changes: VendorChanges,
  now: Date,
): Plan {
  return touch(plan, now, {
    vendors: plan.vendors.map((vendor) =>
      vendor.id === vendorId ? { ...vendor, ...changes } : vendor,
    ),
  });
}

/** Add a vendor type the plan does not have, to be booked by the given date. */
export function addCustomVendor(
  plan: Plan,
  input: { category: string; budgetKey: BudgetKey; bookBy: string },
  newId: IdFactory,
  today: string,
  now: Date,
): Plan {
  if (planIsFull(plan, 'vendors')) return plan;
  const bookDaysBefore = clampBookDays(diffDays(input.bookBy, plan.brief.date));
  const vendor: Vendor = {
    id: newId('vendor'),
    category: truncate(input.category.trim(), LIMITS.shortText),
    budgetKey: input.budgetKey,
    why: 'Added by you.',
    questions: [],
    bookDaysBefore,
    bookBy: schedule(plan.brief.date, bookDaysBefore, today).due,
    status: 'not-started',
    contactName: '',
    contact: '',
    quote: 0,
    notes: '',
  };
  return touch(plan, now, { vendors: [...plan.vendors, vendor].sort(byBookBy) });
}

/** Take a vendor off the checklist. */
export function removeVendor(plan: Plan, vendorId: string, now: Date): Plan {
  return touch(plan, now, { vendors: plan.vendors.filter((vendor) => vendor.id !== vendorId) });
}

/** Save an idea, or take it out of the saved ones. */
export function toggleIdeaSaved(plan: Plan, ideaId: string, now: Date): Plan {
  return touch(plan, now, {
    ideas: plan.ideas.map((idea) => (idea.id === ideaId ? { ...idea, saved: !idea.saved } : idea)),
  });
}

/** Add the user's own idea; it starts saved so refinements keep it. */
export function addCustomIdea(
  plan: Plan,
  input: { title: string; description: string; category: IdeaCategory },
  newId: IdFactory,
  now: Date,
): Plan {
  if (planIsFull(plan, 'ideas')) return plan;
  const idea: Idea = {
    id: newId('idea'),
    category: input.category,
    title: truncate(input.title.trim(), LIMITS.shortText),
    description: truncate(input.description.trim(), LIMITS.longText),
    costTier: 'low',
    saved: true,
  };
  return touch(plan, now, { ideas: [idea, ...plan.ideas] });
}

/**
 * Add a budget line with an amount the user sets. It is locked like any typed
 * amount, so the other unlocked lines rebalance around it.
 */
export function addBudgetLine(
  plan: Plan,
  input: { category: string; amount: number },
  newId: IdFactory,
  now: Date,
): Plan {
  if (planIsFull(plan, 'budget')) return plan;
  const line: BudgetLine = {
    id: newId('budget'),
    key: 'misc',
    category: truncate(input.category.trim(), LIMITS.shortText),
    // A share matching its amount, so "Reset" later gives it a fair slice rather than nothing.
    shareBp:
      plan.brief.budget > 0
        ? Math.min(BASIS_POINTS, Math.round((input.amount / plan.brief.budget) * BASIS_POINTS))
        : 0,
    perGuest: false,
    rationale: 'Added by you.',
    estLow: 0,
    estHigh: 0,
    amount: toWholeAmount(input.amount, LIMITS.budgetMax),
    locked: true,
    actual: 0,
  };
  return touch(plan, now, { budget: reallocate([...plan.budget, line], plan.brief.budget) });
}

/** Remove a budget line and rebalance the rest. The last line cannot be removed. */
export function removeBudgetLine(plan: Plan, lineId: string, now: Date): Plan {
  if (plan.budget.length <= 1) return plan;
  return touch(plan, now, {
    budget: reallocate(
      plan.budget.filter((line) => line.id !== lineId),
      plan.brief.budget,
    ),
  });
}

/** Add an item to the run sheet, kept in day and time order. */
export function addDayOfItem(
  plan: Plan,
  input: { day: number; startMinute: number; title: string },
  newId: IdFactory,
  now: Date,
): Plan {
  if (planIsFull(plan, 'dayOf')) return plan;
  const item: DayOfItem = {
    id: newId('day'),
    day: clampDay(input.day, plan.brief.days),
    startMinute: clampStartMinute(input.startMinute),
    title: truncate(input.title.trim(), LIMITS.shortText),
  };
  return touch(plan, now, { dayOf: [...plan.dayOf, item].sort(byDayAndTime) });
}

/** Take an item off the run sheet. */
export function removeDayOfItem(plan: Plan, itemId: string, now: Date): Plan {
  return touch(plan, now, { dayOf: plan.dayOf.filter((item) => item.id !== itemId) });
}
