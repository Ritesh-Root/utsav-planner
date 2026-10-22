import { useMemo } from 'react';

import { LIMITS } from '../../shared/limits.js';
import type { FormatMoney } from '../../shared/money.js';
import { moneyFormatter } from '../../shared/money.js';
import { removeBudgetLine, setLineActual, setLineAmount, unlockLine } from '../../shared/plan.js';
import type { BudgetLine } from '../../shared/schemas.js';
import { committedByKey } from '../../shared/vendors.js';
import { AmountInput, Pill } from '../components/Display';
import { LinkButton } from '../components/Layout';
import type { PanelProps } from './types';

interface RowProps extends Pick<PanelProps, 'plan' | 'update'> {
  line: BudgetLine;
  money: FormatMoney;
}

function CategoryCell({ plan, update, line, money, booked }: RowProps & { booked: number }) {
  return (
    <td>
      <div className="row-main">
        <span className="row-title">{line.category}</span>
        <span className="row-sub">{line.rationale}</span>
        {booked > 0 && <span className="row-sub">{money(booked)} in booked vendor quotes</span>}
        {plan.budget.length > 1 && (
          <span className="row-actions">
            <button
              type="button"
              className="link-button quiet-link"
              aria-label={`Remove: ${line.category}`}
              onClick={() => {
                update(removeBudgetLine(plan, line.id, new Date()), {
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
  );
}

function PlannedCell({ plan, update, line, money }: RowProps) {
  return (
    <td className="num" data-label="Planned">
      <div className="cell-edit">
        {line.locked && (
          <LinkButton
            label={`Reset: ${line.category}`}
            onClick={() => {
              update(unlockLine(plan, line.id, new Date()), { undoable: true });
            }}
          >
            Reset
          </LinkButton>
        )}
        <AmountInput
          value={line.amount}
          max={LIMITS.budgetMax}
          label={`Planned for ${line.category}`}
          onCommit={(amount) => {
            update(setLineAmount(plan, line.id, amount, new Date()), {
              undoable: true,
              announcement: `${line.category} set to ${money(amount)}; other lines rebalanced`,
            });
          }}
        />
      </div>
      {line.locked && <Pill>Set by you</Pill>}
    </td>
  );
}

function BudgetRow(props: RowProps & { booked: number }) {
  const { plan, update, line, money } = props;
  return (
    <tr>
      <CategoryCell {...props} />
      <PlannedCell {...props} />
      <td className="num" data-label="Spent">
        <AmountInput
          value={line.actual}
          max={LIMITS.budgetMax}
          label={`Spent on ${line.category}`}
          onCommit={(amount) => {
            update(setLineActual(plan, line.id, amount, new Date()));
          }}
        />
      </td>
      <td className="num" data-label="Typical range (AI estimate)">
        <span className="unit">
          {line.estHigh > 0 ? (
            `${money(line.estLow)}–${money(line.estHigh)}`
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">No estimate</span>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

/** Every budget line, editable: lock an amount, record spend or remove the line. */
export function BudgetTable({
  plan,
  update,
  planned,
  actual,
}: Pick<PanelProps, 'plan' | 'update'> & { planned: number; actual: number }) {
  const committed = useMemo(() => committedByKey(plan.vendors), [plan.vendors]);
  const money = moneyFormatter(plan.brief.currency);
  return (
    <div className="table-wrap">
      <table className="table">
        <caption>
          Type an amount to lock it; the other lines rebalance so the plan still adds up. Ranges are
          AI estimates, not quotes.
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
          {plan.budget.map((line) => (
            <BudgetRow
              key={line.id}
              plan={plan}
              update={update}
              line={line}
              money={money}
              booked={committed[line.key] ?? 0}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num" data-label="Planned">
              {money(planned)}
            </td>
            <td className="num" data-label="Spent">
              {money(actual)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
