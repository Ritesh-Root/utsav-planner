import { useMemo, useState } from 'react';

import { summarizeBudget } from '../../shared/budget.js';
import { LIMITS } from '../../shared/limits.js';
import { moneyFormatter, parseWholeNumber } from '../../shared/money.js';
import { addBudgetLine, planIsFull, randomId } from '../../shared/plan.js';
import { Money, Track } from '../components/Display';
import type { FormError } from '../components/InlineForm';
import { InlineForm, TextField, fullPlanError } from '../components/InlineForm';
import { LinkButton, Panel } from '../components/Layout';
import { BudgetTable } from './BudgetTable';
import { GuestWhatIf } from './GuestWhatIf';
import type { PanelProps } from './types';

function AddLineForm({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    if (planIsFull(plan, 'budget')) {
      setError(fullPlanError('budget lines'));
      return;
    }
    const value = parseWholeNumber(amount);
    const missingName = category.trim() === '';
    const badAmount = value === null || value > LIMITS.budgetMax;
    if (missingName || badAmount) {
      const fields = [missingName && 'category', badAmount && 'amount'].filter((f) => f !== false);
      setError({ message: 'Name the line and give a whole-number amount.', fields });
      return;
    }
    setError(null);
    update(addBudgetLine(plan, { category, amount: value }, randomId, new Date()), {
      undoable: true,
      announcement: `Added ${category.trim()}; other lines rebalanced`,
    });
    setCategory('');
    setAmount('');
  };

  return (
    <InlineForm heading="Add a budget line" error={error} submitLabel="Add line" onSubmit={submit}>
      <div className="field-row">
        <TextField
          name="category"
          label="What it is for"
          maxLength={LIMITS.shortText}
          value={category}
          onChange={setCategory}
        />
        <TextField
          name="amount"
          label={`Amount (${plan.brief.currency})`}
          inputMode="numeric"
          value={amount}
          onChange={setAmount}
        />
      </div>
    </InlineForm>
  );
}

/** Planned and spent money by category, with exact rebalancing and a guest-count what-if. */
export default function BudgetPanel({ plan, update, refine }: PanelProps) {
  const { brief } = plan;
  const summary = useMemo(
    () => summarizeBudget(plan.budget, brief.budget, brief.guests),
    [plan.budget, brief],
  );
  const money = moneyFormatter(brief.currency);
  const action = (
    <LinkButton
      onClick={() => {
        refine('budget');
      }}
    >
      Rebalance with AI
    </LinkButton>
  );

  return (
    <div className="grid">
      <Panel id="budget-title" title="Budget" className="span-8" action={action}>
        <p className="panel-figure">
          <Money amount={summary.planned} currency={brief.currency} />
        </p>
        <p className="panel-caption">
          planned of {money(brief.budget)} · {money(summary.actual)} spent ·{' '}
          {summary.overBy > 0 ? (
            <strong className="negative-text">{money(summary.overBy)} over budget</strong>
          ) : (
            `${money(summary.remaining)} not yet planned`
          )}
        </p>
        <Track
          value={summary.planned}
          max={Math.max(brief.budget, summary.planned)}
          secondary={summary.actual}
          over={summary.overBy > 0}
          label={`${money(summary.planned)} planned and ${money(summary.actual)} spent of ${money(brief.budget)}`}
        />
        <BudgetTable
          plan={plan}
          update={update}
          planned={summary.planned}
          actual={summary.actual}
        />
        <AddLineForm plan={plan} update={update} />
      </Panel>
      <GuestWhatIf key={`${brief.guests}-${brief.budget}`} plan={plan} update={update} />
    </div>
  );
}
