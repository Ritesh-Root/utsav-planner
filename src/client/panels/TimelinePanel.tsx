import { useMemo, useState } from 'react';

import { TASK_PRIORITIES } from '../../shared/constants.js';
import { diffDays, formatMinutes, isISODate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { googleCalendarUrl } from '../../shared/links.js';
import { addCustomTask, addDayOfItem, randomId, removeDayOfItem } from '../../shared/plan.js';
import type { DayOfItem, TaskPriority } from '../../shared/schemas.js';
import { groupByPhase, taskProgress } from '../../shared/timeline.js';
import { Track } from '../components/Display';
import { downloadCalendar } from '../components/ExportMenu';
import type { FormError } from '../components/InlineForm';
import { FormField, InlineForm } from '../components/InlineForm';
import { TASK_PRIORITY_LABELS } from '../labels';
import { TaskRow, useTaskActions } from './TaskRow';
import type { PanelProps } from './types';

function AddTaskForm({ plan, today, update }: Pick<PanelProps, 'plan' | 'today' | 'update'>) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    if (title.trim() === '') {
      setError({ message: 'Give the task a name.', fields: ['name'] });
      return;
    }
    if (!isISODate(due) || diffDays(today, due) < 0) {
      setError({ message: 'Choose today or a later date.', fields: ['due'] });
      return;
    }
    setError(null);
    update(addCustomTask(plan, { title, due, priority }, randomId, new Date()), {
      undoable: true,
      announcement: `Added ${title.trim()}`,
    });
    setTitle('');
  };

  return (
    <InlineForm heading="Add your own task" error={error} submitLabel="Add task" onSubmit={submit}>
      <div className="field-row">
        <FormField name="name" label="Task">
          {(control) => (
            <input
              {...control}
              className="input"
              maxLength={LIMITS.shortText}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField name="due" label="Due">
          {(control) => (
            <input
              {...control}
              className="input"
              type="date"
              min={today}
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField name="priority" label="Priority">
          {(control) => (
            <select
              {...control}
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
          )}
        </FormField>
      </div>
    </InlineForm>
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
  const [error, setError] = useState<FormError | null>(null);
  const days = useMemo(() => {
    const byDay = new Map<number, DayOfItem[]>();
    for (const item of plan.dayOf) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
    return [...byDay.entries()].sort(([a], [b]) => a - b);
  }, [plan.dayOf]);
  const multiDay = plan.brief.days > 1;

  const submit = () => {
    const startMinute = parseTime(time);
    if (title.trim() === '' || startMinute === null) {
      setError({
        message: 'Add what happens and a time like 18:30.',
        fields: [
          ...(title.trim() === '' ? ['what'] : []),
          ...(startMinute === null ? ['time'] : []),
        ],
      });
      return;
    }
    setError(null);
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
      <InlineForm
        label="Add to the run sheet"
        error={error}
        submitLabel="Add to run sheet"
        onSubmit={submit}
        actions={
          <button
            type="button"
            className="link-button"
            onClick={() => {
              refine('dayOf');
            }}
          >
            Change the run sheet with AI
          </button>
        }
      >
        <div className="field-row">
          <FormField name="what" label="What happens">
            {(control) => (
              <input
                {...control}
                className="input"
                maxLength={LIMITS.shortText}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField name="time" label="Time">
            {(control) => (
              <input
                {...control}
                className="input"
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                }}
              />
            )}
          </FormField>
          {multiDay && (
            <FormField name="day" label="Day">
              {(control) => (
                <select
                  {...control}
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
              )}
            </FormField>
          )}
        </div>
      </InlineForm>
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
