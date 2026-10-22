import { describe, expect, it } from 'vitest';

import { AiError } from '../../src/server/ai/gemini.js';
import { createPlanner } from '../../src/server/ai/planner.js';
import { HttpError } from '../../src/server/errors.js';
import { silentLogger } from '../../src/server/logger.js';
import { toRefineContext } from '../../src/shared/plan.js';
import type { RefineRequest } from '../../src/shared/schemas.js';
import { PlanSchema } from '../../src/shared/schemas.js';
import { FakeAi, aiPlanFor, reply } from '../fixtures/ai.js';
import { NOW, TODAY, birthdayBrief, sequentialIds, templatePlan } from '../fixtures/plans.js';

function plannerWith(
  ai: FakeAi | null,
  options: { dailyCap?: number; clock?: { now: Date } } = {},
) {
  const clock = options.clock ?? { now: NOW };
  return createPlanner({
    ai,
    logger: silentLogger,
    dailyCap: options.dailyCap ?? 100,
    now: () => clock.now,
    newId: sequentialIds(),
    sleep: () => Promise.resolve(),
  });
}

const refineRequest = (instruction = 'Add a magic show'): RefineRequest => ({
  brief: birthdayBrief,
  today: TODAY,
  context: toRefineContext(templatePlan(birthdayBrief)),
  instruction,
  scope: 'ideas',
  previous: [],
});

describe('planner.plan', () => {
  it('returns a Gemini plan and caches it for identical briefs', async () => {
    const ai = new FakeAi(reply(aiPlanFor(birthdayBrief)));
    const planner = plannerWith(ai);
    const first = await planner.plan(birthdayBrief, TODAY);
    expect(first.meta).toMatchObject({ source: 'ai', cached: false, model: 'fake-gemini' });
    expect(PlanSchema.safeParse(first.plan).success).toBe(true);
    expect(ai.requests[0]?.label).toBe('plan');

    const reordered = { ...birthdayBrief, priorities: [...birthdayBrief.priorities].reverse() };
    const second = await planner.plan(reordered, TODAY);
    expect(second.meta.cached).toBe(true);
    expect(ai.calls).toBe(1);
  });

  it('shares one model call between identical concurrent requests', async () => {
    const ai = new FakeAi(reply(aiPlanFor(birthdayBrief)));
    const planner = plannerWith(ai);
    const results = await Promise.all([
      planner.plan(birthdayBrief, TODAY),
      planner.plan(birthdayBrief, TODAY),
    ]);
    expect(ai.calls).toBe(1);
    expect(results.map((r) => r.meta.source)).toEqual(['ai', 'ai']);
  });

  it('retries once after an unusable answer', async () => {
    const ai = new FakeAi(reply('not json'), reply(aiPlanFor(birthdayBrief)));
    const result = await plannerWith(ai).plan(birthdayBrief, TODAY);
    expect(ai.calls).toBe(2);
    expect(result.meta.source).toBe('ai');
  });

  it('falls back to a labelled template after two bad answers', async () => {
    const ai = new FakeAi(reply({ title: 'thin' }));
    const result = await plannerWith(ai).plan(birthdayBrief, TODAY);
    expect(ai.calls).toBe(2);
    expect(result.meta).toMatchObject({
      source: 'template',
      fallbackReason: 'The AI answer could not be used.',
    });
    expect(result.plan.source).toBe('template');
    expect(PlanSchema.safeParse(result.plan).success).toBe(true);
  });

  it('does not retry after a timeout or a safety block', async () => {
    const slow = new FakeAi(new AiError('timeout'));
    expect((await plannerWith(slow).plan(birthdayBrief, TODAY)).meta.fallbackReason).toMatch(
      /too long/,
    );
    expect(slow.calls).toBe(1);
    const blocked = new FakeAi(new AiError('blocked'));
    expect((await plannerWith(blocked).plan(birthdayBrief, TODAY)).meta.fallbackReason).toMatch(
      /could not help/,
    );
    expect(blocked.calls).toBe(1);
  });

  it('retries a rate limit once', async () => {
    const ai = new FakeAi(new AiError('rate-limit'), reply(aiPlanFor(birthdayBrief)));
    expect((await plannerWith(ai).plan(birthdayBrief, TODAY)).meta.source).toBe('ai');
    expect(ai.calls).toBe(2);
  });

  it('uses templates when AI is off or today’s cap is used up', async () => {
    expect((await plannerWith(null).plan(birthdayBrief, TODAY)).meta.fallbackReason).toMatch(
      /switched off/,
    );
    const ai = new FakeAi(reply(aiPlanFor(birthdayBrief)));
    const capped = plannerWith(ai, { dailyCap: 1 });
    await capped.plan(birthdayBrief, TODAY);
    const second = await capped.plan({ ...birthdayBrief, guests: 31 }, TODAY);
    expect(second.meta.fallbackReason).toMatch(/limit/);
    expect(ai.calls).toBe(1);
  });

  it('resets the daily cap on a new UTC day', async () => {
    const clock = { now: new Date('2026-10-22T23:00:00Z') };
    const ai = new FakeAi(reply(aiPlanFor(birthdayBrief)));
    const planner = plannerWith(ai, { dailyCap: 1, clock });
    await planner.plan(birthdayBrief, TODAY);
    clock.now = new Date('2026-10-23T01:00:00Z');
    expect((await planner.plan({ ...birthdayBrief, guests: 40 }, TODAY)).meta.source).toBe('ai');
  });

  it('opens the circuit breaker after repeated failures, then recovers', async () => {
    const clock = { now: NOW };
    const ai = new FakeAi(new AiError('server'));
    const planner = plannerWith(ai, { clock });
    for (let i = 0; i < 3; i += 1) await planner.plan({ ...birthdayBrief, guests: 10 + i }, TODAY);
    const callsWhenOpen = ai.calls;
    const fast = await planner.plan({ ...birthdayBrief, guests: 50 }, TODAY);
    expect(fast.meta.fallbackReason).toMatch(/trouble/);
    expect(ai.calls).toBe(callsWhenOpen);

    clock.now = new Date(NOW.getTime() + 61_000);
    await planner.plan({ ...birthdayBrief, guests: 51 }, TODAY);
    expect(ai.calls).toBeGreaterThan(callsWhenOpen);
  });
});

