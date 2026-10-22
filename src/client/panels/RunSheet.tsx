import { useMemo, useState } from 'react';

import { formatMinutes } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { addDayOfItem, planIsFull, randomId, removeDayOfItem } from '../../shared/plan.js';
import type { DayOfItem } from '../../shared/schemas.js';
import type { FormError } from '../components/InlineForm';
import { InlineForm, SelectField, TextField, fullPlanError } from '../components/InlineForm';
import { LinkButton, Panel } from '../components/Layout';
import type { PanelProps } from './types';

type RunSheetProps = Pick<PanelProps, 'plan' | 'update' | 'refine'>;

/** "18:30" → minutes after midnight, or null for anything that is not a time. */
function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** Run-sheet items grouped by day, in day order. */
function byDay(items: readonly DayOfItem[]): [number, DayOfItem[]][] {
  const days = new Map<number, DayOfItem[]>();
  for (const item of items) days.set(item.day, [...(days.get(item.day) ?? []), item]);
  return [...days.entries()].sort(([a], [b]) => a - b);
}

function AddItemForm({ plan, update, refine }: RunSheetProps) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('12:00');
  const [day, setDay] = useState('1');
  const [error, setError] = useState<FormError | null>(null);
  const dayOptions = Array.from({ length: plan.brief.days }, (_, i) => String(i + 1));

  const submit = () => {
    if (planIsFull(plan, 'dayOf')) {
      setError(fullPlanError('run-sheet items'));
      return;
    }
    const startMinute = parseTime(time);
    const missingTitle = title.trim() === '';
    if (missingTitle || startMinute === null) {
      const fields = [missingTitle && 'what', startMinute === null && 'time'];
      setError({
        message: 'Add what happens and a time like 18:30.',
        fields: fields.filter((field) => field !== false),
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

  const aiAction = (
    <LinkButton
      onClick={() => {
        refine('dayOf');
      }}
    >
      Change the run sheet with AI
    </LinkButton>
  );
  return (
    <InlineForm
      label="Add to the run sheet"
      error={error}
      submitLabel="Add to run sheet"
      onSubmit={submit}
      actions={aiAction}
    >
      <div className="field-row">
        <TextField
          name="what"
          label="What happens"
          maxLength={LIMITS.shortText}
          value={title}
          onChange={setTitle}
        />
        <TextField name="time" label="Time" type="time" value={time} onChange={setTime} />
        {plan.brief.days > 1 && (
          <SelectField
            name="day"
            label="Day"
            value={day}
            options={dayOptions}
            optionLabel={(option) => `Day ${option}`}
            onChange={setDay}
          />
        )}
      </div>
    </InlineForm>
  );
}

/** The day itself, hour by hour (and day by day for longer events), with the user's own items. */
export function RunSheet({ plan, update, refine }: RunSheetProps) {
  const days = useMemo(() => byDay(plan.dayOf), [plan.dayOf]);
  return (
    <Panel id="dayof-title" title="Run sheet">
      {days.length === 0 && <p className="empty">Nothing scheduled yet.</p>}
      {days.map(([dayNumber, items]) => (
        <div key={dayNumber}>
          {plan.brief.days > 1 && <h3 className="phase-title">Day {dayNumber}</h3>}
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
      <AddItemForm plan={plan} update={update} refine={refine} />
    </Panel>
  );
}
