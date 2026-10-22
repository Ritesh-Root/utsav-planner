import { formatDate } from '../../shared/dates.js';
import type { Task } from '../../shared/schemas.js';
import type { TaskStatus } from '../../shared/timeline.js';
import { TASK_STATUS_LABELS, taskStatus } from '../../shared/timeline.js';
import { Pill } from '../components/Display';

const STATUS_TONE: Record<TaskStatus, 'negative' | 'warning' | 'positive' | 'neutral'> = {
  overdue: 'negative',
  'do-now': 'warning',
  'due-soon': 'neutral',
  upcoming: 'neutral',
  done: 'positive',
};

/** One task: a real checkbox labelled by its title, the due date and its status in words. */
export function TaskRow({
  task,
  today,
  onToggle,
  extra,
}: {
  task: Task;
  today: string;
  onToggle: (task: Task) => void;
  extra?: React.ReactNode;
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
        {extra}
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

export function toggleTask(task: Task, tasks: readonly Task[]): Task[] {
  return tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t));
}
