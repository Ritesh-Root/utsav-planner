import { summarizeBudget } from './budget.js';
import { formatMoney } from './money.js';
import type { Plan } from './schemas.js';
import { daysUntil, taskStatus } from './timeline.js';
import { committedByKey, vendorState } from './vendors.js';

export type InsightTone = 'alert' | 'warning' | 'info' | 'success';

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
}

/** Events this close switch the assistant into last-minute mode. */
const LAST_MINUTE_DAYS = 14;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function listNames(names: string[], max = 3): string {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

/** Plain-language nudges shown on the Overview, most urgent first. */
export function computeInsights(plan: Plan, today: string): Insight[] {
  const { brief } = plan;
  const money = (value: number) => formatMoney(value, brief.currency);
  const insights: Insight[] = [];
  const days = daysUntil(brief.date, today);

  if (days < 0) {
    insights.push({
      id: 'event-passed',
      tone: 'info',
      text: 'The event date has passed. Wrap up the after-event tasks and payments.',
    });
  } else if (days === 0) {
    insights.push({ id: 'event-today', tone: 'info', text: 'It is the big day. Enjoy it!' });
  } else if (days <= LAST_MINUTE_DAYS) {
    insights.push({
      id: 'last-minute',
      tone: 'warning',
      text: `Last-minute mode: ${plural(days, 'day')} to go. Focus on high-priority tasks and confirmed bookings.`,
    });
  }

  const summary = summarizeBudget(plan.budget, brief.budget, brief.guests);
  if (summary.overBy > 0) {
    insights.push({
      id: 'over-budget',
      tone: 'alert',
      text: `Planned spending is ${money(summary.overBy)} over your ${money(brief.budget)} budget.`,
    });
  }
  if (summary.actual > brief.budget) {
    insights.push({
      id: 'spent-over-budget',
      tone: 'alert',
      text: `Money spent so far (${money(summary.actual)}) is more than the total budget.`,
    });
  }

  const committed = committedByKey(plan.vendors);
  const overCommitted = plan.budget.filter((line) => (committed[line.key] ?? 0) > line.amount);
  if (overCommitted.length > 0) {
    insights.push({
      id: 'quotes-over-plan',
      tone: 'warning',
      text: `Booked quotes are higher than planned for ${listNames(overCommitted.map((l) => l.category))}.`,
    });
  }

  const underEstimate = plan.budget.filter(
    (line) => !line.locked && line.estLow > 0 && line.amount < line.estLow,
  );
  if (underEstimate.length > 0) {
    insights.push({
      id: 'below-estimate',
      tone: 'warning',
      text: `${listNames(underEstimate.map((l) => l.category))} ${underEstimate.length === 1 ? 'is' : 'are'} planned below the typical local estimate. Check prices early.`,
    });
  }

  const statuses = plan.tasks.map((task) => taskStatus(task, today));
  const overdue = statuses.filter((s) => s === 'overdue').length;
  const doNow = statuses.filter((s) => s === 'do-now').length;
  if (overdue > 0) {
    insights.push({
      id: 'tasks-overdue',
      tone: 'alert',
      text: `${plural(overdue, 'task')} overdue.`,
    });
  }
  if (doNow > 0) {
    insights.push({
      id: 'tasks-do-now',
      tone: 'warning',
      text: `${plural(doNow, 'task')} should be done now: the ideal time for ${doNow === 1 ? 'it has' : 'them has'} already passed.`,
    });
  }

  const toBook = plan.vendors.filter((vendor) => {
    const state = vendorState(vendor, today);
    return state === 'overdue' || state === 'book-soon';
  });
  if (toBook.length > 0) {
    insights.push({
      id: 'book-vendors',
      tone: 'warning',
      text: `Book soon: ${listNames(toBook.map((v) => v.category))}.`,
    });
  }

  if (!insights.some((insight) => insight.tone === 'alert' || insight.tone === 'warning')) {
    insights.push({ id: 'on-track', tone: 'success', text: 'Everything is on track.' });
  }
  return insights;
}
