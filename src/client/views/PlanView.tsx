import { useCallback, useMemo, useState } from 'react';

import { formatDate } from '../../shared/dates.js';
import { computeInsights } from '../../shared/insights.js';
import { LIMITS } from '../../shared/limits.js';
import { formatMoney } from '../../shared/money.js';
import type { Plan, RefineScope } from '../../shared/schemas.js';
import { ApiError, requestPlan } from '../api';
import { ConfirmDialog } from '../components/Dialog';
import { Pill, Toast } from '../components/Display';
import { EditDetailsDialog } from '../components/EditDetailsDialog';
import { ExportMenu } from '../components/ExportMenu';
import type { RefineRequestState } from '../components/RefinePanel';
import { RefinePanel } from '../components/RefinePanel';
import { RoadToTheDay } from '../components/RoadToTheDay';
import { Tabs } from '../components/Tabs';
import { useDocumentTitle, usePageFocus, useToday } from '../hooks';
import { EVENT_TYPE_LABELS } from '../labels';
import BudgetPanel from '../panels/BudgetPanel';
import IdeasPanel from '../panels/IdeasPanel';
import OverviewPanel from '../panels/OverviewPanel';
import TimelinePanel from '../panels/TimelinePanel';
import type { PanelProps, UpdateOptions } from '../panels/types';
import VendorsPanel from '../panels/VendorsPanel';
import type { PlanTab } from '../router';
import { PLAN_TABS, navigate } from '../router';
import { useAnnounce } from '../state/announcer';
import { usePlanStore } from '../state/store';

// The panels are small, so they ship with the workspace: switching tabs never waits.
const PANELS: Record<PlanTab, (props: PanelProps) => React.JSX.Element> = {
  overview: OverviewPanel,
  budget: BudgetPanel,
  timeline: TimelinePanel,
  vendors: VendorsPanel,
  ideas: IdeasPanel,
};

const TAB_LABELS: Record<PlanTab, string> = {
  overview: 'Overview',
  budget: 'Budget',
  timeline: 'Timeline',
  vendors: 'Vendors',
  ideas: 'Ideas',
};

