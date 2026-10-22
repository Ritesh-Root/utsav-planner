import type { RefObject } from 'react';
import { useMemo, useState } from 'react';

import { formatDate } from '../../shared/dates.js';
import { computeInsights } from '../../shared/insights.js';
import { formatMoney } from '../../shared/money.js';
import type { Plan } from '../../shared/schemas.js';
import { ApiError, requestPlan } from '../api';
import { EVENT_TYPE_LABELS } from '../labels';
import type { PanelProps } from '../panels/types';
import { useAnnounce } from '../state/announcer';
import { ConfirmDialog } from './Dialog';
import { Pill } from './Display';
import { EditDetailsDialog } from './EditDetailsDialog';
import { ExportMenu } from './ExportMenu';
import { PageTitle } from './Layout';

type HeaderProps = Pick<PanelProps, 'plan' | 'today' | 'update'>;

/** Who drafted the plan; a template plan offers to ask Gemini again. */
function SourceLine({ plan, today, update }: HeaderProps) {
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  if (plan.source === 'ai') {
    return (
      <p className="source-line">
        <Pill tone="accent">Drafted with Gemini</Pill>
      </p>
    );
  }

  const regenerate = async () => {
    setConfirming(false);
    setRegenerating(true);
    announce('Asking Gemini for a fresh plan…');
    try {
      const { plan: fresh } = await requestPlan(plan.brief, today);
      const announcement =
        fresh.source === 'ai'
          ? 'Fresh plan from Gemini.'
          : 'AI is still unavailable; the template plan was kept.';
      update({ ...fresh, id: plan.id }, { undoable: true, announcement });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Could not reach Utsav. Try again later.';
      announce(message, 'assertive');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <>
      <p className="source-line">
        <Pill tone="warning">Template plan</Pill>
        <span className="row-sub">{plan.fallbackReason}</span>
        <button
          type="button"
          className="link-button"
          disabled={regenerating}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {regenerating ? 'Asking Gemini…' : 'Try AI again'}
        </button>
      </p>
      <ConfirmDialog
        open={confirming}
        title="Replace this plan with a fresh AI plan?"
        message="Gemini will draft a new plan from the same details. Your ticks and vendor notes on this template plan will be replaced; you can undo afterwards."
        confirmLabel="Replace plan"
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => void regenerate()}
      />
    </>
  );
}

function EditDetails({ plan, today, update }: HeaderProps) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          setEditing(true);
        }}
      >
        Edit details
      </button>
      {editing && (
        <EditDetailsDialog
          plan={plan}
          today={today}
          onClose={() => {
            setEditing(false);
          }}
          onSave={(next) => {
            setEditing(false);
            update(next, { undoable: true, announcement: 'Event details saved.' });
          }}
        />
      )}
    </>
  );
}

function EventFacts({ plan }: { plan: Plan }) {
  const { brief } = plan;
  return (
    <p className="meta">
      {EVENT_TYPE_LABELS[brief.type]} · {formatDate(brief.date)}
      {brief.days > 1 ? ` · ${brief.days} days` : ''} · {brief.location} · {brief.guests} guests ·{' '}
      {formatMoney(brief.budget, brief.currency)}
    </p>
  );
}

/**
 * The plan's title row: the event's facts, the most pressing note, who drafted it,
 * and the actions that apply to the whole plan.
 */
export function PlanHeader({
  headingRef,
  onRefine,
  ...props
}: HeaderProps & { headingRef: RefObject<HTMLHeadingElement | null>; onRefine: () => void }) {
  const { plan, today } = props;
  const insights = useMemo(() => computeInsights(plan, today), [plan, today]);
  const finding =
    insights.find((insight) => insight.tone === 'alert' || insight.tone === 'warning') ??
    insights[0];
  const actions = (
    <>
      <button type="button" className="btn btn-primary" onClick={onRefine}>
        Refine with AI
      </button>
      <ExportMenu plan={plan} />
      <EditDetails {...props} />
    </>
  );
  return (
    <PageTitle headingRef={headingRef} title={plan.brief.title} actions={actions}>
      <EventFacts plan={plan} />
      {finding && <p className="finding">{finding.text}</p>}
      <SourceLine {...props} />
    </PageTitle>
  );
}
