import { addDays, diffDays } from './dates.js';
import { LIMITS } from './limits.js';
import type { Task, TaskPriority } from './schemas.js';

export const PHASES = [
  { id: 'six-months', label: '6+ months before', minDaysBefore: 180 },
  { id: 'three-months', label: '3–6 months before', minDaysBefore: 90 },
  { id: 'one-month', label: '1–3 months before', minDaysBefore: 30 },
  { id: 'weeks', label: '1–4 weeks before', minDaysBefore: 7 },
  { id: 'final-week', label: 'Final week', minDaysBefore: 1 },
  { id: 'event', label: 'Event day', minDaysBefore: 0 },
  { id: 'after', label: 'After the event', minDaysBefore: Number.NEGATIVE_INFINITY },
] as const;
export type PhaseId = (typeof PHASES)[number]['id'];

export function phaseOf(daysBefore: number): PhaseId {
  const phase = PHASES.find((p) => daysBefore >= p.minDaysBefore);
  return phase ? phase.id : 'after';
}

export type EventDateIssue = 'past' | 'too-far' | null;

export function eventDateIssue(eventDate: string, today: string): EventDateIssue {
  const days = diffDays(today, eventDate);
  if (days < 0) return 'past';
  if (days > LIMITS.horizonDays) return 'too-far';
  return null;
}

export function daysUntil(eventDate: string, today: string): number {
  return diffDays(today, eventDate);
}

export function clampDaysBefore(daysBefore: number): number {
  if (!Number.isFinite(daysBefore)) return 0;
  return Math.min(Math.max(Math.round(daysBefore), LIMITS.daysBeforeMin), LIMITS.daysBeforeMax);
}

/**
 * When a task (or a booking) should happen. If its ideal date has already gone
 * by the time the plan is made, it is due on `referenceDay` and flagged
 * "do now" rather than shown as overdue.
 */
export function schedule(
  eventDate: string,
  daysBefore: number,
  referenceDay: string,
): { due: string; doNow: boolean } {
  const ideal = addDays(eventDate, -daysBefore);
  if (daysBefore > 0 && diffDays(referenceDay, ideal) < 0) {
    return { due: referenceDay, doNow: true };
  }
  return { due: ideal, doNow: false };
}

export type TaskStatus = 'done' | 'overdue' | 'do-now' | 'due-soon' | 'upcoming';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  done: 'Done',
  overdue: 'Overdue',
  'do-now': 'Do now',
  'due-soon': 'Due this week',
  upcoming: 'Upcoming',
};

export function taskStatus(task: Pick<Task, 'done' | 'due' | 'doNow'>, today: string): TaskStatus {
  if (task.done) return 'done';
  const daysLeft = diffDays(today, task.due);
  if (daysLeft < 0) return 'overdue';
  if (task.doNow) return 'do-now';
  if (daysLeft <= 7) return 'due-soon';
  return 'upcoming';
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export function sortTasks<T extends Pick<Task, 'due' | 'priority' | 'title'>>(
  tasks: readonly T[],
): T[] {
  return [...tasks].sort(
    (a, b) =>
      a.due.localeCompare(b.due) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.title.localeCompare(b.title),
  );
}

export interface PhaseGroup<T> {
  id: PhaseId;
  label: string;
  tasks: T[];
}

/** Tasks grouped in phase order, sorted inside each phase; empty phases are skipped. */
export function groupByPhase<T extends Pick<Task, 'due' | 'priority' | 'title' | 'daysBefore'>>(
  tasks: readonly T[],
): PhaseGroup<T>[] {
  return PHASES.map((phase) => ({
    id: phase.id,
    label: phase.label,
    tasks: sortTasks(tasks.filter((task) => phaseOf(task.daysBefore) === phase.id)),
  })).filter((group) => group.tasks.length > 0);
}

export function taskProgress(tasks: readonly Pick<Task, 'done'>[]): {
  done: number;
  total: number;
  percent: number;
} {
  const done = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}
