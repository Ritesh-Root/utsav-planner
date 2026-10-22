import { describe, expect, it } from 'vitest';

import {
  addBudgetLine,
  addCustomIdea,
  addCustomVendor,
  addDayOfItem,
  applyBriefChange,
  applyGuestChange,
  mergeRefinement,
  planIsFull,
  removeBudgetLine,
  removeDayOfItem,
  removeTask,
  removeVendor,
  setLineAmount,
  toggleIdeaSaved,
  toggleTaskDone,
  unlockLine,
  updateVendor,
} from '../../src/shared/plan.js';
import type { Plan } from '../../src/shared/schemas.js';
import { PlanSchema } from '../../src/shared/schemas.js';
import { LIMITS } from '../../src/shared/limits.js';
import {
  NOW,
  TODAY,
  birthdayBrief,
  communityBrief,
  sequentialIds,
  templatePlan,
  weddingBrief,
} from '../fixtures/plans.js';

const total = (plan: Plan) => plan.budget.reduce((acc, line) => acc + line.amount, 0);
const lockedTotal = (plan: Plan) =>
  plan.budget.filter((l) => l.locked).reduce((acc, l) => acc + l.amount, 0);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('budget invariant under any sequence of edits', () => {
  it('planned always equals max(budget, locked lines) and the plan stays valid (300 seeded runs)', () => {
    const random = mulberry32(7);
    for (let run = 0; run < 300; run += 1) {
      const brief = [weddingBrief, birthdayBrief, communityBrief][run % 3] ?? birthdayBrief;
      let plan = templatePlan(brief);
      for (let step = 0; step < 6; step += 1) {
        const line = plan.budget[Math.floor(random() * plan.budget.length)];
        if (!line) break;
        const op = Math.floor(random() * 5);
        if (op === 0) {
          plan = setLineAmount(plan, line.id, Math.floor(random() * plan.brief.budget * 0.6), NOW);
        } else if (op === 1) {
          plan = unlockLine(plan, line.id, NOW);
        } else if (op === 2) {
          const mode = random() < 0.5 ? 'raise-budget' : 'keep-budget';
          plan = applyGuestChange(plan, 1 + Math.floor(random() * 800), mode, NOW);
        } else if (op === 3) {
          const budget = 1000 + Math.floor(random() * 3_000_000);
          plan = applyBriefChange(plan, { ...plan.brief, budget }, TODAY, NOW);
        } else {
          plan = addBudgetLine(
            plan,
            { category: `Extra ${step}`, amount: Math.floor(random() * 5000) },
            sequentialIds(`p${run}s${step}`),
            NOW,
          );
        }
        expect(total(plan)).toBe(Math.max(plan.brief.budget, lockedTotal(plan)));
        expect(plan.budget.every((l) => Number.isInteger(l.amount) && l.amount >= 0)).toBe(true);
        expect(PlanSchema.safeParse(plan).success).toBe(true);
      }
    }
  });
});

describe('task, vendor, idea and run-sheet edits', () => {
  const plan = templatePlan(birthdayBrief);
  const ids = () => sequentialIds('x');

  it('ticks and unticks a task, and removes one', () => {
    const task = plan.tasks[0];
    if (!task) throw new Error('fixture');
    const done = toggleTaskDone(plan, task.id, NOW);
    expect(done.tasks[0]?.done).toBe(true);
    expect(toggleTaskDone(done, task.id, NOW).tasks[0]?.done).toBe(false);
    expect(removeTask(plan, task.id, NOW).tasks).toHaveLength(plan.tasks.length - 1);
  });

  it('updates, adds and removes vendors, scheduling new ones from their book-by date', () => {
    const vendor = plan.vendors[0];
    if (!vendor) throw new Error('fixture');
    const updated = updateVendor(plan, vendor.id, { status: 'booked', quote: 4000 }, NOW);
    expect(updated.vendors.find((v) => v.id === vendor.id)).toMatchObject({
      status: 'booked',
      quote: 4000,
    });
    const added = addCustomVendor(
      plan,
      { category: '  Live band ', budgetKey: 'entertainment', bookBy: '2026-11-07' },
      ids(),
      TODAY,
      NOW,
    );
    const band = added.vendors.find((v) => v.category === 'Live band');
    expect(band).toMatchObject({ bookBy: '2026-11-07', bookDaysBefore: 14, status: 'not-started' });
    expect(removeVendor(added, band?.id ?? '', NOW).vendors).toHaveLength(plan.vendors.length);
    expect(PlanSchema.safeParse(added).success).toBe(true);
  });

  it('saves ideas and adds the user’s own, already saved', () => {
    const idea = plan.ideas[0];
    if (!idea) throw new Error('fixture');
    expect(toggleIdeaSaved(plan, idea.id, NOW).ideas[0]?.saved).toBe(true);
    const mine = addCustomIdea(
      plan,
      { title: 'Rocket piñata', description: '', category: 'activity' },
      ids(),
      NOW,
    );
    expect(mine.ideas[0]).toMatchObject({ title: 'Rocket piñata', saved: true, costTier: 'low' });
  });

  it('adds and removes run-sheet items in day and time order, within the event length', () => {
    const added = addDayOfItem(plan, { day: 9, startMinute: 2000, title: 'Late cake' }, ids(), NOW);
    const item = added.dayOf.find((d) => d.title === 'Late cake');
    expect(item).toMatchObject({ day: 1, startMinute: 1439 });
    expect(added.dayOf.at(-1)?.title).toBe('Late cake');
    expect(removeDayOfItem(added, item?.id ?? '', NOW).dayOf).toHaveLength(plan.dayOf.length);
  });

  it('adds a locked budget line and removes lines, but never the last one', () => {
    const added = addBudgetLine(plan, { category: 'Magician', amount: 3000 }, ids(), NOW);
    expect(added.budget.at(-1)).toMatchObject({ category: 'Magician', amount: 3000, locked: true });
    expect(total(added)).toBe(birthdayBrief.budget);
    const removed = removeBudgetLine(added, added.budget.at(-1)?.id ?? '', NOW);
    expect(total(removed)).toBe(birthdayBrief.budget);
    const single = { ...plan, budget: plan.budget.slice(0, 1) };
    expect(removeBudgetLine(single, single.budget[0]?.id ?? '', NOW)).toBe(single);
  });
});

