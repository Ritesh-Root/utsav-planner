import { useEffect, useRef, useState } from 'react';

import { presets } from '../../shared/presets.js';
import type { Brief, EventType, Plan } from '../../shared/schemas.js';
import { ApiError, requestPlan } from '../api';
import type { BriefDraft, FieldErrors } from '../briefDraft';
import { draftFromBrief, emptyDraft, errorsFromServer, toBrief } from '../briefDraft';
import { BriefForm } from '../components/BriefForm';
import { PageTitle } from '../components/Layout';
import { useDocumentTitle, usePageFocus, useToday } from '../hooks';
import { navigate } from '../router';
import { useAnnounce } from '../state/announcer';
import { usePlanStore } from '../state/store';

/**
 * Ask Gemini for a plan and open it. When Utsav can't be reached, the plan is built
 * on this device from templates instead.
 */
function usePlanning(today: string) {
  const { savePlan } = usePlanStore();
  const announce = useAnnounce();
  const [working, setWorking] = useState<Brief | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const open = (plan: Plan, announcement: string) => {
    savePlan(plan);
    announce(announcement);
    navigate({ name: 'plan', id: plan.id, tab: 'overview' });
  };

  /** Resolves with the fields the server rejected, if it rejected any. */
  const start = async (brief: Brief): Promise<FieldErrors | null> => {
    setFailure(null);
    setWorking(brief);
    announce(`Planning ${brief.title}. This usually takes about ten seconds.`);
    const current = new AbortController();
    controller.current = current;
    // Fetch the workspace's code while Gemini works, so the plan opens at once, and
    // the offline planner while the network is still up, in case the request fails.
    void import('./PlanView').catch(() => undefined);
    const offline = import('../offline').catch(() => null);
    try {
      const { plan } = await requestPlan(brief, today, current.signal);
      open(
        plan,
        plan.source === 'ai' ? 'Your plan is ready.' : 'Your plan is ready, built from templates.',
      );
      return null;
    } catch (error) {
      if (current.signal.aborted) {
        setWorking(null);
        announce('Planning cancelled.');
        return null;
      }
      const offlinePlanner = await offline;
      if (error instanceof ApiError && error.unreachable && offlinePlanner) {
        const plan = offlinePlanner.buildOfflinePlan(brief, today);
        open(
          plan,
          'Utsav could not be reached, so your plan was built on this device from templates.',
        );
        return null;
      }
      setWorking(null);
      setFailure(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
      return error instanceof ApiError && error.fields.length > 0
        ? errorsFromServer(error.fields)
        : null;
    }
  };

  const cancel = () => {
    controller.current?.abort();
    setWorking(null);
  };

  return { working, failure, start, cancel };
}

function PlanningProgress({ brief, onCancel }: { brief: Brief; onCancel: () => void }) {
  return (
    <div className="working" aria-live="polite">
      <p>This usually takes about ten seconds. Stay on this page.</p>
      <progress aria-label={`Planning ${brief.title}`} />
      <div>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function WhatUtsavDrafts() {
  return (
    <aside className="panel span-4" aria-labelledby="draft-about">
      <h2 id="draft-about" className="panel-title">
        What Utsav drafts for you
      </h2>
      <ul className="rows">
        <li className="row">A budget split by category, with local cost estimates</li>
        <li className="row">A timeline counted back from your date</li>
        <li className="row">The vendors you need, when to book them and what to ask</li>
        <li className="row">Ideas that fit your theme, guests and dietary needs</li>
        <li className="row">A run sheet for the day itself</li>
      </ul>
      <p className="panel-caption">
        Costs are planning estimates, not quotes. Utsav never names businesses or invents contact
        details.
      </p>
    </aside>
  );
}

function initialDraft(preset: EventType | null, today: string): BriefDraft {
  const sample = preset ? presets(today).find((p) => p.id === preset) : undefined;
  return sample ? draftFromBrief(sample.brief) : emptyDraft(today);
}

/** The brief form, then progress while Gemini drafts, then the new plan (or an offline one). */
export default function NewPlanView({ preset }: { preset: EventType | null }) {
  const today = useToday();
  const announce = useAnnounce();
  const heading = usePageFocus<HTMLHeadingElement>(`new-${preset ?? ''}`);
  const [draft, setDraft] = useState<BriefDraft>(() => initialDraft(preset, today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const { working, failure, start, cancel } = usePlanning(today);
  const title = working ? `Planning ${working.title}` : 'New plan';
  useDocumentTitle(title);

  const create = async () => {
    const result = toBrief(draft, today);
    if (!result.brief) {
      setErrors(result.errors);
      announce('Some details need fixing.', 'assertive');
      return;
    }
    setErrors({});
    const rejected = await start(result.brief);
    if (rejected) setErrors(rejected);
  };

  return (
    <>
      <PageTitle headingRef={heading} title={title}>
        <p className="meta">
          {working
            ? 'Gemini is drafting your budget, timeline, vendor checklist, ideas and run sheet.'
            : 'Tell Utsav about the event. Everything it drafts can be changed afterwards.'}
        </p>
      </PageTitle>
      <div className="grid">
        <section className="panel span-8" aria-label={working ? 'Progress' : 'Event details'}>
          {working ? (
            <PlanningProgress brief={working} onCancel={cancel} />
          ) : (
            <>
              {failure && (
                <p className="error-text" role="alert">
                  {failure}
                </p>
              )}
              <BriefForm
                draft={draft}
                errors={errors}
                onChange={setDraft}
                onSubmit={() => void create()}
                submitLabel="Create my plan"
              />
            </>
          )}
        </section>
        <WhatUtsavDrafts />
      </div>
    </>
  );
}
