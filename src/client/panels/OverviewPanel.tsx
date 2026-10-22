import { useMemo } from 'react';

import { summarizeBudget } from '../../shared/budget.js';
import { formatDate, formatMinutes } from '../../shared/dates.js';
import type { Insight } from '../../shared/insights.js';
import { computeInsights } from '../../shared/insights.js';
import { moneyFormatter } from '../../shared/money.js';
import { sortTasks, taskProgress } from '../../shared/timeline.js';
import { vendorProgress, vendorState } from '../../shared/vendors.js';
import { Money, Pill, Track, VendorStatePill } from '../components/Display';
import { LinkButton, Panel } from '../components/Layout';
import { COST_TIER_LABELS, IDEA_CATEGORY_LABELS, VENDOR_STATUS_LABELS, pluralize } from '../labels';
import { TaskRow, useTaskActions } from './TaskRow';
import type { PlanTab } from '../router';
import type { PanelProps } from './types';

type CardProps = Pick<PanelProps, 'plan' | 'today' | 'goTo'>;

const INSIGHT_PILLS: Record<
  Insight['tone'],
  { tone: 'negative' | 'warning' | 'neutral' | 'positive'; text: string }
> = {
  alert: { tone: 'negative', text: 'Act now' },
  warning: { tone: 'warning', text: 'Soon' },
  info: { tone: 'neutral', text: 'Note' },
  success: { tone: 'positive', text: 'Good' },
};

const CARD = 'span-6 stretch';

/** A quiet link to another tab of this plan. */
function TabLink({
  goTo,
  tab,
  children,
}: Pick<PanelProps, 'goTo'> & { tab: PlanTab; children: string }) {
  return (
    <LinkButton
      onClick={() => {
        goTo(tab);
      }}
    >
      {children}
    </LinkButton>
  );
}

function NextUpCard({ plan, today, goTo, update }: CardProps & Pick<PanelProps, 'update'>) {
  const { onToggle } = useTaskActions({ plan, update });
  const progress = taskProgress(plan.tasks);
  const nextTasks = useMemo(
    () => sortTasks(plan.tasks.filter((t) => !t.done)).slice(0, 5),
    [plan.tasks],
  );
  const link = (
    <TabLink goTo={goTo} tab="timeline">
      Full timeline
    </TabLink>
  );
  return (
    <Panel id="ov-tasks" title="Next up" className={CARD} action={link}>
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
    </Panel>
  );
}

function BudgetCard({ plan, goTo }: CardProps) {
  const { brief } = plan;
  const money = moneyFormatter(brief.currency);
  const budget = useMemo(
    () => summarizeBudget(plan.budget, brief.budget, brief.guests),
    [plan.budget, brief],
  );
  const largest = [...plan.budget].sort((a, b) => b.amount - a.amount).slice(0, 4);
  const link = (
    <TabLink goTo={goTo} tab="budget">
      Full budget
    </TabLink>
  );
  return (
    <Panel id="ov-budget" title="Budget" className={CARD} action={link}>
      <p className="panel-figure">
        <Money amount={budget.planned} currency={brief.currency} />
      </p>
      <p className="panel-caption">
        planned of {money(brief.budget)} · {money(budget.plannedPerGuest)} per guest
      </p>
      <Track
        value={budget.planned}
        max={Math.max(brief.budget, budget.planned)}
        secondary={budget.actual}
        over={budget.overBy > 0}
        label={`${money(budget.planned)} planned and ${money(budget.actual)} spent of ${money(brief.budget)}`}
      />
      <ul className="rows">
        {largest.map((line) => (
          <li key={line.id} className="row">
            <span className="row-title">{line.category}</span>
            <span className="num">{money(line.amount)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function VendorsCard({ plan, today, goTo }: CardProps) {
  const progress = vendorProgress(plan.vendors);
  const toBook = plan.vendors
    .filter((v) => v.status !== 'booked' && v.status !== 'not-needed')
    .slice(0, 4);
  const link = (
    <TabLink goTo={goTo} tab="vendors">
      All vendors
    </TabLink>
  );
  return (
    <Panel id="ov-vendors" title="Vendors" className={CARD} action={link}>
      <p className="panel-figure">
        {progress.booked} of {progress.needed} booked
      </p>
      {toBook.length === 0 ? (
        <p className="empty">Every vendor you need is booked.</p>
      ) : (
        <ul className="rows">
          {toBook.map((vendor) => (
            <li key={vendor.id} className="row">
              <div className="row-main">
                <span className="row-title">{vendor.category}</span>
                <span className="row-sub">
                  Book by {formatDate(vendor.bookBy)} · {VENDOR_STATUS_LABELS[vendor.status]}
                </span>
              </div>
              <VendorStatePill state={vendorState(vendor, today)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function IdeasCard({ plan, goTo }: CardProps) {
  const saved = plan.ideas.filter((idea) => idea.saved);
  const ideas = (saved.length > 0 ? saved : plan.ideas).slice(0, 4);
  const link = (
    <TabLink goTo={goTo} tab="ideas">
      All ideas
    </TabLink>
  );
  const title = saved.length > 0 ? 'Ideas you saved' : 'Ideas for you';
  return (
    <Panel id="ov-ideas" title={title} className={CARD} action={link}>
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
    </Panel>
  );
}

function NotesCard({ plan, today }: CardProps) {
  const insights = useMemo(() => computeInsights(plan, today), [plan, today]);
  return (
    <Panel id="ov-notes" title="Utsav’s notes" className={CARD}>
      <ul className="rows">
        {insights.map((insight) => (
          <li key={insight.id} className="row">
            <span>{insight.text}</span>
            <Pill tone={INSIGHT_PILLS[insight.tone].tone}>{INSIGHT_PILLS[insight.tone].text}</Pill>
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
    </Panel>
  );
}

function RunSheetCard({ plan, goTo }: CardProps) {
  const firstDay = plan.dayOf.filter((item) => item.day === 1).slice(0, 6);
  const link = (
    <TabLink goTo={goTo} tab="timeline">
      Full run sheet
    </TabLink>
  );
  const title = plan.brief.days > 1 ? 'Run sheet, day 1' : 'Run sheet';
  return (
    <Panel id="ov-dayof" title={title} className={CARD} action={link}>
      <ul className="rows">
        {firstDay.map((item) => (
          <li key={item.id} className="row time-row">
            <time className="num">{formatMinutes(item.startMinute)}</time>
            <span>{item.title}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The plan at a glance: what to do next, money, vendors, ideas, notes and the run sheet. */
export default function OverviewPanel({ plan, today, update, goTo }: PanelProps) {
  const card = { plan, today, goTo };
  return (
    <div className="grid">
      <NextUpCard {...card} update={update} />
      <BudgetCard {...card} />
      <VendorsCard {...card} />
      <IdeasCard {...card} />
      <NotesCard {...card} />
      <RunSheetCard {...card} />
    </div>
  );
}