describe('planner.refine', () => {
  const ideas = aiPlanFor(birthdayBrief).ideas.slice(0, 4);

  it('returns a validated refinement and caches it', async () => {
    const ai = new FakeAi(reply({ message: 'Added a magic show.', ideas }));
    const planner = plannerWith(ai);
    const { result, meta } = await planner.refine(refineRequest());
    expect(result.sections.ideas).toHaveLength(4);
    expect(meta).toMatchObject({ source: 'ai', cached: false });
    expect((await planner.refine(refineRequest())).meta.cached).toBe(true);
    expect(ai.calls).toBe(1);
  });

  it.each([
    [new AiError('blocked'), 422, 'CONTENT_BLOCKED'],
    [new AiError('timeout'), 503, 'AI_TIMEOUT'],
    [new AiError('server'), 503, 'AI_UNAVAILABLE'],
  ])('turns %s into a visible error', async (error, status, code) => {
    const promise = plannerWith(new FakeAi(error)).refine(refineRequest());
    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toMatchObject({ status, code });
  });

  it('reports when AI is off or the quota is used', async () => {
    await expect(plannerWith(null).refine(refineRequest())).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    const ai = new FakeAi(reply({ message: 'ok', ideas }));
    const capped = plannerWith(ai, { dailyCap: 1 });
    await capped.refine(refineRequest('one'));
    await expect(capped.refine(refineRequest('two'))).rejects.toMatchObject({ code: 'AI_QUOTA' });
  });
});
