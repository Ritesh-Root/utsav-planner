import { describe, expect, it } from 'vitest';

import {
  InvalidOutputError,
  normalizePlanDraft,
  normalizeRefine,
} from '../../src/server/ai/normalize.js';
import { AiPlanSchema } from '../../src/shared/schemas.js';
import { aiPlanFor } from '../fixtures/ai.js';
import { TODAY, birthdayBrief, weddingBrief } from '../fixtures/plans.js';

describe('normalizePlanDraft', () => {
  it('accepts a well-formed plan unchanged in shape', () => {
    const draft = normalizePlanDraft(aiPlanFor(weddingBrief), weddingBrief);
    expect(AiPlanSchema.safeParse(draft).success).toBe(true);
    expect(draft.vendors.length).toBe(aiPlanFor(weddingBrief).vendors.length);
  });

  it('scrubs contact details, links and markdown from a malicious answer', () => {
    const raw = aiPlanFor(birthdayBrief);
    raw.vendors[0] = {
      ...raw.vendors[0]!,
      category: '**Sweet Treats Bakery** www.sweet.example',
      why: 'Call 98765 43210 or mail sales@sweet.example today',
    };
    raw.ideas[0] = { ...raw.ideas[0]!, description: 'Visit https://evil.example/\u202Ex now' };
    const draft = normalizePlanDraft(raw, birthdayBrief);
    const text = JSON.stringify(draft);
    expect(text).not.toMatch(/98765|@|https?:|www\.|\*\*|\u202E/);
    expect(draft.vendors[0]?.category).toBe('Sweet Treats Bakery');
  });

  it('clamps numbers and merges duplicate contingency lines', () => {
    const raw = aiPlanFor(birthdayBrief);
    raw.budget.push({ ...raw.budget.at(-1)!, category: 'Extra buffer', sharePct: 4 });
    raw.budget[0] = { ...raw.budget[0]!, sharePct: 400, estLow: -5, estHigh: 1e12 };
    raw.timeline[0] = { ...raw.timeline[0]!, daysBefore: 99_999 };
    raw.dayOf[0] = { ...raw.dayOf[0]!, day: 9, startMinute: 5000 };
    const draft = normalizePlanDraft(raw, birthdayBrief);
    expect(draft.budget.filter((l) => l.key === 'contingency')).toHaveLength(1);
    expect(draft.budget[0]).toMatchObject({
      sharePct: 100,
      estLow: 0,
      estHigh: birthdayBrief.budget * 3,
    });
    expect(draft.timeline.find((t) => t.daysBefore === 1095)).toBeDefined();
    expect(draft.dayOf[0]).toMatchObject({ day: 1, startMinute: 1439 });
  });

  it('removes duplicate titles', () => {
    const raw = aiPlanFor(weddingBrief);
    raw.ideas.push({ ...raw.ideas[0]!, title: raw.ideas[0]!.title.toUpperCase() });
    expect(normalizePlanDraft(raw, weddingBrief).ideas).toHaveLength(raw.ideas.length - 1);
  });

  it('rejects answers that do not match the schema or are too thin', () => {
    expect(() => normalizePlanDraft({ title: 'x' }, birthdayBrief)).toThrow(InvalidOutputError);
    const thin = aiPlanFor(birthdayBrief);
    thin.vendors = thin.vendors.map((v) => ({ ...v, category: 'Same vendor' }));
    expect(() => normalizePlanDraft(thin, birthdayBrief)).toThrow(/too few vendors/);
    const zero = aiPlanFor(birthdayBrief);
    zero.budget = zero.budget.map((l) => ({ ...l, sharePct: 0 }));
    expect(() => normalizePlanDraft(zero, birthdayBrief)).toThrow(/all zero/);
  });
});

describe('normalizeRefine', () => {
  const ideas = aiPlanFor(birthdayBrief).ideas.slice(0, 4);

  it('keeps only sections the scope allows', () => {
    const result = normalizeRefine(
      { message: 'Done', ideas, budget: aiPlanFor(birthdayBrief).budget },
      'ideas',
      birthdayBrief,
      TODAY,
    );
    expect(Object.keys(result.sections)).toEqual(['ideas']);
    expect(result.message).toBe('Done');
  });

  it('requires the scoped section and enough items in each section', () => {
    expect(() => normalizeRefine({ message: 'm' }, 'ideas', birthdayBrief, TODAY)).toThrow(
      /missing the ideas section/,
    );
    expect(() =>
      normalizeRefine({ message: 'm', ideas: ideas.slice(0, 1) }, 'all', birthdayBrief, TODAY),
    ).toThrow(/too few ideas/);
  });

  it('keeps only valid brief changes', () => {
    const result = normalizeRefine(
      {
        message: 'm',
        briefPatch: { guests: 45, budget: -10, date: '2020-01-01', location: ' Mumbai ', days: 99 },
      },
      'all',
      birthdayBrief,
      TODAY,
    );
    expect(result.briefPatch).toEqual({ guests: 45, location: 'Mumbai' });
    expect(
      normalizeRefine({ message: 'm', briefPatch: { budget: 0 } }, 'all', birthdayBrief, TODAY)
        .briefPatch,
    ).toBeNull();
  });

  it('drops oversized ids and fills an empty message', () => {
    const result = normalizeRefine(
      {
        message: '***',
        ideas: ideas.map((idea, i) => ({ ...idea, id: i === 0 ? 'x'.repeat(65) : `idea-${i}` })),
      },
      'all',
      birthdayBrief,
      TODAY,
    );
    expect(result.sections.ideas?.[0]?.id).toBeUndefined();
    expect(result.sections.ideas?.[1]?.id).toBe('idea-1');
    expect(result.message).toBe('Updated your plan.');
  });

  it('keeps every returned section for the whole plan, within patched limits', () => {
    const draft = aiPlanFor(weddingBrief);
    const result = normalizeRefine(
      {
        message: 'More days',
        briefPatch: { days: 2, budget: 100 },
        budget: draft.budget,
        timeline: draft.timeline,
        vendors: draft.vendors,
        dayOf: [...draft.dayOf, { day: 5, startMinute: 600, title: 'Extra' }],
      },
      'all',
      weddingBrief,
      TODAY,
    );
    expect(Object.keys(result.sections).sort()).toEqual(['budget', 'dayOf', 'timeline', 'vendors']);
    expect(result.sections.dayOf?.every((d) => d.day <= 2)).toBe(true);
    // Estimates are capped against the patched budget, not the old one.
    expect(result.sections.budget?.every((l) => l.estHigh <= 300)).toBe(true);
  });

  it('sizes sections by the current brief when a brief change is rejected', () => {
    const draft = aiPlanFor(weddingBrief);
    const result = normalizeRefine(
      {
        message: 'm',
        briefPatch: { days: 0, budget: 0 },
        budget: draft.budget,
        dayOf: [{ day: weddingBrief.days, startMinute: 600, title: 'Last day' }],
      },
      'all',
      weddingBrief,
      TODAY,
    );
    expect(result.briefPatch).toBeNull();
    expect(result.sections.dayOf?.[0]?.day).toBe(weddingBrief.days);
    expect(result.sections.budget?.some((line) => line.estHigh > 0)).toBe(true);
  });

  it('rejects a malformed refinement', () => {
    expect(() => normalizeRefine({ nope: true }, 'all', birthdayBrief, TODAY)).toThrow(
      InvalidOutputError,
    );
  });
});