describe('refinement merges keep the user’s work', () => {
  const opts = { today: TODAY, now: NOW, newId: sequentialIds('r') };

  it('keeps private vendor data when the model returns the same vendor id', () => {
    const plan = templatePlan(birthdayBrief);
    const vendor = plan.vendors[0];
    if (!vendor) throw new Error('fixture');
    const prepared = updateVendor(
      plan,
      vendor.id,
      { status: 'quoted', contact: '98765 43210', notes: 'secret', quote: 4000 },
      NOW,
    );
    const merged = mergeRefinement(
      prepared,
      {
        message: 'm',
        briefPatch: null,
        sections: {
          vendors: [
            {
              id: vendor.id,
              category: 'Cake maker',
              budgetKey: vendor.budgetKey,
              why: 'w',
              bookDaysBefore: 5,
              questions: ['a', 'b'],
            },
          ],
        },
      },
      opts,
    );
    expect(merged.vendors.find((v) => v.id === vendor.id)).toMatchObject({
      category: 'Cake maker',
      status: 'quoted',
      contact: '98765 43210',
      notes: 'secret',
      quote: 4000,
    });
  });

  it('keeps a finished task on its original date when the model renames it', () => {
    const plan = templatePlan(birthdayBrief);
    const task = plan.tasks[0];
    if (!task) throw new Error('fixture');
    const prepared = toggleTaskDone(plan, task.id, NOW);
    const merged = mergeRefinement(
      prepared,
      {
        message: 'm',
        briefPatch: null,
        sections: {
          timeline: [
            { id: task.id, title: 'Renamed', details: 'd', daysBefore: 2, priority: 'low' },
          ],
        },
      },
      opts,
    );
    expect(merged.tasks.find((t) => t.id === task.id)).toMatchObject({
      title: 'Renamed',
      done: true,
      due: task.due,
    });
  });

  it('replaces the run sheet, sorted by day and time and clamped to the event length', () => {
    const plan = templatePlan(weddingBrief);
    const merged = mergeRefinement(
      plan,
      {
        message: 'm',
        briefPatch: null,
        sections: {
          dayOf: [
            { day: 2, startMinute: 600, title: 'Late' },
            { day: 1, startMinute: 900, title: 'Second' },
            { day: 9, startMinute: 480, title: 'Clamped' },
            { day: 1, startMinute: 480, title: 'First' },
          ],
        },
      },
      opts,
    );
    expect(merged.dayOf.map((d) => d.title)).toEqual(['First', 'Second', 'Late', 'Clamped']);
    expect(merged.dayOf.at(-1)?.day).toBe(3);
    expect(PlanSchema.safeParse(merged).success).toBe(true);
  });
});

describe('plans never outgrow what storage accepts', () => {
  const ids = () => sequentialIds('cap');

  it('refuses to add to a full section, leaving the plan as it was', () => {
    let plan = templatePlan(birthdayBrief);
    while (!planIsFull(plan, 'budget')) {
      plan = addBudgetLine(
        plan,
        { category: `Line ${plan.budget.length}`, amount: 10 },
        ids(),
        NOW,
      );
    }
    expect(plan.budget).toHaveLength(LIMITS.planBudgetLinesMax);
    expect(addBudgetLine(plan, { category: 'One more', amount: 10 }, ids(), NOW)).toBe(plan);
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });

  it('keeps every saved idea and only as many new ones as fit when refining a full plan', () => {
    let plan = templatePlan(birthdayBrief);
    while (!planIsFull(plan, 'ideas')) {
      plan = addCustomIdea(
        plan,
        { title: `Mine ${plan.ideas.length}`, description: '', category: 'theme' },
        ids(),
        NOW,
      );
    }
    const fresh = Array.from({ length: 6 }, (_, i) => ({
      title: `Gemini idea ${i}`,
      description: 'd',
      category: 'decor' as const,
      costTier: 'low' as const,
    }));
    const merged = mergeRefinement(
      plan,
      { message: 'm', briefPatch: null, sections: { ideas: fresh } },
      { today: TODAY, now: NOW, newId: ids() },
    );
    expect(merged.ideas.length).toBeLessThanOrEqual(LIMITS.planIdeasMax);
    expect(merged.ideas.filter((idea) => idea.saved)).toHaveLength(
      plan.ideas.filter((i) => i.saved).length,
    );
    expect(PlanSchema.safeParse(merged).success).toBe(true);
  });

  it('gives an added line a fair share, so Reset does not empty it', () => {
    const plan = templatePlan(birthdayBrief);
    const added = addBudgetLine(plan, { category: 'Photo booth', amount: 5000 }, ids(), NOW);
    const line = added.budget.at(-1);
    if (!line) throw new Error('fixture');
    const reset = unlockLine(added, line.id, NOW);
    expect(reset.budget.find((l) => l.id === line.id)?.amount).toBeGreaterThan(2500);
  });
});
