import { useMemo } from 'react';

import { summarizeBudget } from '../../shared/budget.js';
import { formatDate, formatMinutes } from '../../shared/dates.js';
import { computeInsights } from '../../shared/insights.js';
import { formatMoney } from '../../shared/money.js';
import { sortTasks, taskProgress } from '../../shared/timeline.js';
import { vendorProgress, vendorState } from '../../shared/vendors.js';
import { Money, Pill, Track } from '../components/Display';
import { COST_TIER_LABELS, IDEA_CATEGORY_LABELS, VENDOR_STATUS_LABELS, pluralize } from '../labels';
import { TaskRow, useTaskActions } from './TaskRow';
import type { PanelProps } from './types';

const TONE = {
  alert: 'negative',
  warning: 'warning',
  info: 'neutral',
  success: 'positive',
} as const;

/** The plan at a glance: what to do next, money, vendors, ideas, notes and the run sheet. */
export default function OverviewPanel({ plan, today, update, goTo }: PanelProps) {
  const { onToggle } = useTaskActions({ plan, update });
  const { brief } = plan;
  const budget = useMemo(
    () => summarizeBudget(plan.budget, brief.budget, brief.guests),
    [plan.budget, brief],
  );
  const insights = useMemo(() => computeInsights(plan, today), [plan, today]);
  const progress = taskProgress(plan.tasks);
  const nextTasks = useMemo(
    () => sortTasks(plan.tasks.filter((t) => !t.done)).slice(0, 5),
    [plan.tasks],
  );
  const vendors = vendorProgress(plan.vendors);
  const toBook = plan.vendors
    .filter((v) => v.status !== 'booked' && v.status !== 'not-needed')
    .slice(0, 4);
  const saved = plan.ideas.filter((idea) => idea.saved);
  const ideas = (saved.length > 0 ? saved : plan.ideas).slice(0, 4);
  const firstDay = plan.dayOf.filter((item) => item.day === 1).slice(0, 6);

  return (
    <div className="grid">
      <section className="panel span-6 stretch" aria-labelledby="ov-tasks">
        <div className="panel-head">
          <h2 id="ov-tasks" className="panel-title">
            Next up
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              goTo('timeline');
            }}
          >
            Full timeline
          </button>
        </div>
        <p className="panel-figure">{pluralize(progress.total - progress.done, 'task')} to do</p>
        <p className="panel-caption">
          {progress.done} of {progress.total} done
        </p>
        {nextTasks.length === 0 ? (
          <p className="empty">Every task is done. Enjoy the celebration.</p>
        ) : (
          <ul className="rows">
            {nextTasks.map((task) => (
              <TaskRow key={task.id} task={task} today={today} onToggle={onToggle} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel span-6 stretch" aria-labelledby="ov-budget">
        <div className="panel-head">
          <h2 id="ov-budget" className="panel-title">
            Budget
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              goTo('budget');
            }}
          >
            Full budget
          </button>
        </div>
        <p className="panel-figure">
          <Money amount={budget.planned} currency={brief.currency} />
        </p>
        <p className="panel-caption">
          planned of {formatMoney(brief.budget, brief.currency)} ·{' '}
          {formatMoney(budget.plannedPerGuest, brief.currency)} per guest
        </p>
        <Track
          value={budget.planned}
          max={Math.max(brief.budget, budget.planned)}
          secondary={budget.actual}
          over={budget.overBy > 0}
          label={`${formatMoney(budget.planned, brief.currency)} planned and ${formatMoney(budget.actual, brief.currency)} spent of ${formatMoney(brief.budget, brief.currency)}`}
        />
        <ul className="rows">
          {[...plan.budget]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 4)
            .map((line) => (
              <li key={line.id} className="row">
                <span className="row-title">{line.category}</span>
                <span className="num">{formatMoney(line.amount, brief.currency)}</span>
              </li>
            ))}
        </ul>
      </section>

      <section className="panel span-6 stretch" aria-labelledby="ov-vendors">
        <div className="panel-head">
          <h2 id="ov-vendors" className="panel-title">
            Vendors
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              goTo('vendors');
            }}
          >
            All vendors
          </button>
        </div>
        <p className="panel-figure">
          {vendors.booked} of {vendors.needed} booked
        </p>
        {toBook.length === 0 ? (
          <p className="empty">Every vendor you need is booked.</p>
        ) : (
          <ul className="rows">
            {toBook.map((vendor) => {
              const state = vendorState(vendor, today);
              return (
                <li key={vendor.id} className="row">
                  <div className="row-main">
                    <span className="row-title">{vendor.category}</span>
                    <span className="row-sub">
                      Book by {formatDate(vendor.bookBy)} · {VENDOR_STATUS_LABELS[vendor.status]}
                    </span>
                  </div>
                  {state === 'overdue' && <Pill tone="negative">Book now</Pill>}
                  {state === 'book-soon' && <Pill tone="warning">Book soon</Pill>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel span-6 stretch" aria-labelledby="ov-ideas">
        <div className="panel-head">
          <h2 id="ov-ideas" className="panel-title">
            {saved.length > 0 ? 'Ideas you saved' : 'Ideas for you'}
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              goTo('ideas');
            }}
          >
            All ideas
          </button>
        </div>
        <p className="panel-figure">{pluralize(plan.ideas.length, 'idea')}</p>
        <ul className="rows">
          {ideas.map((idea) => (
            <li key={idea.id} className="row">
              <div className="row-main">
                <span className="row-title">{idea.title}</span>
                <span className="row-sub">
                  {IDEA_CATEGORY_LABELS[idea.category]} · {COST_TIER_LABELS[idea.costTier]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel span-6 stretch" aria-labelledby="ov-notes">
        <h2 id="ov-notes" className="panel-title">
          Utsav’s notes
        </h2>
        <ul className="rows">
          {insights.map((insight) => (
            <li key={insight.id} className="row">
              <span>{insight.text}</span>
              <Pill tone={TONE[insight.tone]}>
                {insight.tone === 'alert'
                  ? 'Act now'
                  : insight.tone === 'warning'
                    ? 'Soon'
                    : insight.tone === 'success'
                      ? 'Good'
                      : 'Note'}
              </Pill>
            </li>
          ))}
        </ul>
        {plan.assumptions.length > 0 && (
          <details>
            <summary>What Utsav assumed</summary>
            <ul className="questions">
              {plan.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel span-6 stretch" aria-labelledby="ov-dayof">
        <div className="panel-head">
          <h2 id="ov-dayof" className="panel-title">
            {brief.days > 1 ? 'Run sheet, day 1' : 'Run sheet'}
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              goTo('timeline');
            }}
          >
            Full run sheet
          </button>
        </div>
        <ul className="rows">
          {firstDay.map((item) => (
            <li key={item.id} className="row time-row">
              <time className="num">{formatMinutes(item.startMinute)}</time>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
