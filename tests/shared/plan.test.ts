import { describe, expect, it } from 'vitest';

import { BASIS_POINTS } from '../../src/shared/limits.js';
import {
  addCustomTask,
  applyBriefChange,
  applyGuestChange,
  describeDiff,
  diffPlans,
  mergeRefinement,
  setLineActual,
  setLineAmount,
  toRefineContext,
  unlockLine,
} from '../../src/shared/plan.js';
import { PlanSchema } from '../../src/shared/schemas.js';
import {
  NOW,
  TODAY,
  birthdayBrief,
  communityBrief,
  sequentialIds,
  templatePlan,
  weddingBrief,
} from '../fixtures/plans.js';

const total = (plan: { budget: { amount: number }[] }) =>
  plan.budget.reduce((acc, line) => acc + line.amount, 0);

describe('finalizePlan', () => {
  it.each([weddingBrief, birthdayBrief, communityBrief])(
    'builds a valid plan whose budget adds up exactly ($type)',
    (brief) => {
      const plan = templatePlan(brief);
      expect(PlanSchema.safeParse(plan).success).toBe(true);
      expect(total(plan)).toBe(brief.budget);
      expect(plan.budget.reduce((acc, l) => acc + l.shareBp, 0)).toBe(BASIS_POINTS);
      const contingency = plan.budget.find((l) => l.key === 'contingency');
      expect(contingency?.shareBp).toBeGreaterThanOrEqual(500);
      expect(contingency?.shareBp).toBeLessThanOrEqual(1500);
      expect(plan.budget.every((l) => l.estLow <= l.amount && l.amount <= l.estHigh)).toBe(true);
    },
  );

  it('schedules tasks from the event date and flags late ones as "do now"', () => {
    // The mela is 17 days away, so 90-day tasks are already late.
    const plan = templatePlan(communityBrief);
    const permits = plan.tasks.find((t) => t.title.startsWith('Apply for local permits'));
    expect(permits).toMatchObject({ due: TODAY, doNow: true });
    const cleanup = plan.tasks.find((t) => t.title.startsWith('Clean up'));
    expect(cleanup).toMatchObject({ due: '2026-11-09', doNow: false });
    expect(plan.tasks.map((t) => t.due)).toEqual([...plan.tasks.map((t) => t.due)].sort());
  });

  it('caps long text so stored plans always pass validation', () => {
    const plan = templatePlan({ ...birthdayBrief, title: 'x'.repeat(80) });
    expect(plan.title.length).toBeLessThanOrEqual(80);
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });
});

describe('budget edits', () => {
  it('locks a typed amount and rebalances the other lines exactly', () => {
    const plan = templatePlan(weddingBrief);
    const venue = plan.budget[0];
    if (!venue) throw new Error('missing line');
    const edited = setLineAmount(plan, venue.id, 500_000, NOW);
    expect(edited.budget[0]).toMatchObject({ amount: 500_000, locked: true });
    expect(total(edited)).toBe(weddingBrief.budget);

    const unlocked = unlockLine(edited, venue.id, NOW);
    expect(unlocked.budget[0]?.locked).toBe(false);
    expect(unlocked.budget[0]?.amount).toBe(plan.budget[0]?.amount);
  });

  it('records spending without touching the plan', () => {
    const plan = templatePlan(birthdayBrief);
    const line = plan.budget[1];
    if (!line) throw new Error('missing line');
    const next = setLineActual(plan, line.id, 4200.6, NOW);
    expect(next.budget[1]?.actual).toBe(4201);
    expect(total(next)).toBe(total(plan));
  });

  it('raises the budget to keep per-guest quality when guests grow', () => {
    const plan = templatePlan(birthdayBrief);
    const raised = applyGuestChange(plan, 60, 'raise-budget', NOW);
    expect(raised.brief.guests).toBe(60);
    expect(raised.brief.budget).toBeGreaterThan(birthdayBrief.budget);
    expect(total(raised)).toBe(raised.brief.budget);
    const catering = (p: typeof plan) => p.budget.find((l) => l.key === 'catering')?.amount ?? 0;
    expect(catering(raised)).toBeCloseTo(catering(plan) * 2, -2);
  });

  it('re-splits the same budget when asked to keep it', () => {
    const plan = templatePlan(birthdayBrief);
    const kept = applyGuestChange(plan, 60, 'keep-budget', NOW);
    expect(kept.brief.budget).toBe(birthdayBrief.budget);
    expect(total(kept)).toBe(birthdayBrief.budget);
  });

  it('reschedules open tasks, but not finished ones, when the date moves', () => {
    const plan = templatePlan(birthdayBrief);
    const first = plan.tasks[0];
    if (!first) throw new Error('missing task');
    const withDone = {
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === first.id ? { ...t, done: true } : t)),
    };
    const moved = applyBriefChange(withDone, { ...birthdayBrief, date: '2026-12-21' }, TODAY, NOW);
    const cake = moved.tasks.find((t) => t.title === 'Order the cake');
    expect(cake?.due).toBe('2026-12-07');
    expect(moved.tasks.find((t) => t.id === first.id)?.due).toBe(first.due);
  });

  it('adds a custom task relative to the event date', () => {
    const plan = templatePlan(birthdayBrief);
    const next = addCustomTask(
      plan,
      { title: '  Buy candles  ', due: '2026-11-19', priority: 'low' },
      sequentialIds(),
      NOW,
    );
    expect(next.tasks.find((t) => t.custom)).toMatchObject({
      title: 'Buy candles',
      daysBefore: 2,
      custom: true,
    });
  });
});

