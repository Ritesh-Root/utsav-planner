import { summarizeBudget } from './budget.js';
import { moneyFormatter } from './money.js';
import type { Plan } from './schemas.js';
import { daysUntil, taskStatus } from './timeline.js';
import { committedByKey, vendorState } from './vendors.js';

type InsightTone = 'alert' | 'warning' | 'info' | 'success';

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

function timingInsight(days: number): Insight | null {
  if (days < 0) {
    return {
      id: 'event-passed',
      tone: 'info',
      text: 'The event date has passed. Wrap up the after-event tasks and payments.',
    };
  }
  if (days === 0) return { id: 'event-today', tone: 'info', text: 'It is the big day. Enjoy it!' };
  if (days > LAST_MINUTE_DAYS) return null;
  return {
    id: 'last-minute',
    tone: 'warning',
    text: `Last-minute mode: ${plural(days, 'day')} to go. Focus on high-priority tasks and confirmed bookings.`,
  };
}

function spendingInsights(plan: Plan): Insight[] {
  const { brief } = plan;
  const money = moneyFormatter(brief.currency);
  const summary = summarizeBudget(plan.budget, brief.budget, brief.guests);
  const insights: Insight[] = [];
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
  return insights;
}

function estimateInsights(plan: Plan): Insight[] {
  const committed = committedByKey(plan.vendors);
  const overCommitted = plan.budget.filter((line) => (committed[line.key] ?? 0) > line.amount);
  const underEstimate = plan.budget.filter(
    (line) => !line.locked && line.estLow > 0 && line.amount < line.estLow,
  );
  const insights: Insight[] = [];
  if (overCommitted.length > 0) {
    insights.push({
      id: 'quotes-over-plan',
      tone: 'warning',
      text: `Booked quotes are higher than planned for ${listNames(overCommitted.map((l) => l.category))}.`,
    });
  }
  if (underEstimate.length > 0) {
    insights.push({
      id: 'below-estimate',
      tone: 'warning',
      text: `${listNames(underEstimate.map((l) => l.category))} ${underEstimate.length === 1 ? 'is' : 'are'} planned below the typical local estimate. Check prices early.`,
    });
  }
  return insights;
}

function taskInsights(plan: Plan, today: string): Insight[] {
  const statuses = plan.tasks.map((task) => taskStatus(task, today));
  const overdue = statuses.filter((s) => s === 'overdue').length;
  const doNow = statuses.filter((s) => s === 'do-now').length;
  const insights: Insight[] = [];
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
  return insights;
}

function vendorInsight(plan: Plan, today: string): Insight | null {
  const toBook = plan.vendors.filter((vendor) => {
    const state = vendorState(vendor, today);
    return state === 'overdue' || state === 'book-soon';
  });
  if (toBook.length === 0) return null;
  return {
    id: 'book-vendors',
    tone: 'warning',
    text: `Book soon: ${listNames(toBook.map((v) => v.category))}.`,
  };
}

const needsAction = (insight: Insight) => insight.tone === 'alert' || insight.tone === 'warning';

/** Plain-language nudges shown on the Overview, most urgent first. */
export function computeInsights(plan: Plan, today: string): Insight[] {
  const insights = [
    timingInsight(daysUntil(plan.brief.date, today)),
    ...spendingInsights(plan),
    ...estimateInsights(plan),
    ...taskInsights(plan, today),
    vendorInsight(plan, today),
  ].filter((insight) => insight !== null);
  if (!insights.some(needsAction)) {
    insights.push({ id: 'on-track', tone: 'success', text: 'Everything is on track.' });
  }
  return insights;
}
