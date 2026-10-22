import { clampStartMinute } from '../../src/shared/dates.js';
import { describe, expect, it } from 'vitest';

import {
  clampBookDays,
  clampDay,
  clampDaysBefore,
  daysUntil,
  eventDateIssue,
  groupByPhase,
  phaseOf,
  schedule,
  sortTasks,
  taskProgress,
  taskStatus,
} from '../../src/shared/timeline.js';

describe('timeline', () => {
  it('maps lead times to phases, including after the event', () => {
    expect(phaseOf(300)).toBe('six-months');
    expect(phaseOf(180)).toBe('six-months');
    expect(phaseOf(120)).toBe('three-months');
    expect(phaseOf(45)).toBe('one-month');
    expect(phaseOf(7)).toBe('weeks');
    expect(phaseOf(3)).toBe('final-week');
    expect(phaseOf(0)).toBe('event');
    expect(phaseOf(-5)).toBe('after');
  });

  it('schedules backwards from the event date', () => {
    expect(schedule('2027-02-14', 30, '2026-10-22')).toEqual({ due: '2027-01-15', doNow: false });
    expect(schedule('2027-02-14', -3, '2026-10-22')).toEqual({ due: '2027-02-17', doNow: false });
    expect(schedule('2027-02-14', 0, '2026-10-22')).toEqual({ due: '2027-02-14', doNow: false });
  });

  it('marks tasks whose ideal date has passed as "do now", due today', () => {
    expect(schedule('2026-11-08', 90, '2026-10-22')).toEqual({ due: '2026-10-22', doNow: true });
  });

  it('works out task status from the date and completion', () => {
    const today = '2026-10-22';
    expect(taskStatus({ done: true, due: '2026-10-01', doNow: false }, today)).toBe('done');
    expect(taskStatus({ done: false, due: '2026-10-21', doNow: true }, today)).toBe('overdue');
    expect(taskStatus({ done: false, due: '2026-10-22', doNow: true }, today)).toBe('do-now');
    expect(taskStatus({ done: false, due: '2026-10-29', doNow: false }, today)).toBe('due-soon');
    expect(taskStatus({ done: false, due: '2026-12-01', doNow: false }, today)).toBe('upcoming');
  });

  it('rejects past events and events beyond the planning horizon', () => {
    expect(eventDateIssue('2026-10-21', '2026-10-22')).toBe('past');
    expect(eventDateIssue('2026-10-22', '2026-10-22')).toBeNull();
    expect(eventDateIssue('2030-01-01', '2026-10-22')).toBe('too-far');
    expect(daysUntil('2026-11-21', '2026-10-22')).toBe(30);
  });

  it('clamps lead times into the supported range', () => {
    expect(clampDaysBefore(5000)).toBe(1095);
    expect(clampDaysBefore(-100)).toBe(-30);
    expect(clampDaysBefore(Number.NaN)).toBe(0);
    expect(clampDaysBefore(12.6)).toBe(13);
  });

  it('sorts by date, then priority, then title, and groups by phase', () => {
    const tasks = [
      { title: 'B', due: '2026-11-01', priority: 'low' as const, daysBefore: 7 },
      { title: 'A', due: '2026-11-01', priority: 'high' as const, daysBefore: 7 },
      { title: 'C', due: '2026-10-25', priority: 'medium' as const, daysBefore: 14 },
      { title: 'Thanks', due: '2026-11-12', priority: 'low' as const, daysBefore: -4 },
    ];
    expect(sortTasks(tasks).map((t) => t.title)).toEqual(['C', 'A', 'B', 'Thanks']);
    const groups = groupByPhase(tasks);
    expect(groups.map((g) => g.id)).toEqual(['weeks', 'after']);
    expect(groups[0]?.tasks.map((t) => t.title)).toEqual(['C', 'A', 'B']);
  });

  it('reports progress without dividing by zero', () => {
    expect(taskProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(taskProgress([{ done: true }, { done: false }, { done: false }])).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
  });
});

describe('clamps shared by the AI normaliser and the plan builder', () => {
  it('keeps run-sheet days, times and booking lead times in range', () => {
    expect(clampDay(0, 3)).toBe(1);
    expect(clampDay(2.6, 3)).toBe(3);
    expect(clampDay(9, 3)).toBe(3);
    expect(clampStartMinute(-10)).toBe(0);
    expect(clampStartMinute(5000)).toBe(1439);
    expect(clampStartMinute(630.4)).toBe(630);
    expect(clampBookDays(-20)).toBe(0);
    expect(clampBookDays(45)).toBe(45);
  });
});