describe('refinement', () => {
  it('sends no private vendor data or spending to the model', () => {
    const plan = templatePlan(weddingBrief);
    const withPrivate = {
      ...plan,
      vendors: plan.vendors.map((v) => ({ ...v, contact: '98765 43210', notes: 'secret' })),
      budget: plan.budget.map((l) => ({ ...l, actual: 999 })),
    };
    const context = JSON.stringify(toRefineContext(withPrivate));
    expect(context).not.toContain('98765');
    expect(context).not.toContain('secret');
    expect(context).not.toContain('"actual"');
  });

  it('keeps progress and locked lines, and drops only untouched items', () => {
    const plan = templatePlan(birthdayBrief);
    const [firstLine, secondLine] = plan.budget;
    const [doneTask, plainTask] = plan.tasks;
    const [bookedVendor] = plan.vendors;
    const [savedIdea] = plan.ideas;
    if (!firstLine || !secondLine || !doneTask || !plainTask || !bookedVendor || !savedIdea) {
      throw new Error('fixture too small');
    }
    const prepared = {
      ...setLineAmount(plan, secondLine.id, 6000, NOW),
      tasks: plan.tasks.map((t) => (t.id === doneTask.id ? { ...t, done: true } : t)),
      vendors: plan.vendors.map((v) =>
        v.id === bookedVendor.id ? { ...v, status: 'booked' as const, quote: 3000 } : v,
      ),
      ideas: plan.ideas.map((i) => (i.id === savedIdea.id ? { ...i, saved: true } : i)),
    };

    const merged = mergeRefinement(
      prepared,
      {
        message: 'Trimmed it down.',
        briefPatch: null,
        sections: {
          budget: [
            {
              id: firstLine.id,
              key: 'venue',
              category: 'Home setup',
              sharePct: 60,
              perGuest: false,
              rationale: 'r',
              estLow: 0,
              estHigh: 0,
            },
            {
              key: 'catering',
              category: 'Food',
              sharePct: 40,
              perGuest: true,
              rationale: 'r',
              estLow: 0,
              estHigh: 0,
            },
          ],
          timeline: [
            {
              id: plainTask.id,
              title: 'Renamed task',
              details: 'd',
              daysBefore: 20,
              priority: 'high',
            },
          ],
          vendors: [
            {
              category: 'Magician',
              budgetKey: 'entertainment',
              why: 'Fun',
              bookDaysBefore: 10,
              questions: ['a', 'b'],
            },
          ],
          ideas: [{ category: 'theme', title: 'Rockets', description: 'd', costTier: 'low' }],
        },
      },
      { today: TODAY, now: NOW, newId: sequentialIds('r') },
    );

    expect(merged.budget.find((l) => l.id === firstLine.id)?.category).toBe('Home setup');
    expect(merged.budget.find((l) => l.id === secondLine.id)).toMatchObject({
      locked: true,
      amount: 6000,
    });
    expect(total(merged)).toBe(birthdayBrief.budget);
    expect(merged.tasks.find((t) => t.id === plainTask.id)?.title).toBe('Renamed task');
    expect(merged.tasks.find((t) => t.id === doneTask.id)?.done).toBe(true);
    expect(merged.vendors.find((v) => v.id === bookedVendor.id)).toMatchObject({
      status: 'booked',
      quote: 3000,
    });
    expect(merged.vendors.some((v) => v.category === 'Magician')).toBe(true);
    expect(merged.ideas.map((i) => i.title)).toEqual([savedIdea.title, 'Rockets']);
    // Sections the model did not return are untouched.
    expect(merged.dayOf).toEqual(prepared.dayOf);
    expect(PlanSchema.safeParse(merged).success).toBe(true);
  });

  it('gives duplicate or unknown ids from the model fresh ids', () => {
    const plan = templatePlan(birthdayBrief);
    const known = plan.ideas[0]?.id ?? '';
    const merged = mergeRefinement(
      plan,
      {
        message: 'm',
        briefPatch: null,
        sections: {
          ideas: [
            { id: known, category: 'theme', title: 'One', description: 'd', costTier: 'low' },
            { id: known, category: 'theme', title: 'Two', description: 'd', costTier: 'low' },
            { id: 'made-up', category: 'theme', title: 'Three', description: 'd', costTier: 'low' },
          ],
        },
      },
      { today: TODAY, now: NOW, newId: sequentialIds('r') },
    );
    const ids = merged.ideas.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(known);
    expect(ids).not.toContain('made-up');
  });

  it('applies a brief patch through the same maths', () => {
    const plan = templatePlan(birthdayBrief);
    const merged = mergeRefinement(
      plan,
      {
        message: 'More guests and budget.',
        briefPatch: { guests: 45, budget: 40_000 },
        sections: {},
      },
      { today: TODAY, now: NOW, newId: sequentialIds('r') },
    );
    expect(merged.brief).toMatchObject({ guests: 45, budget: 40_000 });
    expect(total(merged)).toBe(40_000);
    const diff = diffPlans(plan, merged);
    expect(diff.brief).toEqual(['guests', 'budget']);
    expect(describeDiff(diff)).toContain('Event details changed: guests, budget.');
  });

  it('describes what changed in plain language', () => {
    const plan = templatePlan(birthdayBrief);
    expect(describeDiff(diffPlans(plan, plan))).toBe('No changes.');
    const fewer = {
      ...plan,
      ideas: plan.ideas.slice(1),
      tasks: plan.tasks.map((t, i) => (i === 0 ? { ...t, title: 'New' } : t)),
    };
    expect(describeDiff(diffPlans(plan, fewer))).toBe('Timeline: 1 updated. Ideas: 1 removed.');
  });
});
