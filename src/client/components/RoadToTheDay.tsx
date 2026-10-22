import { useMemo } from 'react';

import { diffDays, formatDate } from '../../shared/dates.js';
import type { Plan } from '../../shared/schemas.js';
import { daysUntil, taskProgress, taskStatus } from '../../shared/timeline.js';
import { useWidth } from '../hooks';
import { pluralize } from '../labels';

const HEIGHT = 56;
const PAD = 8;
const TRACK_Y = 22;

type MarkKind = 'done' | 'late' | 'open';

/** A task on the road: late tasks are diamonds, so status never rests on colour alone. */
function TaskMark({ kind, cx, cy, r }: { kind: MarkKind; cx: number; cy: number; r: number }) {
  const className = `road-task${kind === 'done' ? ' is-done' : kind === 'late' ? ' is-late' : ''}`;
  if (kind === 'late') {
    const side = r * 1.6;
    return (
      <rect
        className={className}
        x={cx - side / 2}
        y={cy - side / 2}
        width={side}
        height={side}
        transform={`rotate(45 ${cx} ${cy})`}
      />
    );
  }
  return <circle className={className} cx={cx} cy={cy} r={r} />;
}

function Dot({ kind }: { kind: MarkKind }) {
  return (
    <svg className="road-key" viewBox="0 0 12 12" aria-hidden="true">
      <TaskMark kind={kind} cx={6} cy={6} r={4.5} />
    </svg>
  );
}

/**
 * The road from the day the plan was made to the event: every task is a mark
 * on it, today is a line, and the travelled part is filled. Utsav's own chart.
 */
export function RoadToTheDay({ plan, today }: { plan: Plan; today: string }) {
  const { brief, tasks } = plan;
  const left = daysUntil(brief.date, today);
  const progress = taskProgress(tasks);
  const [chartRef, width] = useWidth<HTMLDivElement>(760);

  const layout = useMemo(() => {
    const start = diffDays(plan.createdOn, today) < 0 ? today : plan.createdOn;
    const span = Math.max(diffDays(start, brief.date), 1);
    const x = (date: string) => {
      const ratio = Math.min(Math.max(diffDays(start, date) / span, 0), 1);
      return PAD + ratio * (width - 2 * PAD);
    };
    const marks = tasks
      .filter((task) => task.daysBefore >= 0)
      .map((task) => {
        const status = taskStatus(task, today);
        const kind =
          status === 'done'
            ? 'done'
            : status === 'overdue' || status === 'do-now'
              ? 'late'
              : 'open';
        return { id: task.id, cx: x(task.due), kind } as const;
      });
    return { todayX: x(today), endX: x(brief.date), marks };
  }, [plan.createdOn, brief.date, tasks, today, width]);

  const late = layout.marks.filter((m) => m.kind === 'late').length;
  const headline = left > 0 ? pluralize(left, 'day') : left === 0 ? 'Today' : 'Done';
  const summary = `${headline}${left > 0 ? ' to go' : ''}. ${progress.done} of ${progress.total} tasks done${
    late > 0 ? `, ${pluralize(late, 'task')} need doing now` : ''
  }.`;

  return (
    <section className="panel road-panel" aria-labelledby="road-title">
      <div className="road">
        <div className="road-count">
          <h2 id="road-title" className="panel-title">
            Road to the day
          </h2>
          <p className="panel-figure">{headline}</p>
          <p className="panel-caption">
            {left > 0 ? `to ${formatDate(brief.date)}` : formatDate(brief.date)}
          </p>
        </div>
        <div ref={chartRef}>
          <svg
            className="road-chart"
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={summary}
          >
            <line className="road-track" x1={PAD} y1={TRACK_Y} x2={width - PAD} y2={TRACK_Y} />
            {layout.todayX > PAD && (
              <line className="road-done" x1={PAD} y1={TRACK_Y} x2={layout.todayX} y2={TRACK_Y} />
            )}
            {layout.marks.map((mark) => (
              <TaskMark key={mark.id} kind={mark.kind} cx={mark.cx} cy={TRACK_Y} r={5} />
            ))}
            <line className="road-today" x1={layout.todayX} y1={8} x2={layout.todayX} y2={36} />
            <text
              x={layout.todayX}
              y={52}
              textAnchor={layout.todayX > width - 80 ? 'end' : 'start'}
            >
              Today
            </text>
            <circle className="road-day" cx={layout.endX} cy={TRACK_Y} r="8" />
            {layout.endX - layout.todayX > 140 && (
              <text x={layout.endX} y={52} textAnchor="end">
                {formatDate(brief.date)}
              </text>
            )}
          </svg>
          <p className="road-legend" aria-hidden="true">
            <span>
              <Dot kind="done" /> Done
            </span>
            <span>
              <Dot kind="late" /> Needs doing now
            </span>
            <span>
              <Dot kind="open" /> Coming up
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
