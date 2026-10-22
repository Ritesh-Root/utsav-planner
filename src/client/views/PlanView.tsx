import type { RefObject } from 'react';
import { useCallback, useState } from 'react';

import { LIMITS } from '../../shared/limits.js';
import type { Plan, RefineScope } from '../../shared/schemas.js';
import { ConfirmDialog } from '../components/Dialog';
import { Toast } from '../components/Display';
import { PlanHeader } from '../components/PlanHeader';
import type { RefineRequestState } from '../components/RefinePanel';
import { RefinePanel } from '../components/RefinePanel';
import { RoadToTheDay } from '../components/RoadToTheDay';
import { Tabs } from '../components/Tabs';
import { useDocumentTitle, usePageFocus, useToday } from '../hooks';
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

type HeadingRef = RefObject<HTMLHeadingElement | null>;
type Update = PanelProps['update'];

/** Save a changed plan, announce it, and offer Undo through a toast when it can be undone. */
function usePlanUpdate() {
  const store = usePlanStore();
  const announce = useAnnounce();
  const [toast, setToast] = useState<string | null>(null);
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
  const closeToast = () => {
    setToast(null);
  };
  return { update, toast, closeToast };
}

function UndoToast({
  planId,
  message,
  onClose,
  headingRef,
}: {
  planId: string;
  message: string;
  onClose: () => void;
  headingRef: HeadingRef;
}) {
  const store = usePlanStore();
  const announce = useAnnounce();
  if (!store.canUndo(planId)) return null;
  // The toast holding focus is about to go; keep the keyboard user on the page.
  const close = () => {
    onClose();
    headingRef.current?.focus();
  };
  const undo = () => {
    store.undo(planId);
    announce('Change undone.');
    close();
  };
  return <Toast message={message} action={{ label: 'Undo', run: undo }} onDismiss={close} />;
}

/** The refine dialog while a request is open, remembering earlier instructions for follow-ups. */
function PlanRefinement({
  plan,
  today,
  request,
  onClose,
  update,
}: {
  plan: Plan;
  today: string;
  request: RefineRequestState | null;
  onClose: () => void;
  update: Update;
}) {
  const [history, setHistory] = useState<string[]>([]);
  if (!request) return null;
  return (
    <RefinePanel
      key={request.nonce}
      plan={plan}
      today={today}
      request={request}
      history={history}
      onAsked={(text) => {
        setHistory((items) => [...items, text].slice(-LIMITS.previousInstructionsMax));
      }}
      onClose={onClose}
      onApply={(proposed, summary) => {
        onClose();
        update(proposed, { undoable: true, announcement: `Changes applied. ${summary}` });
      }}
    />
  );
}

function DeletePlan({ plan }: { plan: Plan }) {
  const store = usePlanStore();
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);
  return (
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
          setConfirming(true);
        }}
      >
        Delete plan
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Delete ${plan.brief.title}?`}
        message="The plan, your ticks, vendor notes and spending will be removed from this browser. This cannot be undone."
        confirmLabel="Delete plan"
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          store.removePlan(plan.id);
          announce(`${plan.brief.title} deleted.`);
          navigate({ name: 'home' });
        }}
      />
    </section>
  );
}

function Workspace({
  plan,
  tab,
  headingRef,
}: {
  plan: Plan;
  tab: PlanTab;
  headingRef: HeadingRef;
}) {
  const today = useToday();
  const { update, toast, closeToast } = usePlanUpdate();
  const [refineRequest, setRefineRequest] = useState<RefineRequestState | null>(null);
  const refine = useCallback((scope: RefineScope, instruction = '') => {
    setRefineRequest({ scope, instruction, nonce: Date.now() });
  }, []);
  const goTo = useCallback(
    (next: PlanTab) => {
      navigate({ name: 'plan', id: plan.id, tab: next }, { replace: true });
    },
    [plan.id],
  );
  const Panel = PANELS[tab];

  return (
    <>
      <PlanHeader
        plan={plan}
        today={today}
        update={update}
        headingRef={headingRef}
        onRefine={() => {
          refine('all');
        }}
      />
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
      <DeletePlan plan={plan} />
      <PlanRefinement
        plan={plan}
        today={today}
        request={refineRequest}
        onClose={() => {
          setRefineRequest(null);
        }}
        update={update}
      />
      {toast && (
        <UndoToast planId={plan.id} message={toast} onClose={closeToast} headingRef={headingRef} />
      )}
    </>
  );
}

/** One event's workspace: the title row, the road to the day and the five tabs. */
export default function PlanView({ id, tab }: { id: string; tab: PlanTab }) {
  const store = usePlanStore();
  const plan = store.getPlan(id);
  const heading = usePageFocus<HTMLHeadingElement>(`plan-${id}`);
  useDocumentTitle(plan ? `${plan.brief.title}: ${TAB_LABELS[tab]}` : 'Plan not found');

  if (plan) return <Workspace plan={plan} tab={tab} headingRef={heading} />;
  if (!store.ready) {
    return (
      <p className="meta" role="status">
        Loading your plan…
      </p>
    );
  }
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
