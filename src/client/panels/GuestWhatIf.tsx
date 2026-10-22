import { useId, useState } from 'react';

import { projectGuests } from '../../shared/budget.js';
import { LIMITS } from '../../shared/limits.js';
import type { FormatMoney } from '../../shared/money.js';
import { moneyFormatter, parseWholeNumber } from '../../shared/money.js';
import type { GuestChangeMode } from '../../shared/plan.js';
import { applyGuestChange } from '../../shared/plan.js';
import { Panel } from '../components/Layout';
import type { PanelProps } from './types';

function comparedToBudget(difference: number, money: FormatMoney): string {
  if (difference > 0) return `${money(difference)} more than`;
  if (difference < 0) return `${money(-difference)} less than`;
  return 'the same as';
}

function GuestChoices({
  plan,
  guests,
  projectedTotal,
  update,
}: Pick<PanelProps, 'plan' | 'update'> & { guests: number; projectedTotal: number }) {
  const money = moneyFormatter(plan.brief.currency);
  const choose = (mode: GuestChangeMode, announcement: string) => () => {
    update(applyGuestChange(plan, guests, mode, new Date()), { undoable: true, announcement });
  };
  return (
    <div className="actions">
      <button
        type="button"
        className="btn btn-primary btn-small"
        onClick={choose(
          'raise-budget',
          `Guests set to ${guests} and budget set to ${money(projectedTotal)}`,
        )}
      >
        Use {money(projectedTotal)}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={choose(
          'keep-budget',
          `Guests set to ${guests}; the ${money(plan.brief.budget)} budget was re-split`,
        )}
      >
        Keep {money(plan.brief.budget)}
      </button>
    </div>
  );
}

/** The typed guest count, or null unless it is a whole number Utsav can plan for. */
function guestCount(text: string): number | null {
  const guests = parseWholeNumber(text);
  return guests !== null && guests >= LIMITS.guestsMin && guests <= LIMITS.guestsMax
    ? guests
    : null;
}

/** Try another guest count and see the cost at the same spend per guest. */
export function GuestWhatIf({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const { brief } = plan;
  const [text, setText] = useState(String(brief.guests));
  const inputId = useId();
  const guests = guestCount(text);
  const projection =
    guests !== null && guests !== brief.guests
      ? projectGuests(plan.budget, brief.guests, guests, brief.budget)
      : null;
  const money = moneyFormatter(brief.currency);

  let message = `Planned for ${brief.guests} guests. Change the number to see the cost.`;
  if (guests === null) {
    message = `Enter a whole number from ${LIMITS.guestsMin} to ${LIMITS.guestsMax}.`;
  } else if (projection) {
    message = `At ${guests} guests, keeping the same spend per guest costs about ${money(projection.projectedTotal)}: ${comparedToBudget(projection.difference, money)} your ${money(brief.budget)} budget.`;
  }

  return (
    <Panel id="whatif-title" title="What if the guest list changes?" className="span-4">
      <div className="field">
        <label className="label" htmlFor={inputId}>
          Guests
        </label>
        <input
          id={inputId}
          className="input"
          inputMode="numeric"
          value={text}
          aria-invalid={guests === null}
          aria-describedby={`${inputId}-result`}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </div>
      <p id={`${inputId}-result`} aria-live="polite">
        {message}
      </p>
      {guests !== null && projection && (
        <GuestChoices
          plan={plan}
          guests={guests}
          projectedTotal={projection.projectedTotal}
          update={update}
        />
      )}
    </Panel>
  );
}
