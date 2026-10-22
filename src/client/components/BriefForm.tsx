import type { SubmitEvent } from 'react';
import { useEffect, useRef } from 'react';

import { LIMITS } from '../../shared/limits.js';
import { CURRENCIES } from '../../shared/money.js';
import { VENUE_PREFERENCES } from '../../shared/constants.js';
import type { BriefDraft, BriefField, FieldErrors } from '../briefDraft';
import { FIELD_LABELS, FIELD_ORDER } from '../briefDraft';
import { VENUE_LABELS } from '../labels';
import {
  BriefInput,
  BriefSelect,
  DaysOrAgeField,
  DietaryField,
  DraftContext,
  EventTypeField,
  NotesField,
  PrioritiesField,
  fieldId,
} from './BriefFields';

/** GOV.UK-style summary: focused when shown, each error links to its field. */
function ErrorSummary({ errors }: { errors: FieldErrors }) {
  const ref = useRef<HTMLDivElement>(null);
  const fields = FIELD_ORDER.filter((field) => errors[field]);
  useEffect(() => {
    ref.current?.focus();
  }, [errors]);
  if (fields.length === 0) return null;
  return (
    <div
      ref={ref}
      className="error-summary"
      role="group"
      tabIndex={-1}
      aria-labelledby="error-summary-title"
    >
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

function FormActions({
  submitLabel,
  busy,
  onCancel,
}: {
  submitLabel: string;
  busy: boolean;
  onCancel: (() => void) | undefined;
}) {
  return (
    <div className="actions">
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {submitLabel}
      </button>
      {onCancel ? (
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <a className="btn btn-quiet" href="#/">
          Cancel
        </a>
      )}
    </div>
  );
}

/**
 * Every detail of an event, with inline errors and a summary. Used to create a
 * plan and, with the type hidden, to edit one.
 */
export function BriefForm({
  draft,
  errors,
  onChange,
  onSubmit,
  submitLabel,
  busy = false,
  editing = false,
  onCancel,
}: {
  draft: BriefDraft;
  errors: FieldErrors;
  onChange: (draft: BriefDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  /**
   * Editing an existing plan: its type and currency stay fixed, since amounts already
   * typed in that currency would otherwise be read as another one.
   */
  editing?: boolean;
  /** Shows a Cancel button instead of the link back home. */
  onCancel?: () => void;
}) {
  const set = <K extends BriefField>(field: K, value: BriefDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <DraftContext.Provider value={{ draft, errors, set }}>
      <form className="form" noValidate onSubmit={submit} aria-busy={busy}>
        <ErrorSummary errors={errors} />
        <EventTypeField hidden={editing} />
        <BriefInput field="title" maxLength={LIMITS.titleMax} autoComplete="off" />
        <div className="field-row">
          <BriefInput field="date" type="date" />
          <BriefInput
            field="location"
            maxLength={LIMITS.locationMax}
            autoComplete="address-level2"
          />
        </div>
        <div className="field-row">
          <BriefInput field="guests" inputMode="numeric" />
          <BriefInput field="budget" inputMode="numeric" />
          {!editing && (
            <BriefSelect field="currency" options={CURRENCIES} optionLabel={(code) => code} />
          )}
        </div>
        <div className="field-row">
          <BriefSelect
            field="venue"
            options={VENUE_PREFERENCES}
            optionLabel={(venue) => VENUE_LABELS[venue]}
          />
          <DaysOrAgeField />
        </div>
        <BriefInput
          field="style"
          maxLength={LIMITS.styleMax}
          hint="For example: royal pastel, space explorers, festival of lights"
        />
        <PrioritiesField />
        <DietaryField />
        <NotesField />
        <FormActions submitLabel={submitLabel} busy={busy} onCancel={onCancel} />
      </form>
    </DraftContext.Provider>
  );
}