/** One event's workspace: the title row, the road to the day and the five tabs. */
export default function PlanView({ id, tab }: { id: string; tab: PlanTab }) {
  const today = useToday();
  const store = usePlanStore();
  const announce = useAnnounce();
  const plan = store.getPlan(id);
  const heading = usePageFocus<HTMLHeadingElement>(`plan-${id}`);
  const [refineRequest, setRefineRequest] = useState<RefineRequestState | null>(null);
  const [refineHistory, setRefineHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<'delete' | 'regenerate' | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  useDocumentTitle(plan ? `${plan.brief.title}: ${TAB_LABELS[tab]}` : 'Plan not found');

  const insights = useMemo(() => (plan ? computeInsights(plan, today) : []), [plan, today]);

  const update = useCallback(
    (next: Plan, options: UpdateOptions = {}) => {
      store.savePlan(
        { ...next, updatedAt: new Date().toISOString() },
        { undoable: options.undoable ?? false },
      );
      if (options.announcement) announce(options.announcement);
      if (options.undoable) setToast(options.announcement ?? 'Change saved.');
    },
    [store, announce],
  );

  const refine = useCallback((scope: RefineScope, instruction = '') => {
    setRefineRequest({ scope, instruction, nonce: Date.now() });
  }, []);

  const goTo = useCallback(
    (next: PlanTab) => {
      navigate({ name: 'plan', id, tab: next }, { replace: true });
    },
    [id],
  );

  if (!plan && !store.ready) {
    return (
      <p className="meta" role="status">
        Loading your plan…
      </p>
    );
  }

  if (!plan) {
    return (
      <div className="title-text">
        <h1 ref={heading} tabIndex={-1} className="title">
          Plan not found
        </h1>
        <p className="meta">It may have been deleted, or it was made in another browser.</p>
        <p>
          <a href="#/">Back to your plans</a>
        </p>
      </div>
    );
  }

  const { brief } = plan;
  const finding =
    insights.find((insight) => insight.tone === 'alert' || insight.tone === 'warning') ??
    insights[0];
  const Panel = PANELS[tab];

  const regenerate = async () => {
    setConfirming(null);
    setRegenerating(true);
    announce('Asking Gemini for a fresh plan…');
    try {
      const { plan: fresh } = await requestPlan(brief, today);
      update(
        { ...fresh, id: plan.id },
        {
          undoable: true,
          announcement:
            fresh.source === 'ai'
              ? 'Fresh plan from Gemini.'
              : 'AI is still unavailable; the template plan was kept.',
        },
      );
    } catch (error) {
      announce(
        error instanceof ApiError ? error.message : 'Could not reach Utsav. Try again later.',
        'assertive',
      );
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <>
      <div className="title-row">
        <div className="title-text">
          <h1 ref={heading} tabIndex={-1} className="title">
            {brief.title}
          </h1>
          <p className="meta">
            {EVENT_TYPE_LABELS[brief.type]} · {formatDate(brief.date)}
            {brief.days > 1 ? ` · ${brief.days} days` : ''} · {brief.location} · {brief.guests}{' '}
            guests · {formatMoney(brief.budget, brief.currency)}
          </p>
          {finding && <p className="finding">{finding.text}</p>}
          <p className="source-line">
            {plan.source === 'ai' ? (
              <Pill tone="accent">Drafted with Gemini</Pill>
            ) : (
              <>
                <Pill tone="warning">Template plan</Pill>
                <span className="row-sub">{plan.fallbackReason}</span>
                <button
                  type="button"
                  className="link-button"
                  disabled={regenerating}
                  onClick={() => {
                    setConfirming('regenerate');
                  }}
                >
                  {regenerating ? 'Asking Gemini…' : 'Try AI again'}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              refine('all');
            }}
          >
            Refine with AI
          </button>
          <ExportMenu plan={plan} />
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit details
          </button>
        </div>
      </div>

      <RoadToTheDay plan={plan} today={today} />

      <Tabs
        items={PLAN_TABS.map((t) => ({ id: t, label: TAB_LABELS[t] }))}
        selected={tab}
        onSelect={goTo}
        label="Plan sections"
        idPrefix="plan"
      />
      <div id="plan-panel" role="tabpanel" aria-labelledby={`plan-tab-${tab}`}>
        <Panel plan={plan} today={today} update={update} refine={refine} goTo={goTo} />
      </div>

      <section className="danger-zone" aria-labelledby="danger-title">
        <h2 id="danger-title" className="section-title">
          Delete this plan
        </h2>
        <p className="panel-caption">
          This removes the plan and everything you added to it from this browser.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            setConfirming('delete');
          }}
        >
          Delete plan
        </button>
      </section>

      {refineRequest && (
        <RefinePanel
          key={refineRequest.nonce}
          plan={plan}
          today={today}
          request={refineRequest}
          history={refineHistory}
          onAsked={(text) => {
            setRefineHistory((items) => [...items, text].slice(-LIMITS.previousInstructionsMax));
          }}
          onClose={() => {
            setRefineRequest(null);
          }}
          onApply={(proposed, summary) => {
            setRefineRequest(null);
            update(proposed, { undoable: true, announcement: `Changes applied. ${summary}` });
          }}
        />
      )}
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
      <ConfirmDialog
        open={confirming === 'delete'}
        title={`Delete ${brief.title}?`}
        message="The plan, your ticks, vendor notes and spending will be removed from this browser. This cannot be undone."
        confirmLabel="Delete plan"
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={() => {
          store.removePlan(plan.id);
          announce(`${brief.title} deleted.`);
          navigate({ name: 'home' });
        }}
      />
      <ConfirmDialog
        open={confirming === 'regenerate'}
        title="Replace this plan with a fresh AI plan?"
        message="Gemini will draft a new plan from the same details. Your ticks and vendor notes on this template plan will be replaced; you can undo afterwards."
        confirmLabel="Replace plan"
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={() => void regenerate()}
      />
      {toast && store.canUndo(plan.id) && (
        <Toast
          message={toast}
          action={{
            label: 'Undo',
            run: () => {
              store.undo(plan.id);
              setToast(null);
              announce('Change undone.');
              // The toast holding focus is about to go; keep the keyboard user on the page.
              heading.current?.focus();
            },
          }}
          onDismiss={() => {
            setToast(null);
            heading.current?.focus();
          }}
        />
      )}
    </>
  );
}
