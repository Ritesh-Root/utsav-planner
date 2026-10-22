import type { InputHTMLAttributes, ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { LIMITS } from '../../shared/limits.js';
import { DIETARY, EVENT_TYPES, PRIORITIES } from '../../shared/constants.js';
import type { BriefDraft, BriefField, FieldErrors } from '../briefDraft';
import { FIELD_LABELS } from '../briefDraft';
import { DIETARY_LABELS, EVENT_TYPE_LABELS, PRIORITY_LABELS } from '../labels';
import { Select } from './Select';

export const fieldId = (field: BriefField) => `brief-${field}`;
const errorId = (field: BriefField) => `brief-${field}-error`;
const hintId = (field: BriefField) => `brief-${field}-hint`;

/** The draft being edited, its errors and a setter, shared by every field of the form. */
interface DraftApi {
  draft: BriefDraft;
  errors: FieldErrors;
  set: <K extends BriefField>(field: K, value: BriefDraft[K]) => void;
}

export const DraftContext = createContext<DraftApi | null>(null);

function useDraft(): DraftApi {
  const api = useContext(DraftContext);
  if (!api) throw new Error('Brief fields must be used inside BriefForm');
  return api;
}

/** aria wiring shared by every text-like control: its id, invalid state and descriptions. */
function describe(field: BriefField, errors: FieldErrors, hasHint: boolean) {
  const ids = [hasHint ? hintId(field) : '', errors[field] ? errorId(field) : '']
    .filter(Boolean)
    .join(' ');
  return {
    id: fieldId(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': ids || undefined,
  } as const;
}

/** A label, an optional hint and the field's error above its control. */
function Field({
  field,
  hint,
  children,
}: {
  field: BriefField;
  hint?: string;
  children: ReactNode;
}) {
  const { errors } = useDraft();
  const error = errors[field];
  return (
    <div className="field">
      <label className="label" htmlFor={fieldId(field)}>
        {FIELD_LABELS[field]}
      </label>
      {hint && (
        <p className="hint" id={hintId(field)}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error-text" id={errorId(field)}>
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

type TextKey =
  'title' | 'date' | 'location' | 'guests' | 'budget' | 'days' | 'honoreeAge' | 'style';
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'>;

/** A text, number or date input bound to one field of the draft. */
export function BriefInput({
  field,
  hint,
  ...input
}: InputProps & { field: TextKey; hint?: string }) {
  const { draft, errors, set } = useDraft();
  return (
    <Field field={field} hint={hint}>
      <input
        className="input"
        {...input}
        {...describe(field, errors, Boolean(hint))}
        value={draft[field]}
        onChange={(e) => {
          set(field, e.target.value);
        }}
      />
    </Field>
  );
}

/** A choice from a fixed list, bound to one field of the draft. */
export function BriefSelect<K extends 'currency' | 'venue'>({
  field,
  options,
  optionLabel,
}: {
  field: K;
  options: readonly BriefDraft[K][];
  optionLabel: (option: BriefDraft[K]) => string;
}) {
  const { draft, errors, set } = useDraft();
  return (
    <Field field={field}>
      <Select
        className="select"
        {...describe(field, errors, false)}
        value={draft[field]}
        options={options}
        optionLabel={optionLabel}
        onChange={(picked) => {
          set(field, picked);
        }}
      />
    </Field>
  );
}

export function NotesField() {
  const { draft, errors, set } = useDraft();
  return (
    <Field
      field="notes"
      hint="Traditions, accessibility needs, things to avoid. Utsav uses this to personalise the plan."
    >
      <textarea
        className="textarea"
        {...describe('notes', errors, true)}
        maxLength={LIMITS.notesMax}
        value={draft.notes}
        onChange={(e) => {
          set('notes', e.target.value);
        }}
      />
    </Field>
  );
}

/** A birthday asks for the age being celebrated; other events can span several days. */
export function DaysOrAgeField() {
  const { draft } = useDraft();
  if (draft.type === 'birthday') {
    return <BriefInput field="honoreeAge" hint="Optional" inputMode="numeric" />;
  }
  const hint = draft.type === 'wedding' ? 'Include pre-wedding functions' : 'For multi-day fairs';
  return <BriefInput field="days" hint={hint} inputMode="numeric" />;
}

export function EventTypeField({ hidden }: { hidden: boolean }) {
  const { draft, errors, set } = useDraft();
  return (
    <fieldset hidden={hidden} aria-describedby={errors.type ? errorId('type') : undefined}>
      <legend>{FIELD_LABELS.type}</legend>
      <div className="choices">
        {EVENT_TYPES.map((type) => (
          <label key={type} className="choice">
            <input
              type="radio"
              name="type"
              id={type === draft.type ? fieldId('type') : undefined}
              value={type}
              checked={draft.type === type}
              onChange={() => {
                set('type', type);
              }}
            />
            {EVENT_TYPE_LABELS[type]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Tick boxes for a list field; once `limit` are ticked the rest are disabled. */
function Checkboxes<T extends string>({
  name,
  options,
  labels,
  selected,
  onChange,
  limit = Infinity,
}: {
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  onChange: (selected: T[]) => void;
  limit?: number;
}) {
  const full = selected.length >= limit;
  return (
    <div className="choices">
      {options.map((option) => {
        const checked = selected.includes(option);
        return (
          <label key={option} className="choice">
            <input
              type="checkbox"
              name={name}
              value={option}
              checked={checked}
              disabled={!checked && full}
              onChange={() => {
                onChange(toggle(selected, option));
              }}
            />
            {labels[option]}
          </label>
        );
      })}
    </div>
  );
}

export function PrioritiesField() {
  const { draft, set } = useDraft();
  return (
    <fieldset aria-describedby={hintId('priorities')}>
      <legend>{FIELD_LABELS.priorities}</legend>
      <p className="hint" id={hintId('priorities')}>
        Choose up to {LIMITS.prioritiesMax}.
      </p>
      <Checkboxes
        name="priorities"
        options={PRIORITIES}
        labels={PRIORITY_LABELS}
        selected={draft.priorities}
        limit={LIMITS.prioritiesMax}
        onChange={(priorities) => {
          set('priorities', priorities);
        }}
      />
    </fieldset>
  );
}

export function DietaryField() {
  const { draft, set } = useDraft();
  return (
    <fieldset>
      <legend>{FIELD_LABELS.dietary}</legend>
      <Checkboxes
        name="dietary"
        options={DIETARY}
        labels={DIETARY_LABELS}
        selected={draft.dietary}
        onChange={(dietary) => {
          set('dietary', dietary);
        }}
      />
    </fieldset>
  );
}
