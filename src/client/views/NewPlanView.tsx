import { useEffect, useRef, useState } from 'react';

import { presets } from '../../shared/presets.js';
import type { Brief, EventType } from '../../shared/schemas.js';
import { ApiError, requestPlan } from '../api';
import type { BriefDraft, FieldErrors } from '../briefDraft';
import { draftFromBrief, emptyDraft, errorsFromServer, toBrief } from '../briefDraft';
import { BriefForm } from '../components/BriefForm';
import { useDocumentTitle, usePageFocus, useToday } from '../hooks';
import { navigate } from '../router';
import { useAnnounce } from '../state/announcer';
import { usePlanStore } from '../state/store';

/** The brief form, then progress while Gemini drafts, then the new plan (or an offline one). */
export default function NewPlanView({ preset }: { preset: EventType | null }) {
  const today = useToday();
  const { savePlan } = usePlanStore();
  const announce = useAnnounce();
  const heading = usePageFocus<HTMLHeadingElement>(`new-${preset ?? ''}`);
  const [draft, setDraft] = useState<BriefDraft>(() => {
    const sample = preset ? presets(today).find((p) => p.id === preset) : undefined;
    return sample ? draftFromBrief(sample.brief) : emptyDraft(today);
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [working, setWorking] = useState<Brief | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useDocumentTitle(working ? `Planning ${working.title}` : 'New plan');

  useEffect(() => () => controller.current?.abort(), []);

  const create = async () => {
    const result = toBrief(draft, today);
    if (!result.brief) {
      setErrors(result.errors);
      announce('Some details need fixing.', 'assertive');
      return;
    }
    const brief = result.brief;
    setErrors({});
    setFailure(null);
    setWorking(brief);
    announce(`Planning ${brief.title}. This usually takes about ten seconds.`);
    controller.current = new AbortController();
    // Fetch the workspace's code while Gemini works, so the plan opens at once, and
    // the offline planner while the network is still up, in case the request fails.
    void import('./PlanView').catch(() => undefined);
    const offline = import('../offline').catch(() => null);
    try {
      const { plan } = await requestPlan(brief, today, controller.current.signal);
      savePlan(plan);
      announce(
        plan.source === 'ai' ? 'Your plan is ready.' : 'Your plan is ready, built from templates.',
      );
      navigate({ name: 'plan', id: plan.id, tab: 'overview' });
    } catch (error) {
      if (controller.current.signal.aborted) {
        setWorking(null);
        announce('Planning cancelled.');
        return;
      }
      const offlinePlanner = await offline;
      if (error instanceof ApiError && error.unreachable && offlinePlanner) {
        // The service is down or we are offline: build a template plan on the device instead.
        const plan = offlinePlanner.buildOfflinePlan(brief, today);
        savePlan(plan);
        announce(
          'Utsav could not be reached, so your plan was built on this device from templates.',
        );
        navigate({ name: 'plan', id: plan.id, tab: 'overview' });
        return;
      }
      setWorking(null);
      if (error instanceof ApiError && error.fields.length > 0) {
        setErrors(errorsFromServer(error.fields));
      }
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      setFailure(message);
      announce(message, 'assertive');
    }
  };

  return (
    <>
      <div className="title-row">
        <div className="title-text">
          <h1 ref={heading} tabIndex={-1} className="title">
            {working ? `Planning ${working.title}` : 'New plan'}
          </h1>
          <p className="meta">
            {working
              ? 'Gemini is drafting your budget, timeline, vendor checklist, ideas and run sheet.'
              : 'Tell Utsav about the event. Everything it drafts can be changed afterwards.'}
          </p>
        </div>
      </div>
      <div className="grid">
        <section className="panel span-8" aria-label={working ? 'Progress' : 'Event details'}>
          {working ? (
            <div className="working" aria-live="polite">
              <p>This usually takes about ten seconds. Stay on this page.</p>
              <progress aria-label={`Planning ${working.title}`} />
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    controller.current?.abort();
                    setWorking(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
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
            Costs are planning estimates, not quotes. Utsav never names businesses or invents
            contact details.
          </p>
        </aside>
      </div>
    </>
  );
}
