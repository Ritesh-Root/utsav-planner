import { useMemo, useState } from 'react';

import { TASK_PRIORITIES } from '../../shared/constants.js';
import { diffDays, isISODate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { googleCalendarUrl } from '../../shared/links.js';
import { addCustomTask, planIsFull, randomId } from '../../shared/plan.js';
import type { Task, TaskPriority } from '../../shared/schemas.js';
import { groupByPhase, taskProgress } from '../../shared/timeline.js';
import { Track } from '../components/Display';
import { downloadCalendar } from '../components/ExportMenu';
import type { FormError } from '../components/InlineForm';
import { InlineForm, SelectField, TextField, fullPlanError } from '../components/InlineForm';
import { LinkButton, Panel } from '../components/Layout';
import { TASK_PRIORITY_LABELS } from '../labels';
import { RunSheet } from './RunSheet';
import { TaskRow, useTaskActions } from './TaskRow';
import type { PanelProps } from './types';

function AddTaskForm({ plan, today, update }: Pick<PanelProps, 'plan' | 'today' | 'update'>) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    if (planIsFull(plan, 'tasks')) {
      setError(fullPlanError('tasks'));
      return;
    }
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
        <TextField
          name="name"
          label="Task"
          maxLength={LIMITS.shortText}
          value={title}
          onChange={setTitle}
        />
        <TextField name="due" label="Due" type="date" min={today} value={due} onChange={setDue} />
        <SelectField
          name="priority"
          label="Priority"
          value={priority}
          options={TASK_PRIORITIES}
          optionLabel={(p) => TASK_PRIORITY_LABELS[p]}
          onChange={setPriority}
        />
      </div>
    </InlineForm>
  );
}

function CalendarLink({ task }: { task: Task }) {
  return (
    <a
      className="row-link"
      href={googleCalendarUrl({ title: task.title, date: task.due, details: task.details })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Add to Google Calendar: ${task.title} (opens in a new tab)`}
    >
      Add to Google Calendar
    </a>
  );
}

/** Tasks grouped into phases (months before, weeks before, the week, after). */
function TaskPhases({ plan, today, update }: Pick<PanelProps, 'plan' | 'today' | 'update'>) {
  const groups = useMemo(() => groupByPhase(plan.tasks), [plan.tasks]);
  const { onToggle, onRemove } = useTaskActions({ plan, update });
  if (groups.length === 0) return <p className="empty">No tasks yet. Add your own below.</p>;
  return groups.map((group) => (
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
            extra={<CalendarLink task={task} />}
          />
        ))}
      </ul>
    </section>
  ));
}

function CalendarPanel({ plan }: Pick<PanelProps, 'plan'>) {
  return (
    <Panel id="calendar-title" title="Put it in your calendar">
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
    </Panel>
  );
}

/** Tasks by phase, counted back from the date, plus the run sheet and calendar export. */
export default function TimelinePanel({ plan, today, update, refine }: PanelProps) {
  const progress = taskProgress(plan.tasks);
  const action = (
    <LinkButton
      onClick={() => {
        refine('timeline');
      }}
    >
      Adjust with AI
    </LinkButton>
  );

  return (
    <div className="grid">
      <Panel id="timeline-title" title="Timeline" className="span-8" action={action}>
        <p className="panel-figure">
          {progress.done} of {progress.total} done
        </p>
        <Track
          value={progress.done}
          max={progress.total}
          label={`${progress.done} of ${progress.total} tasks done`}
        />
        <TaskPhases plan={plan} today={today} update={update} />
        <AddTaskForm plan={plan} today={today} update={update} />
      </Panel>
      <div className="span-4 stack">
        <RunSheet plan={plan} update={update} refine={refine} />
        <CalendarPanel plan={plan} />
      </div>
    </div>
  );
}
