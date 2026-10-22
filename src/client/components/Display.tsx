import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import type { Currency } from '../../shared/money.js';
import { formatMoney, parseWholeNumber } from '../../shared/money.js';
import type { VendorState } from '../../shared/vendors.js';

/** An amount in the plan's currency, with tabular digits. */
export function Money({ amount, currency }: { amount: number; currency: Currency }) {
  return <span className="num">{formatMoney(amount, currency)}</span>;
}

/**
 * A thin progress track drawn in SVG (no inline styles, so the strict CSP holds).
 * The label states the same numbers in words for screen readers.
 */
export function Track({
  value,
  max,
  secondary,
  label,
  over = false,
}: {
  value: number;
  max: number;
  /** A lighter segment, e.g. money already spent inside the planned amount. */
  secondary?: number;
  label: string;
  over?: boolean;
}) {
  const ratio = (v: number) => (max > 0 ? Math.min(Math.max(v / max, 0), 1) * 100 : 0);
  return (
    <svg
      className="track-svg"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <rect className="track-bg" x="0" y="0" width="100" height="10" rx="5" />
      {value > 0 && (
        <rect
          className={`track-value${over ? ' over' : ''}`}
          x="0"
          y="0"
          width={ratio(value)}
          height="10"
          rx="5"
        />
      )}
      {secondary !== undefined && secondary > 0 && (
        <rect className="track-secondary" x="0" y="0" width={ratio(secondary)} height="10" rx="5" />
      )}
    </svg>
  );
}

type PillTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';

/** A small status label; the tone is never the only signal, the words carry it. */
export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`pill${tone === 'neutral' ? '' : ` pill-${tone}`}`}>{children}</span>;
}

const VENDOR_PILLS: Partial<Record<VendorState, { tone: PillTone; text: string }>> = {
  overdue: { tone: 'negative', text: 'Book now' },
  'book-soon': { tone: 'warning', text: 'Book soon' },
  booked: { tone: 'positive', text: 'Booked' },
};

/** Where a vendor booking stands, when it needs attention or is done. */
export function VendorStatePill({ state }: { state: VendorState }) {
  const pill = VENDOR_PILLS[state];
  return pill ? <Pill tone={pill.tone}>{pill.text}</Pill> : null;
}

/** Digit grouping that matches the money format used everywhere else (en-IN: 2,50,000). */
const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * A money field that commits on blur or Enter, so the budget rebalances once
 * when the user finishes typing rather than on every keystroke.
 */
export function AmountInput({
  value,
  onCommit,
  label,
  id,
  max,
}: {
  value: number;
  onCommit: (value: number) => void;
  /** Accessible name; leave out when a visible <label htmlFor={id}> names it. */
  label?: string;
  id?: string;
  max: number;
}) {
  const [text, setText] = useState(() => grouped.format(value));
  const [invalid, setInvalid] = useState(false);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const errorId = `${inputId}-error`;
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(grouped.format(value));
  }, [value]);

  const commit = () => {
    editing.current = false;
    const amount = parseWholeNumber(text);
    if (amount === null || amount > max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(grouped.format(amount));
    if (amount !== value) onCommit(amount);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      editing.current = false;
      setInvalid(false);
      setText(grouped.format(value));
    }
  };

  return (
    <span className="amount-input">
      <input
        className="input input-compact"
        inputMode="numeric"
        id={inputId}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        value={text}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {invalid && (
        <span id={errorId} className="error-text">
          Whole number
        </span>
      )}
    </span>
  );
}

/**
 * A message after an undoable change, with Undo. Not itself a live region: the
 * announcer already speaks the message, so screen readers hear it once.
 */
export function Toast({
  message,
  action,
  onDismiss,
}: {
  message: string;
  action?: { label: string; run: () => void };
  onDismiss: () => void;
}) {
  return (
    <div className="toast">
      <span>{message}</span>
      {action && (
        <button type="button" className="btn btn-small" onClick={action.run}>
          {action.label}
        </button>
      )}
      <button type="button" className="btn btn-small" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
