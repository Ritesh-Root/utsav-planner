import { useId, useState } from 'react';

import { VENDOR_STATUSES } from '../../shared/constants.js';
import { addDays, formatDate, isISODate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { googleMapsSearchUrl } from '../../shared/links.js';
import type { VendorChanges } from '../../shared/plan.js';
import {
  addCustomVendor,
  planIsFull,
  randomId,
  removeVendor,
  updateVendor,
} from '../../shared/plan.js';
import type { Vendor, VendorStatus } from '../../shared/schemas.js';
import { vendorProgress, vendorState } from '../../shared/vendors.js';
import { AmountInput, Pill, Track } from '../components/Display';
import type { FormError } from '../components/InlineForm';
import { FormField, InlineForm } from '../components/InlineForm';
import { VENDOR_STATUS_LABELS } from '../labels';
import type { PanelProps } from './types';

function VendorItem({
  vendor,
  location,
  currency,
  today,
  onChange,
  onRemove,
}: {
  vendor: Vendor;
  location: string;
  currency: string;
  today: string;
  onChange: (changes: VendorChanges, announcement?: string) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const state = vendorState(vendor, today);
  const text = (
    field: 'contactName' | 'contact' | 'notes',
    label: string,
    max: number,
    multiline = false,
  ) => {
    const props = {
      id: `${id}-${field}`,
      defaultValue: vendor[field],
      maxLength: max,
      onBlur: (e: { target: { value: string } }) => {
        if (e.target.value !== vendor[field]) onChange({ [field]: e.target.value });
      },
    };
    return (
      <div className="field">
        <label className="label" htmlFor={props.id}>
          {label}
        </label>
        {multiline ? (
          <textarea className="textarea" {...props} />
        ) : (
          <input className="input" {...props} />
        )}
      </div>
    );
  };

  return (
    <li className="vendor">
      <div className="row">
        <div className="row-main">
          <h3 className="row-title">{vendor.category}</h3>
          <span className="row-sub">{vendor.why}</span>
          <span className="row-sub">
            Book by <time dateTime={vendor.bookBy}>{formatDate(vendor.bookBy)}</time>
            {state === 'overdue' && ' · the ideal booking time has passed'}
          </span>
        </div>
        <div className="row-end">
          {state === 'overdue' && <Pill tone="negative">Book now</Pill>}
          {state === 'book-soon' && <Pill tone="warning">Book soon</Pill>}
          {state === 'booked' && <Pill tone="positive">Booked</Pill>}
          <label className="sr-only" htmlFor={`${id}-status`}>
            Status for {vendor.category}
          </label>
          <select
            id={`${id}-status`}
            className="select select-compact"
            value={vendor.status}
            onChange={(e) => {
              const status = e.target.value as VendorStatus;
              onChange({ status }, `${vendor.category}: ${VENDOR_STATUS_LABELS[status]}`);
            }}
          >
            {VENDOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VENDOR_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <details>
        <summary>
          Questions to ask and your notes<span className="sr-only"> for {vendor.category}</span>
        </summary>
        <div className="vendor-body">
          {vendor.questions.length > 0 && (
            <ul className="questions">
              {vendor.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          )}
          <p>
            <a
              href={googleMapsSearchUrl(vendor.category, location)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Find {vendor.category.toLowerCase()} near {location} on Google Maps
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <div className="field-row">
            {text('contactName', 'Vendor name', LIMITS.vendorFieldMax)}
            {text('contact', 'Phone or email', LIMITS.vendorFieldMax)}
            <div className="field">
              <label className="label" htmlFor={`${id}-quote`}>
                Quote ({currency})
              </label>
              <AmountInput
                id={`${id}-quote`}
                value={vendor.quote}
                max={LIMITS.budgetMax}
                onCommit={(quote) => {
                  onChange({ quote });
                }}
              />
            </div>
          </div>
          {text('notes', 'Notes', LIMITS.vendorNotesMax, true)}
          <p className="hint">
            Names, contacts, quotes and notes stay on this device and are never sent to the AI.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              aria-label={`Remove: ${vendor.category}`}
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}

function AddVendorForm({ plan, today, update }: Pick<PanelProps, 'plan' | 'today' | 'update'>) {
  const [category, setCategory] = useState('');
  const [bookBy, setBookBy] = useState(() => {
    const twoWeeks = addDays(today, 14);
    return twoWeeks < plan.brief.date ? twoWeeks : today;
  });
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    if (planIsFull(plan, 'vendors')) {
      setError({
        message: 'This plan already holds as many vendors as Utsav keeps. Remove one first.',
        fields: [],
      });
      return;
    }
    if (category.trim() === '') {
      setError({
        message: 'Say which kind of vendor, for example "Live band".',
        fields: ['category'],
      });
      return;
    }
    if (!isISODate(bookBy)) {
      setError({ message: 'Choose the date to book by.', fields: ['book-by'] });
      return;
    }
    setError(null);
    update(
      addCustomVendor(plan, { category, budgetKey: 'misc', bookBy }, randomId, today, new Date()),
      { undoable: true, announcement: `Added ${category.trim()}` },
    );
    setCategory('');
  };

  return (
    <InlineForm
      heading="Add a vendor you need"
      error={error}
      submitLabel="Add vendor"
      onSubmit={submit}
    >
      <div className="field-row">
        <FormField name="category" label="Kind of vendor">
          {(control) => (
            <input
              {...control}
              className="input"
              maxLength={LIMITS.shortText}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField name="book-by" label="Book by">
          {(control) => (
            <input
              {...control}
              className="input"
              type="date"
              min={today}
              max={plan.brief.date}
              value={bookBy}
              onChange={(e) => {
                setBookBy(e.target.value);
              }}
            />
          )}
        </FormField>
      </div>
    </InlineForm>
  );
}

/** Which vendors to book, by when and what to ask, with the user's own notes kept local. */
export default function VendorsPanel({ plan, today, update, refine }: PanelProps) {
  const progress = vendorProgress(plan.vendors);

  const change = (vendorId: string) => (changes: VendorChanges, announcement?: string) => {
    update(
      updateVendor(plan, vendorId, changes, new Date()),
      announcement ? { undoable: true, announcement } : {},
    );
  };

  return (
    <div className="grid">
      <section className="panel span-8" aria-labelledby="vendors-title">
        <div className="panel-head">
          <h2 id="vendors-title" className="panel-title">
            Vendor checklist
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              refine('vendors');
            }}
          >
            Change vendors with AI
          </button>
        </div>
        <p className="panel-figure">
          {progress.booked} of {progress.needed} booked
        </p>
        <Track
          value={progress.booked}
          max={progress.needed}
          label={`${progress.booked} of ${progress.needed} vendors booked`}
        />
        {plan.vendors.length === 0 ? (
          <p className="empty">No vendors on the checklist. Add one below.</p>
        ) : (
          <ul className="rows vendors">
            {plan.vendors.map((vendor) => (
              <VendorItem
                key={vendor.id}
                vendor={vendor}
                location={plan.brief.location}
                currency={plan.brief.currency}
                today={today}
                onChange={change(vendor.id)}
                onRemove={() => {
                  update(removeVendor(plan, vendor.id, new Date()), {
                    undoable: true,
                    announcement: `Removed ${vendor.category}`,
                  });
                }}
              />
            ))}
          </ul>
        )}
        <AddVendorForm plan={plan} today={today} update={update} />
      </section>
      <section className="panel span-4" aria-labelledby="vendors-about">
        <h2 id="vendors-about" className="panel-title">
          Finding real vendors
        </h2>
        <p>
          Utsav never names businesses or makes up contact details. It tells you which kinds of
          vendor this event needs, when to book them and what to ask.
        </p>
        <p className="panel-caption">
          Use the Google Maps link on each vendor to find and compare real ones near{' '}
          {plan.brief.location}. Book-by dates count back from {formatDate(plan.brief.date)}.
        </p>
      </section>
    </div>
  );
}
