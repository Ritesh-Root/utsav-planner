import { useState } from 'react';

import { addDays, diffDays, formatDate, isISODate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';
import type { VendorChanges } from '../../shared/plan.js';
import {
  addCustomVendor,
  planIsFull,
  randomId,
  removeVendor,
  updateVendor,
} from '../../shared/plan.js';
import { vendorProgress } from '../../shared/vendors.js';
import { Track } from '../components/Display';
import type { FormError } from '../components/InlineForm';
import { InlineForm, TextField, fullPlanError } from '../components/InlineForm';
import { LinkButton, Panel } from '../components/Layout';
import type { PanelProps } from './types';
import { VendorItem } from './VendorItem';

function AddVendorForm({ plan, today, update }: Pick<PanelProps, 'plan' | 'today' | 'update'>) {
  const [category, setCategory] = useState('');
  const [bookBy, setBookBy] = useState(() => {
    const twoWeeks = addDays(today, 14);
    return twoWeeks < plan.brief.date ? twoWeeks : today;
  });
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    if (planIsFull(plan, 'vendors')) {
      setError(fullPlanError('vendors'));
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
    if (diffDays(today, bookBy) < 0) {
      setError({ message: 'Choose today or a later date to book by.', fields: ['book-by'] });
      return;
    }
    setError(null);
    const context = { today, now: new Date(), newId: randomId };
    update(addCustomVendor(plan, { category, budgetKey: 'misc', bookBy }, context), {
      undoable: true,
      announcement: `Added ${category.trim()}`,
    });
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
        <TextField
          name="category"
          label="Kind of vendor"
          maxLength={LIMITS.shortText}
          value={category}
          onChange={setCategory}
        />
        <TextField
          name="book-by"
          label="Book by"
          type="date"
          min={today}
          max={plan.brief.date}
          value={bookBy}
          onChange={setBookBy}
        />
      </div>
    </InlineForm>
  );
}

function AboutVendors({ plan }: Pick<PanelProps, 'plan'>) {
  return (
    <Panel id="vendors-about" title="Finding real vendors" className="span-4">
      <p>
        Utsav never names businesses or makes up contact details. It tells you which kinds of vendor
        this event needs, when to book them and what to ask.
      </p>
      <p className="panel-caption">
        Use the Google Maps link on each vendor to find and compare real ones near{' '}
        {plan.brief.location}. Book-by dates count back from {formatDate(plan.brief.date)}.
      </p>
    </Panel>
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
  const action = (
    <LinkButton
      onClick={() => {
        refine('vendors');
      }}
    >
      Change vendors with AI
    </LinkButton>
  );

  return (
    <div className="grid">
      <Panel id="vendors-title" title="Vendor checklist" className="span-8" action={action}>
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
      </Panel>
      <AboutVendors plan={plan} />
    </div>
  );
}
