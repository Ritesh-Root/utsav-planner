import type { SubmitEvent } from 'react';
import { useId, useMemo, useState } from 'react';

import { TASK_PRIORITIES } from '../../shared/constants.js';
import { diffDays, formatMinutes } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { googleCalendarUrl } from '../../shared/links.js';
import { addCustomTask, addDayOfItem, randomId, removeDayOfItem } from '../../shared/plan.js';
import type { DayOfItem, TaskPriority } from '../../shared/schemas.js';
import { groupByPhase, taskProgress } from '../../shared/timeline.js';
import { Track } from '../components/Display';
import { downloadCalendar } from '../components/ExportMenu';
import { TASK_PRIORITY_LABELS } from '../labels';
import { TaskRow, useTaskActions } from './TaskRow';
import type { PanelProps } from './types';

function AddTaskForm({ plan, today, update }: Pick<PanelProps, 'plan' | 'today' | 'update'>) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [error, setError] = useState('');
  const id = useId();

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (title.trim() === '') {
      setError('Give the task a name.');
      return;
    }
    if (diffDays(today, due) < 0) {
      setError('Choose today or a later date.');
      return;
    }
    setError('');
    update(addCustomTask(plan, { title, due, priority }, randomId, new Date()), {
      undoable: true,
      announcement: `Added ${title.trim()}`,
    });
    setTitle('');
  };

  return (
    <form className="inner form" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="panel-title">
        Add your own task
      </h3>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor={`${id}-name`}>
            Task
          </label>
          <input
            id={`${id}-name`}
            className="input"
            maxLength={LIMITS.shortText}
            value={title}
            aria-invalid={error !== '' && title.trim() === ''}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-due`}>
            Due
          </label>
          <input
            id={`${id}-due`}
            className="input"
            type="date"
            min={today}
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-priority`}>
            Priority
          </label>
          <select
            id={`${id}-priority`}
            className="select"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as TaskPriority);
            }}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-secondary btn-small">
          Add task
        </button>
      </div>
    </form>
  );
}

/** "18:30" → minutes after midnight, or null for anything that is not a time. */
function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function RunSheet({ plan, update, refine }: Pick<PanelProps, 'plan' | 'update' | 'refine'>) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('12:00');
  const [day, setDay] = useState('1');
  const [error, setError] = useState('');
  const id = useId();
  const days = useMemo(() => {
    const byDay = new Map<number, DayOfItem[]>();
    for (const item of plan.dayOf) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
    return [...byDay.entries()].sort(([a], [b]) => a - b);
  }, [plan.dayOf]);
  const multiDay = plan.brief.days > 1;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const startMinute = parseTime(time);
    if (title.trim() === '' || startMinute === null) {
      setError('Add what happens and a time like 18:30.');
      return;
    }
    setError('');
    update(addDayOfItem(plan, { day: Number(day), startMinute, title }, randomId, new Date()), {
      undoable: true,
      announcement: `Added ${title.trim()} at ${formatMinutes(startMinute)}`,
    });
    setTitle('');
  };

  return (
    <section className="panel" aria-labelledby="dayof-title">
      <h2 id="dayof-title" className="panel-title">
        Run sheet
      </h2>
      {days.length === 0 && <p className="empty">Nothing scheduled yet.</p>}
      {days.map(([dayNumber, items]) => (
        <div key={dayNumber}>
          {multiDay && <h3 className="phase-title">Day {dayNumber}</h3>}
          <ul className="rows">
            {items.map((item) => (
              <li key={item.id} className="row time-row">
                <time className="num">{formatMinutes(item.startMinute)}</time>
                <span className="time-row-title">
                  {item.title}
                  <button
                    type="button"
                    className="link-button quiet-link"
                    aria-label={`Remove: ${item.title}`}
                    onClick={() => {
                      update(removeDayOfItem(plan, item.id, new Date()), {
                        undoable: true,
                        announcement: `Removed ${item.title}`,
                      });
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form
        className="form compact-form"
        onSubmit={submit}
        noValidate
        aria-label="Add to the run sheet"
      >
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor={`${id}-what`}>
              What happens
            </label>
            <input
              id={`${id}-what`}
              className="input"
              maxLength={LIMITS.shortText}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-time`}>
              Time
            </label>
            <input
              id={`${id}-time`}
              className="input"
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
              }}
            />
          </div>
          {multiDay && (
            <div className="field">
              <label className="label" htmlFor={`${id}-day`}>
                Day
              </label>
              <select
                id={`${id}-day`}
                className="select"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                }}
              >
                {Array.from({ length: plan.brief.days }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Day {i + 1}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-secondary btn-small">
            Add to run sheet
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              refine('dayOf');
            }}
          >
            Change the run sheet with AI
          </button>
        </div>
      </form>
    </section>
  );
}

/** Tasks by phase, counted back from the date, plus the run sheet and calendar export. */
export default function TimelinePanel({ plan, today, update, refine }: PanelProps) {
  const groups = useMemo(() => groupByPhase(plan.tasks), [plan.tasks]);
  const progress = taskProgress(plan.tasks);
  const { onToggle, onRemove } = useTaskActions({ plan, update });

  return (
    <div className="grid">
      <section className="panel span-8" aria-labelledby="timeline-title">
        <div className="panel-head">
          <h2 id="timeline-title" className="panel-title">
            Timeline
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              refine('timeline');
            }}
          >
            Adjust with AI
          </button>
        </div>
        <p className="panel-figure">
          {progress.done} of {progress.total} done
        </p>
        <Track
          value={progress.done}
          max={progress.total}
          label={`${progress.done} of ${progress.total} tasks done`}
        />
        {groups.length === 0 && <p className="empty">No tasks yet. Add your own below.</p>}
        {groups.map((group) => (
          <section key={group.id} className="phase" aria-labelledby={`phase-${group.id}`}>
            <h3 id={`phase-${group.id}`} className="phase-title">
              {group.label}
            </h3>
            <ul className="rows">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  extra={
                    <a
                      className="row-link"
                      href={googleCalendarUrl({
                        title: task.title,
                        date: task.due,
                        details: task.details,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Add to Google Calendar: ${task.title} (opens in a new tab)`}
                    >
                      Add to Google Calendar
                    </a>
                  }
                />
              ))}
            </ul>
          </section>
        ))}
        <AddTaskForm plan={plan} today={today} update={update} />
      </section>

      <div className="span-4 stack">
        <RunSheet plan={plan} update={update} refine={refine} />
        <section className="panel" aria-labelledby="calendar-title">
          <h2 id="calendar-title" className="panel-title">
            Put it in your calendar
          </h2>
          <p className="panel-caption">
            One file with the event, every open task and every booking deadline. Works with Google
            Calendar, Apple Calendar and Outlook.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                downloadCalendar(plan);
              }}
            >
              Download calendar file
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
