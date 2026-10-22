import type { SubmitEvent } from 'react';
import { useId, useMemo, useState } from 'react';

import { diffDays, formatMinutes } from '../../shared/dates.js';
import { googleCalendarUrl } from '../../shared/links.js';
import { addCustomTask, randomId } from '../../shared/plan.js';
import type { DayOfItem, TaskPriority } from '../../shared/schemas.js';
import { TASK_PRIORITIES } from '../../shared/schemas.js';
import { groupByPhase, taskProgress } from '../../shared/timeline.js';
import { Track } from '../components/Display';
import { downloadCalendar } from '../components/ExportMenu';
import { TASK_PRIORITY_LABELS } from '../labels';
import { TaskRow, toggleTask } from './TaskRow';
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
    <form
      className="inner form add-task"
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
    >
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
            maxLength={80}
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

export default function TimelinePanel({ plan, today, update, refine }: PanelProps) {
  const groups = useMemo(() => groupByPhase(plan.tasks), [plan.tasks]);
  const progress = taskProgress(plan.tasks);
  const days = useMemo(() => {
    const byDay = new Map<number, DayOfItem[]>();
    for (const item of plan.dayOf) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
    return [...byDay.entries()].sort(([a], [b]) => a - b);
  }, [plan.dayOf]);

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
                  onToggle={(t) => {
                    update(
                      { ...plan, tasks: toggleTask(t, plan.tasks) },
                      {
                        undoable: true,
                        announcement: `${t.title} marked ${t.done ? 'not done' : 'done'}`,
                      },
                    );
                  }}
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
                      aria-label={`Add ${task.title} to Google Calendar (opens in a new tab)`}
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
        <section className="panel" aria-labelledby="dayof-title">
          <h2 id="dayof-title" className="panel-title">
            Run sheet
          </h2>
          {days.map(([day, items]) => (
            <section key={day} aria-label={plan.brief.days > 1 ? `Day ${day}` : 'Event day'}>
              {plan.brief.days > 1 && <h3 className="phase-title">Day {day}</h3>}
              <ul className="rows">
                {items.map((item) => (
                  <li key={item.id} className="row time-row">
                    <time className="num">{formatMinutes(item.startMinute)}</time>
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              refine('dayOf');
            }}
          >
            Change the run sheet with AI
          </button>
        </section>
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
