import { formatMoney } from '../money.js';
import type { AiPlan, Brief, EventType } from '../schemas.js';
import { birthdayTemplate } from './birthday.js';
import { communityTemplate } from './community.js';
import type { EventTemplate } from './types.js';
import { weddingTemplate } from './wedding.js';

const TEMPLATES: Record<EventType, EventTemplate> = {
  wedding: weddingTemplate,
  birthday: birthdayTemplate,
  community: communityTemplate,
};

const TYPE_NAMES: Record<EventType, string> = {
  wedding: 'wedding',
  birthday: 'birthday',
  community: 'community event',
};

/**
 * A complete, sensible plan without any AI call. Used when Gemini is off, slow
 * or returns something unusable, and in the browser when the server is down.
 */
export function buildTemplateDraft(brief: Brief): AiPlan {
  const template = TEMPLATES[brief.type];
  const days = brief.days > 1 ? `${brief.days}-day ` : '';
  const money = formatMoney(brief.budget, brief.currency);
  const assumptions = [
    'Costs are rough planning figures, not vendor quotes.',
    `Planned for about ${brief.guests} guests in ${brief.location}.`,
  ];
  if (brief.venue !== 'either') assumptions.push(`You prefer an ${brief.venue} venue.`);
  if (brief.type === 'community') {
    assumptions.push('Check which local permissions apply to your event.');
  }

  return {
    title: `${brief.title}: plan`,
    summary: `A ${days}${TYPE_NAMES[brief.type]} plan for ${brief.guests} guests in ${brief.location} with a ${money} budget. Adjust any number or ask Utsav to refine it.`,
    assumptions,
    budget: template.budget,
    timeline: template.timeline(brief),
    vendors: template.vendors,
    ideas: template.ideas(brief),
    dayOf: template.dayOf(brief),
  };
}
