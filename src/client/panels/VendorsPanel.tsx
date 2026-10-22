import { useId } from 'react';

import { formatDate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { googleMapsSearchUrl } from '../../shared/links.js';
import type { Vendor, VendorStatus } from '../../shared/schemas.js';
import { VENDOR_STATUSES } from '../../shared/schemas.js';
import { VENDOR_STATUS_LABELS, vendorProgress, vendorState } from '../../shared/vendors.js';
import { AmountInput, Pill, Track } from '../components/Display';
import type { PanelProps } from './types';

function VendorItem({
  vendor,
  plan,
  today,
  onChange,
}: {
  vendor: Vendor;
  plan: PanelProps['plan'];
  today: string;
  onChange: (changes: Partial<Vendor>, announcement?: string) => void;
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
          <ul className="questions">
            {vendor.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          <p>
            <a
              href={googleMapsSearchUrl(vendor.category, plan.brief.location)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Find {vendor.category.toLowerCase()} near {plan.brief.location} on Google Maps
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <div className="field-row">
            {text('contactName', 'Vendor name', LIMITS.vendorFieldMax)}
            {text('contact', 'Phone or email', LIMITS.vendorFieldMax)}
            <div className="field">
              <span className="label" id={`${id}-quote-label`}>
                Quote ({plan.brief.currency})
              </span>
              <AmountInput
                value={vendor.quote}
                max={LIMITS.budgetMax}
                label={`Quote from ${vendor.category}`}
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
        </div>
      </details>
    </li>
  );
}

export default function VendorsPanel({ plan, today, update, refine }: PanelProps) {
  const progress = vendorProgress(plan.vendors);

  const change = (vendorId: string) => (changes: Partial<Vendor>, announcement?: string) => {
    update(
      { ...plan, vendors: plan.vendors.map((v) => (v.id === vendorId ? { ...v, ...changes } : v)) },
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
        <ul className="rows vendors">
          {plan.vendors.map((vendor) => (
            <VendorItem
              key={vendor.id}
              vendor={vendor}
              plan={plan}
              today={today}
              onChange={change(vendor.id)}
            />
          ))}
        </ul>
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
