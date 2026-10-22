import { finalizePlan, randomId } from '../shared/plan.js';
import type { Brief, Plan } from '../shared/schemas.js';
import { buildTemplateDraft } from '../shared/templates/index.js';

export const OFFLINE_REASON =
  'Utsav’s planning service couldn’t be reached, so this plan was built on your device from templates.';

/** Loaded on demand: a complete plan built in the browser when the API is unreachable. */
export function buildOfflinePlan(brief: Brief, today: string, now = new Date()): Plan {
  return finalizePlan(buildTemplateDraft(brief), brief, {
    planId: randomId('plan'),
    today,
    now,
    source: 'template',
    fallbackReason: OFFLINE_REASON,
    model: null,
    newId: randomId,
  });
}
