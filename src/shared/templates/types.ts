import type { AiPlan, Brief } from '../schemas.js';

/** A template is plain data plus small functions that personalise it to a brief. */
export interface EventTemplate {
  budget: AiPlan['budget'];
  timeline: (brief: Brief) => AiPlan['timeline'];
  vendors: AiPlan['vendors'];
  ideas: (brief: Brief) => AiPlan['ideas'];
  dayOf: (brief: Brief) => AiPlan['dayOf'];
}

/** Template lines carry no estimates; finalisation derives a ±range from the amount. */
export const share = (
  key: AiPlan['budget'][number]['key'],
  category: string,
  sharePct: number,
  perGuest: boolean,
  rationale: string,
): AiPlan['budget'][number] => ({
  key,
  category,
  sharePct,
  perGuest,
  rationale,
  estLow: 0,
  estHigh: 0,
});

export const at = (hours: number, minutes = 0) => hours * 60 + minutes;
