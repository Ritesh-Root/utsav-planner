import type { SubmitEvent, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { LIMITS } from '../../shared/limits.js';
import { CURRENCIES } from '../../shared/money.js';
import type { Dietary, EventType, Priority, VenuePreference } from '../../shared/schemas.js';
import { DIETARY, EVENT_TYPES, PRIORITIES, VENUE_PREFERENCES } from '../../shared/schemas.js';
import type { BriefDraft, BriefField, FieldErrors } from '../briefForm';
import { FIELD_LABELS, FIELD_ORDER } from '../briefForm';
import { DIETARY_LABELS, EVENT_TYPE_LABELS, PRIORITY_LABELS, VENUE_LABELS } from '../labels';

const fieldId = (field: BriefField) => `brief-${field}`;
const errorId = (field: BriefField) => `brief-${field}-error`;

/** GOV.UK-style summary: focused when shown, each error links to its field. */
export function ErrorSummary({ errors }: { errors: FieldErrors }) {
  const ref = useRef<HTMLDivElement>(null);
  const fields = FIELD_ORDER.filter((field) => errors[field]);
  useEffect(() => {
    ref.current?.focus();
  }, [errors]);
  if (fields.length === 0) return null;
  return (
    <div ref={ref} className="error-summary" tabIndex={-1} aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">
        There {fields.length === 1 ? 'is a problem' : 'are some problems'}
      </h2>
      <ul>
        {fields.map((field) => (
          <li key={field}>
            <a
              href={`#${fieldId(field)}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(fieldId(field))?.focus();
              }}
            >
              {FIELD_LABELS[field]}: {errors[field]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  field,
  hint,
  error,
  children,
}: {
  field: BriefField;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={fieldId(field)}>
        {FIELD_LABELS[field]}
      </label>
      {hint && (
        <p className="hint" id={`${fieldId(field)}-hint`}>
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

/** aria wiring shared by every text-like input. */
function describe(field: BriefField, errors: FieldErrors, hasHint = false) {
  const ids = [hasHint ? `${fieldId(field)}-hint` : '', errors[field] ? errorId(field) : '']
    .filter(Boolean)
    .join(' ');
  return {
    id: fieldId(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': ids || undefined,
  } as const;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function BriefForm({
  draft,
  errors,
  onChange,
  onSubmit,
  submitLabel,
  busy = false,
}: {
  draft: BriefDraft;
  errors: FieldErrors;
  onChange: (draft: BriefDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
}) {
  const set = <K extends BriefField>(field: K, value: BriefDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };
  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const tooManyPriorities = draft.priorities.length >= LIMITS.prioritiesMax;

  return (
    <form className="form" noValidate onSubmit={handleSubmit} aria-busy={busy}>
      <ErrorSummary errors={errors} />

      <fieldset aria-describedby={errors.type ? errorId('type') : undefined}>
        <legend>{FIELD_LABELS.type}</legend>
        <div className="choices">
          {EVENT_TYPES.map((type: EventType) => (
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

      <Field field="title" error={errors.title}>
        <input
          className="input"
          {...describe('title', errors)}
          maxLength={LIMITS.titleMax}
          autoComplete="off"
          value={draft.title}
          onChange={(e) => {
            set('title', e.target.value);
          }}
        />
      </Field>

      <div className="field-row">
        <Field field="date" error={errors.date}>
          <input
            className="input"
            type="date"
            {...describe('date', errors)}
            value={draft.date}
            onChange={(e) => {
              set('date', e.target.value);
            }}
          />
        </Field>
        <Field field="location" error={errors.location}>
          <input
            className="input"
            {...describe('location', errors)}
            maxLength={LIMITS.locationMax}
            autoComplete="address-level2"
            value={draft.location}
            onChange={(e) => {
              set('location', e.target.value);
            }}
          />
        </Field>
      </div>

      <div className="field-row">
        <Field field="guests" error={errors.guests}>
          <input
            className="input"
            inputMode="numeric"
            {...describe('guests', errors)}
            value={draft.guests}
            onChange={(e) => {
              set('guests', e.target.value);
            }}
          />
        </Field>
        <Field field="budget" error={errors.budget}>
          <input
            className="input"
            inputMode="numeric"
            {...describe('budget', errors)}
            value={draft.budget}
            onChange={(e) => {
              set('budget', e.target.value);
            }}
          />
        </Field>
        <Field field="currency" error={errors.currency}>
          <select
            className="select"
            {...describe('currency', errors)}
            value={draft.currency}
            onChange={(e) => {
              set('currency', e.target.value as BriefDraft['currency']);
            }}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="field-row">
        <Field field="venue" error={errors.venue}>
          <select
            className="select"
            {...describe('venue', errors)}
            value={draft.venue}
            onChange={(e) => {
              set('venue', e.target.value as VenuePreference);
            }}
          >
            {VENUE_PREFERENCES.map((venue) => (
              <option key={venue} value={venue}>
                {VENUE_LABELS[venue]}
              </option>
            ))}
          </select>
        </Field>
        {draft.type === 'birthday' ? (
          <Field field="honoreeAge" error={errors.honoreeAge} hint="Optional">
            <input
              className="input"
              inputMode="numeric"
              {...describe('honoreeAge', errors, true)}
              value={draft.honoreeAge}
              onChange={(e) => {
                set('honoreeAge', e.target.value);
              }}
            />
          </Field>
        ) : (
          <Field
            field="days"
            error={errors.days}
            hint={
              draft.type === 'wedding' ? 'Include pre-wedding functions' : 'For multi-day fairs'
            }
          >
            <input
              className="input"
              inputMode="numeric"
              {...describe('days', errors, true)}
              value={draft.days}
              onChange={(e) => {
                set('days', e.target.value);
              }}
            />
          </Field>
        )}
      </div>

      <Field
        field="style"
        error={errors.style}
        hint="For example: royal pastel, space explorers, festival of lights"
      >
        <input
          className="input"
          {...describe('style', errors, true)}
          maxLength={LIMITS.styleMax}
          value={draft.style}
          onChange={(e) => {
            set('style', e.target.value);
          }}
        />
      </Field>

      <fieldset aria-describedby="brief-priorities-hint">
        <legend>{FIELD_LABELS.priorities}</legend>
        <p className="hint" id="brief-priorities-hint">
          Choose up to {LIMITS.prioritiesMax}.
        </p>
        <div className="choices">
          {PRIORITIES.map((priority: Priority) => {
            const checked = draft.priorities.includes(priority);
            return (
              <label key={priority} className="choice">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && tooManyPriorities}
                  onChange={() => {
                    set('priorities', toggle(draft.priorities, priority));
                  }}
                />
                {PRIORITY_LABELS[priority]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>{FIELD_LABELS.dietary}</legend>
        <div className="choices">
          {DIETARY.map((need: Dietary) => (
            <label key={need} className="choice">
              <input
                type="checkbox"
                checked={draft.dietary.includes(need)}
                onChange={() => {
                  set('dietary', toggle(draft.dietary, need));
                }}
              />
              {DIETARY_LABELS[need]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        field="notes"
        error={errors.notes}
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

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
        <a className="btn btn-quiet" href="#/">
          Cancel
        </a>
      </div>
    </form>
  );
}
