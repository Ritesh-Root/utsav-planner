import { useId, useMemo, useState } from 'react';

import { projectGuests, summarizeBudget } from '../../shared/budget.js';
import { LIMITS } from '../../shared/limits.js';
import type { Currency } from '../../shared/money.js';
import { formatMoney, parseWholeNumber } from '../../shared/money.js';
import {
  addBudgetLine,
  applyGuestChange,
  randomId,
  removeBudgetLine,
  setLineActual,
  setLineAmount,
  unlockLine,
} from '../../shared/plan.js';
import { committedByKey } from '../../shared/vendors.js';
import { AmountInput, Money, Pill, Track } from '../components/Display';
import type { FormError } from '../components/InlineForm';
import { FormField, InlineForm } from '../components/InlineForm';
import type { PanelProps } from './types';

/** A formatter for one currency, shared by everything on this tab. */
const moneyIn = (currency: Currency) => (value: number) => formatMoney(value, currency);

function GuestWhatIf({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const { brief } = plan;
  const [text, setText] = useState(String(brief.guests));
  const inputId = useId();
  const parsed = parseWholeNumber(text);
  const guests = parsed ?? 0;
  const valid = parsed !== null && guests >= LIMITS.guestsMin && guests <= LIMITS.guestsMax;
  const projection = valid ? projectGuests(plan.budget, brief.guests, guests, brief.budget) : null;
  const changed = valid && guests !== brief.guests;
  const money = moneyIn(brief.currency);

  return (
    <section className="panel span-4" aria-labelledby="whatif-title">
      <h2 id="whatif-title" className="panel-title">
        What if the guest list changes?
      </h2>
      <div className="field">
        <label className="label" htmlFor={inputId}>
          Guests
        </label>
        <input
          id={inputId}
          className="input"
          inputMode="numeric"
          value={text}
          aria-invalid={!valid}
          aria-describedby={`${inputId}-result`}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </div>
      <p id={`${inputId}-result`} aria-live="polite">
        {!valid && `Enter a whole number from ${LIMITS.guestsMin} to ${LIMITS.guestsMax}.`}
        {projection &&
          !changed &&
          `Planned for ${brief.guests} guests. Change the number to see the cost.`}
        {projection &&
          changed &&
          `At ${guests} guests, keeping the same spend per guest costs about ${money(projection.projectedTotal)}: ${
            projection.difference > 0
              ? `${money(projection.difference)} more than`
              : projection.difference < 0
                ? `${money(-projection.difference)} less than`
                : 'the same as'
          } your ${money(brief.budget)} budget.`}
      </p>
      {projection && changed && (
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => {
              update(applyGuestChange(plan, guests, 'raise-budget', new Date()), {
                undoable: true,
                announcement: `Guests set to ${guests} and budget set to ${money(projection.projectedTotal)}`,
              });
            }}
          >
            Use {money(projection.projectedTotal)}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              update(applyGuestChange(plan, guests, 'keep-budget', new Date()), {
                undoable: true,
                announcement: `Guests set to ${guests}; the ${money(brief.budget)} budget was re-split`,
              });
            }}
          >
            Keep {money(brief.budget)}
          </button>
        </div>
      )}
    </section>
  );
}

function AddLineForm({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    const value = parseWholeNumber(amount);
    const badAmount = value === null || value > LIMITS.budgetMax;
    if (category.trim() === '' || badAmount) {
      setError({
        message: 'Name the line and give a whole-number amount.',
        fields: [...(category.trim() === '' ? ['category'] : []), ...(badAmount ? ['amount'] : [])],
      });
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
        <FormField name="category" label="What it is for">
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
        <FormField name="amount" label={`Amount (${plan.brief.currency})`}>
          {(control) => (
            <input
              {...control}
              className="input"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
            />
          )}
        </FormField>
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
  const committed = useMemo(() => committedByKey(plan.vendors), [plan.vendors]);
  const money = moneyIn(brief.currency);
  const now = () => new Date();

  return (
    <div className="grid">
      <section className="panel span-8" aria-labelledby="budget-title">
        <div className="panel-head">
          <h2 id="budget-title" className="panel-title">
            Budget
          </h2>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              refine('budget');
            }}
          >
            Rebalance with AI
          </button>
        </div>
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
        <div className="table-wrap">
          <table className="table">
            <caption>
              Type an amount to lock it; the other lines rebalance so the plan still adds up. Ranges
              are AI estimates, not quotes.
            </caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  Planned
                </th>
                <th scope="col" className="num">
                  Spent
                </th>
                <th scope="col" className="num">
                  Typical range
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.budget.map((line) => {
                const booked = committed[line.key] ?? 0;
                return (
                  <tr key={line.id}>
                    <td>
                      <div className="row-main">
                        <span className="row-title">{line.category}</span>
                        <span className="row-sub">{line.rationale}</span>
                        {booked > 0 && (
                          <span className="row-sub">{money(booked)} in booked vendor quotes</span>
                        )}
                        {plan.budget.length > 1 && (
                          <span className="row-actions">
                            <button
                              type="button"
                              className="link-button quiet-link"
                              aria-label={`Remove: ${line.category}`}
                              onClick={() => {
                                update(removeBudgetLine(plan, line.id, now()), {
                                  undoable: true,
                                  announcement: `Removed ${line.category}; other lines rebalanced`,
                                });
                              }}
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num" data-label="Planned">
                      <div className="cell-edit">
                        {line.locked && (
                          <button
                            type="button"
                            className="link-button"
                            aria-label={`Reset: ${line.category}`}
                            onClick={() => {
                              update(unlockLine(plan, line.id, now()), { undoable: true });
                            }}
                          >
                            Reset
                          </button>
                        )}
                        <AmountInput
                          value={line.amount}
                          max={LIMITS.budgetMax}
                          label={`Planned for ${line.category}`}
                          onCommit={(amount) => {
                            update(setLineAmount(plan, line.id, amount, now()), {
                              undoable: true,
                              announcement: `${line.category} set to ${money(amount)}; other lines rebalanced`,
                            });
                          }}
                        />
                      </div>
                      {line.locked && <Pill>Set by you</Pill>}
                    </td>
                    <td className="num" data-label="Spent">
                      <AmountInput
                        value={line.actual}
                        max={LIMITS.budgetMax}
                        label={`Spent on ${line.category}`}
                        onCommit={(amount) => {
                          update(setLineActual(plan, line.id, amount, now()));
                        }}
                      />
                    </td>
                    <td className="num" data-label="Typical range (AI estimate)">
                      {line.estHigh > 0 ? (
                        <span className="unit">
                          {money(line.estLow)}–{money(line.estHigh)}
                        </span>
                      ) : (
                        <span className="unit">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">No estimate</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num" data-label="Planned">
                  {money(summary.planned)}
                </td>
                <td className="num" data-label="Spent">
                  {money(summary.actual)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <AddLineForm plan={plan} update={update} />
      </section>
      <GuestWhatIf key={`${brief.guests}-${brief.budget}`} plan={plan} update={update} />
    </div>
  );
}
