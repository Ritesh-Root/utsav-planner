import { useState } from 'react';

import { applyBriefChange, applyGuestChange } from '../../shared/plan.js';
import type { Plan } from '../../shared/schemas.js';
import type { BriefDraft, FieldErrors } from '../briefDraft';
import { draftFromBrief, toBrief } from '../briefDraft';
import { BriefForm } from './BriefForm';
import { Dialog } from './Dialog';

/**
 * Edit every detail of an existing event with the same form and checks as a new
 * one. The plan follows deterministically: a new date reschedules open tasks, a
 * new guest count re-splits per-guest lines, a new budget rebalances.
 */
export function EditDetailsDialog({
  plan,
  today,
  onSave,
  onClose,
}: {
  plan: Plan;
  today: string;
  onSave: (plan: Plan) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BriefDraft>(() => draftFromBrief(plan.brief));
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = () => {
    const result = toBrief(draft, today);
    if (!result.brief) {
      setErrors(result.errors);
      return;
    }
    const now = new Date();
    const regrouped =
      result.brief.guests === plan.brief.guests
        ? plan
        : applyGuestChange(plan, result.brief.guests, 'keep-budget', now);
    onSave(applyBriefChange(regrouped, result.brief, today, now));
  };

  return (
    <Dialog open onClose={onClose} title="Edit event details">
      <p className="hint">
        A new date moves every open task. A new budget or guest count re-splits the lines you have
        not set yourself.
      </p>
      <BriefForm
        draft={draft}
        errors={errors}
        onChange={setDraft}
        onSubmit={save}
        submitLabel="Save details"
        hideType
        onCancel={onClose}
      />
    </Dialog>
  );
}
