import { useId } from 'react';

import { VENDOR_STATUSES } from '../../shared/constants.js';
import { formatDate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import { googleMapsSearchUrl } from '../../shared/links.js';
import type { VendorChanges } from '../../shared/plan.js';
import type { Vendor } from '../../shared/schemas.js';
import { vendorState } from '../../shared/vendors.js';
import { AmountInput, VendorStatePill } from '../components/Display';
import { Select } from '../components/Select';
import { VENDOR_STATUS_LABELS } from '../labels';

type NoteFieldName = 'contactName' | 'contact' | 'notes';

interface VendorItemProps {
  vendor: Vendor;
  location: string;
  currency: string;
  today: string;
  onChange: (changes: VendorChanges, announcement?: string) => void;
  onRemove: () => void;
}

/** One of the user's private notes about a vendor; saved when the field loses focus. */
function NoteField({
  idPrefix,
  vendor,
  field,
  label,
  onChange,
}: Pick<VendorItemProps, 'vendor' | 'onChange'> & {
  idPrefix: string;
  field: NoteFieldName;
  label: string;
}) {
  const props = {
    id: `${idPrefix}-${field}`,
    defaultValue: vendor[field],
    maxLength: field === 'notes' ? LIMITS.vendorNotesMax : LIMITS.vendorFieldMax,
    onBlur: (e: { target: { value: string } }) => {
      if (e.target.value !== vendor[field]) onChange({ [field]: e.target.value });
    },
  };
  return (
    <div className="field">
      <label className="label" htmlFor={props.id}>
        {label}
      </label>
      {field === 'notes' ? (
        <textarea className="textarea" {...props} />
      ) : (
        <input className="input" {...props} />
      )}
    </div>
  );
}

function VendorSummary({
  idPrefix,
  vendor,
  today,
  onChange,
}: Pick<VendorItemProps, 'vendor' | 'today' | 'onChange'> & { idPrefix: string }) {
  const state = vendorState(vendor, today);
  return (
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
        <VendorStatePill state={state} />
        <label className="sr-only" htmlFor={`${idPrefix}-status`}>
          Status for {vendor.category}
        </label>
        <Select
          id={`${idPrefix}-status`}
          className="select select-compact"
          value={vendor.status}
          options={VENDOR_STATUSES}
          optionLabel={(status) => VENDOR_STATUS_LABELS[status]}
          onChange={(status) => {
            onChange({ status }, `${vendor.category}: ${VENDOR_STATUS_LABELS[status]}`);
          }}
        />
      </div>
    </div>
  );
}

function VendorDetails({
  idPrefix,
  vendor,
  location,
  currency,
  onChange,
  onRemove,
}: Omit<VendorItemProps, 'today'> & { idPrefix: string }) {
  const note = { idPrefix, vendor, onChange };
  return (
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
        <NoteField {...note} field="contactName" label="Vendor name" />
        <NoteField {...note} field="contact" label="Phone or email" />
        <div className="field">
          <label className="label" htmlFor={`${idPrefix}-quote`}>
            Quote ({currency})
          </label>
          <AmountInput
            id={`${idPrefix}-quote`}
            value={vendor.quote}
            max={LIMITS.budgetMax}
            onCommit={(quote) => {
              onChange({ quote });
            }}
          />
        </div>
      </div>
      <NoteField {...note} field="notes" label="Notes" />
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
  );
}

/** A vendor on the checklist: when to book, its status, and the user's own notes. */
export function VendorItem(props: VendorItemProps) {
  const idPrefix = useId();
  const { vendor } = props;
  return (
    <li className="vendor">
      <VendorSummary {...props} idPrefix={idPrefix} />
      <details>
        <summary>
          Questions to ask and your notes<span className="sr-only"> for {vendor.category}</span>
        </summary>
        <VendorDetails {...props} idPrefix={idPrefix} />
      </details>
    </li>
  );
}
