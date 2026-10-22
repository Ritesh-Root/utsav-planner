import type { ReactNode, SubmitEvent } from 'react';
import { createContext, useContext, useId } from 'react';

/** What went wrong, and which of the form's fields it is about. */
export interface FormError {
  message: string;
  fields: readonly string[];
}

const FormContext = createContext<{ id: string; error: FormError | null }>({
  id: '',
  error: null,
});

/**
 * A small "add your own …" form: a heading (or, without one, an accessible name),
 * one error message that the fields it concerns point to, the fields and a submit button.
 */
export function InlineForm({
  heading,
  label,
  error,
  submitLabel,
  onSubmit,
  actions,
  children,
}: {
  /** Visible heading; leave out for a compact form named by `label`. */
  heading?: string;
  label?: string;
  error: FormError | null;
  submitLabel: string;
  onSubmit: () => void;
  /** Extra buttons shown after the submit button. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form
      className={heading ? 'inner form' : 'form compact-form'}
      onSubmit={submit}
      noValidate
      aria-labelledby={heading ? `${id}-heading` : undefined}
      aria-label={heading ? undefined : label}
    >
      {heading && (
        <h3 id={`${id}-heading`} className="panel-title">
          {heading}
        </h3>
      )}
      {error && (
        <p id={`${id}-error`} className="error-text" role="alert">
          {error.message}
        </p>
      )}
      <FormContext.Provider value={{ id, error }}>{children}</FormContext.Provider>
      <div className="actions">
        <button type="submit" className="btn btn-secondary btn-small">
          {submitLabel}
        </button>
        {actions}
      </div>
    </form>
  );
}

/** Props a form control needs to be labelled and tied to the form's error. */
export interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

/** A labelled field inside an InlineForm; `name` is what a FormError lists when it is wrong. */
export function FormField({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const { id, error } = useContext(FormContext);
  const invalid = error?.fields.includes(name) ?? false;
  const controlId = `${id}-${name}`;
  return (
    <div className="field">
      <label className="label" htmlFor={controlId}>
        {label}
      </label>
      {children({
        id: controlId,
        'aria-invalid': invalid,
        'aria-describedby': invalid ? `${id}-error` : undefined,
      })}
    </div>
  );
}
