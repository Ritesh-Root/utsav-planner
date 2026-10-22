import { describe, expect, it } from 'vitest';

import { computeInsights } from '../../src/shared/insights.js';
import { LIMITS } from '../../src/shared/limits.js';
import { setLineAmount } from '../../src/shared/plan.js';
import { AiPlanSchema, BriefSchema, PlanRequestSchema } from '../../src/shared/schemas.js';
import { buildTemplateDraft } from '../../src/shared/templates/index.js';
import {
  NOW,
  TODAY,
  birthdayBrief,
  communityBrief,
  templatePlan,
  weddingBrief,
} from '../fixtures/plans.js';

const ids = (plan: ReturnType<typeof templatePlan>, today = TODAY) =>
  computeInsights(plan, today).map((i) => i.id);

describe('insights', () => {
  it('switches to last-minute mode close to the event', () => {
    const soon = { ...communityBrief, date: '2026-11-01' };
    expect(ids(templatePlan(soon))).toContain('last-minute');
    expect(ids(templatePlan(weddingBrief))).not.toContain('last-minute');
  });

  it('flags over-budget plans, late tasks and vendors to book', () => {
    const plan = templatePlan(communityBrief);
    const line = plan.budget[0];
    if (!line) throw new Error('missing line');
    const over = setLineAmount(plan, line.id, communityBrief.budget * 2, NOW);
    const found = ids(over);
    expect(found).toContain('over-budget');
    expect(found).toContain('tasks-do-now');
    expect(found).toContain('book-vendors');
    expect(ids(plan, '2026-11-01')).toContain('tasks-overdue');
  });

  it('warns when spending or booked quotes outgrow the plan', () => {
    const plan = templatePlan(birthdayBrief);
    const cake = plan.vendors.find((v) => v.budgetKey === 'cake');
    const next = {
      ...plan,
      budget: plan.budget.map((l) => ({ ...l, actual: l.key === 'catering' ? 30_000 : 0 })),
      vendors: plan.vendors.map((v) =>
        v === cake ? { ...v, status: 'booked' as const, quote: 99_000 } : v,
      ),
    };
    const found = ids(next);
    expect(found).toContain('spent-over-budget');
    expect(found).toContain('quotes-over-plan');
  });

  it('flags lines planned below the typical estimate', () => {
    const plan = templatePlan(birthdayBrief);
    const next = {
      ...plan,
      budget: plan.budget.map((l, i) => (i === 0 ? { ...l, estLow: l.amount + 1 } : l)),
    };
    expect(ids(next)).toContain('below-estimate');
  });

  it('says so when everything is on track, and handles the day itself and after', () => {
    const plan = templatePlan(weddingBrief, '2026-01-01');
    expect(ids(plan, '2026-01-01')).toEqual(['on-track']);
    expect(ids(plan, weddingBrief.date)).toContain('event-today');
    expect(ids(plan, '2027-03-01')).toContain('event-passed');
  });
});

describe('templates', () => {
  it.each([weddingBrief, birthdayBrief, communityBrief])(
    'meet the same contract as Gemini output ($type)',
    (brief) => {
      const draft = buildTemplateDraft(brief);
      expect(AiPlanSchema.safeParse(draft).success).toBe(true);
      expect(draft.budget.length).toBeLessThanOrEqual(LIMITS.budgetLinesMax);
      expect(draft.timeline.length).toBeLessThanOrEqual(LIMITS.tasksMax);
      expect(draft.ideas.some((i) => i.category === 'accessibility')).toBe(true);
      expect(draft.ideas.some((i) => i.category === 'sustainability')).toBe(true);
      expect(draft.dayOf.length).toBeLessThanOrEqual(LIMITS.dayOfMax);
    },
  );

  it('personalises to the brief', () => {
    const wedding = buildTemplateDraft(weddingBrief);
    expect(wedding.ideas.find((i) => i.category === 'food')?.description).toContain('jain');
    expect(wedding.timeline.some((t) => t.title.includes('pre-wedding'))).toBe(true);
    expect(new Set(wedding.dayOf.map((d) => d.day))).toEqual(new Set([1, 2, 3]));

    const teen = buildTemplateDraft({ ...birthdayBrief, honoreeAge: 15 });
    const milestone = buildTemplateDraft({ ...birthdayBrief, honoreeAge: 60 });
    expect(teen.ideas[0]?.title).not.toBe(milestone.ideas[0]?.title);
    expect(buildTemplateDraft(communityBrief).assumptions.join(' ')).toContain('permissions');
  });

  it('keeps long multi-day community run sheets within the limit', () => {
    const draft = buildTemplateDraft({ ...communityBrief, days: 7 });
    expect(draft.dayOf.length).toBe(LIMITS.dayOfMax);
  });
});

describe('schemas', () => {
  it('accepts the sample briefs', () => {
    for (const brief of [weddingBrief, birthdayBrief, communityBrief]) {
      expect(BriefSchema.safeParse(brief).success).toBe(true);
    }
  });

  it('rejects unknown keys, bad dates, duplicates and out-of-range numbers', () => {
    expect(BriefSchema.safeParse({ ...birthdayBrief, isAdmin: true }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...birthdayBrief, date: '2026-02-30' }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...birthdayBrief, guests: 0 }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...birthdayBrief, budget: 2.5 }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...birthdayBrief, dietary: ['vegan', 'vegan'] }).success).toBe(
      false,
    );
    expect(BriefSchema.safeParse({ ...birthdayBrief, notes: 'x'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it('only allows an honoree age on birthdays', () => {
    const result = BriefSchema.safeParse({ ...weddingBrief, honoreeAge: 30 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['honoreeAge']);
  });

  it('validates the plan request wrapper', () => {
    expect(PlanRequestSchema.safeParse({ brief: birthdayBrief, today: TODAY }).success).toBe(true);
    expect(PlanRequestSchema.safeParse({ brief: birthdayBrief }).success).toBe(false);
  });
});
