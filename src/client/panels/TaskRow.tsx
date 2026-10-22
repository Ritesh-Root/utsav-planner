import type { ReactNode } from 'react';
import { useCallback } from 'react';

import { formatDate } from '../../shared/dates.js';
import { removeTask, toggleTaskDone } from '../../shared/plan.js';
import type { Task } from '../../shared/schemas.js';
import type { TaskStatus } from '../../shared/timeline.js';
import { taskStatus } from '../../shared/timeline.js';
import { Pill } from '../components/Display';
import { TASK_STATUS_LABELS } from '../labels';
import type { PanelProps } from './types';

const STATUS_TONE: Record<TaskStatus, 'negative' | 'warning' | 'positive' | 'neutral'> = {
  overdue: 'negative',
  'do-now': 'warning',
  'due-soon': 'neutral',
  upcoming: 'neutral',
  done: 'positive',
};

/** Tick and remove handlers shared by every list of tasks, each undoable and announced. */
export function useTaskActions({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const onToggle = useCallback(
    (task: Task) => {
      update(toggleTaskDone(plan, task.id, new Date()), {
        undoable: true,
        announcement: `${task.title} marked ${task.done ? 'not done' : 'done'}`,
      });
    },
    [plan, update],
  );
  const onRemove = useCallback(
    (task: Task) => {
      update(removeTask(plan, task.id, new Date()), {
        undoable: true,
        announcement: `Removed ${task.title}`,
      });
    },
    [plan, update],
  );
  return { onToggle, onRemove };
}

/** One task: a real checkbox labelled by its title, the due date and its status in words. */
export function TaskRow({
  task,
  today,
  onToggle,
  onRemove,
  extra,
}: {
  task: Task;
  today: string;
  onToggle: (task: Task) => void;
  onRemove?: (task: Task) => void;
  extra?: ReactNode;
}) {
  const status = taskStatus(task, today);
  const id = `task-${task.id}`;
  return (
    <li className={`row check-row${task.done ? ' done' : ''}`}>
      <input
        id={id}
        className="check"
        type="checkbox"
        checked={task.done}
        aria-describedby={`${id}-meta`}
        onChange={() => {
          onToggle(task);
        }}
      />
      <div className="row-main">
        <label htmlFor={id} className="row-title">
          {task.title}
        </label>
        {task.details && <span className="row-sub">{task.details}</span>}
        {(extra ?? onRemove) && (
          <span className="row-actions">
            {extra}
            {onRemove && (
              <button
                type="button"
                className="link-button quiet-link"
                aria-label={`Remove: ${task.title}`}
                onClick={() => {
                  onRemove(task);
                }}
              >
                Remove
              </button>
            )}
          </span>
        )}
      </div>
      <div className="row-end" id={`${id}-meta`}>
        <time dateTime={task.due} className="num">
          {formatDate(task.due)}
        </time>
        {status !== 'upcoming' && (
          <Pill tone={STATUS_TONE[status]}>{TASK_STATUS_LABELS[status]}</Pill>
        )}
      </div>
    </li>
  );
}
