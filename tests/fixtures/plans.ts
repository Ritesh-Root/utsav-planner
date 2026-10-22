import type { IdFactory } from '../../src/shared/plan.js';
import { finalizePlan } from '../../src/shared/plan.js';
import type { Brief, Plan } from '../../src/shared/schemas.js';
import { buildTemplateDraft } from '../../src/shared/templates/index.js';

export const TODAY = '2026-10-22';
export const NOW = new Date('2026-10-22T06:30:00.000Z');

/**
 * Ids like `task-1`, `task-2`… so tests can assert on them. Give later factories
 * a namespace so their ids never collide with the fixture's.
 */
export function sequentialIds(namespace = ''): IdFactory {
  const counters = new Map<string, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${namespace}${next}`;
  };
}

export const weddingBrief: Brief = {
  type: 'wedding',
  title: 'Asha & Rohan wedding',
  date: '2027-02-14',
  location: 'Jaipur',
  guests: 250,
  budget: 1_500_000,
  currency: 'INR',
  venue: 'outdoor',
  style: 'Royal pastel',
  priorities: ['food', 'photography'],
  dietary: ['vegetarian', 'jain'],
  days: 3,
  honoreeAge: null,
  notes: 'Grandparents use wheelchairs.',
};

export const birthdayBrief: Brief = {
  type: 'birthday',
  title: "Mira's 7th birthday",
  date: '2026-11-21',
  location: 'Pune',
  guests: 30,
  budget: 25_000,
  currency: 'INR',
  venue: 'indoor',
  style: 'Space explorers',
  priorities: ['entertainment'],
  dietary: ['nut-free'],
  days: 1,
  honoreeAge: 7,
  notes: '',
};

export const communityBrief: Brief = {
  type: 'community',
  title: 'Green Park Diwali mela',
  date: '2026-11-08',
  location: 'Green Park, Delhi',
  guests: 500,
  budget: 200_000,
  currency: 'INR',
  venue: 'outdoor',
  style: 'Festival of lights',
  priorities: ['sustainability', 'guest-comfort'],
  dietary: ['vegetarian'],
  days: 1,
  honoreeAge: null,
  notes: '',
};

export function templatePlan(brief: Brief = birthdayBrief, today = TODAY): Plan {
  return finalizePlan(buildTemplateDraft(brief), brief, {
    planId: 'plan-1',
    today,
    now: NOW,
    source: 'template',
    fallbackReason: null,
    model: null,
    newId: sequentialIds(),
  });
}
