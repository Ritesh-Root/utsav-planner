import type { AiPlan, Brief } from '../schemas.js';

/** A template is plain data plus small functions that personalise it to a brief. */
export interface EventTemplate {
  budget: AiPlan['budget'];
  timeline: (brief: Brief) => AiPlan['timeline'];
  vendors: AiPlan['vendors'];
  ideas: (brief: Brief) => AiPlan['ideas'];
  dayOf: (brief: Brief) => AiPlan['dayOf'];
}

type BudgetShare = AiPlan['budget'][number];

/** Template lines carry no estimates; finalisation derives a ±range from the amount. */
const budgetShare =
  (perGuest: boolean) =>
  (
    key: BudgetShare['key'],
    category: string,
    sharePct: number,
    rationale: string,
  ): BudgetShare => ({
    key,
    category,
    sharePct,
    perGuest,
    rationale,
    estLow: 0,
    estHigh: 0,
  });

/** A budget share that stays the same whatever the guest count, e.g. the venue. */
export const fixedCost = budgetShare(false);
/** A budget share that grows with the guest count, e.g. food. */
export const perGuestCost = budgetShare(true);

/** Minutes after midnight for a clock time, e.g. `at(18, 30)`. */
export const at = (hours: number, minutes = 0) => hours * 60 + minutes;
