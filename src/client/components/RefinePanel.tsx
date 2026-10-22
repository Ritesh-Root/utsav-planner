import type { SubmitEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { LIMITS } from '../../shared/limits.js';
import {
  describeDiff,
  diffPlans,
  mergeRefinement,
  randomId,
  toRefineContext,
} from '../../shared/plan.js';
import type { Plan, RefineScope } from '../../shared/schemas.js';
import { REFINE_SCOPES } from '../../shared/constants.js';
import { ApiError, requestRefinement } from '../api';
import { SCOPE_LABELS, SUGGESTIONS } from '../labels';
import { useAnnounce } from '../state/announcer';
import { Dialog } from './Dialog';

type Phase =
  | { name: 'idle' }
  | { name: 'working' }
  | { name: 'preview'; proposed: Plan; message: string; summary: string }
  | { name: 'error'; message: string };

export interface RefineRequestState {
  scope: RefineScope;
  instruction: string;
  /** Changes on every open, so the dialog starts fresh each time. */
  nonce: number;
}

/**
 * Ask Gemini to change part of the plan. Nothing changes until the user sees
 * what will change and chooses Apply; Undo is offered afterwards too.
 * Mounted only while open, so its state starts from the request each time.
 */
export function RefinePanel({
  plan,
  today,
  request,
  history,
  onAsked,
  onClose,
  onApply,
}: {
  plan: Plan;
  today: string;
  request: RefineRequestState;
  /** Earlier instructions for this plan, so follow-ups keep their context. */
  history: string[];
  onAsked: (instruction: string) => void;
  onClose: () => void;
  onApply: (proposed: Plan, summary: string) => void;
}) {
  const [scope, setScope] = useState<RefineScope>(request.scope);
  const [instruction, setInstruction] = useState(request.instruction);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const announce = useAnnounce();
  const hintId = useId();

  useEffect(() => () => controller.current?.abort(), []);

  // Keep keyboard focus where the next step is: Apply on a preview, the request otherwise.
  useEffect(() => {
    if (phase.name === 'preview') applyRef.current?.focus();
    else if (phase.name === 'error') textareaRef.current?.focus();
  }, [phase.name]);

  const close = () => {
    controller.current?.abort();
    onClose();
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (phase.name === 'working') return;
    const text = instruction.trim();
    if (text.length < LIMITS.instructionMin) {
      setPhase({ name: 'error', message: 'Tell Utsav what to change, in a few words.' });
      return;
    }
    controller.current?.abort();
    controller.current = new AbortController();
    setPhase({ name: 'working' });
    announce('Asking Utsav to refine your plan…');
    try {
      const { result } = await requestRefinement(
        {
          brief: plan.brief,
          today,
          context: toRefineContext(plan),
          instruction: text,
          scope,
          previous: history.slice(-LIMITS.previousInstructionsMax),
        },
        controller.current.signal,
      );
      const proposed = mergeRefinement(plan, result, { today, now: new Date(), newId: randomId });
      const summary = describeDiff(diffPlans(plan, proposed));
      onAsked(text);
      setPhase({ name: 'preview', proposed, message: result.message, summary });
      announce(`Suggested changes ready. ${summary}`);
    } catch (error) {
      if (controller.current.signal.aborted) {
        setPhase({ name: 'idle' });
        return;
      }
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Your plan is unchanged.';
      setPhase({ name: 'error', message });
    }
  };

  return (
    <Dialog open onClose={close} title="Refine with AI" initialFocus={textareaRef}>
      {phase.name === 'preview' ? (
        <div className="refine-preview" aria-live="polite">
          <p className="finding">{phase.message}</p>
          <p className="panel-caption">{phase.summary}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPhase({ name: 'idle' });
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              ref={applyRef}
              onClick={() => {
                onApply(phase.proposed, phase.summary);
              }}
            >
              Apply changes
            </button>
          </div>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(event) => void submit(event)}
          aria-busy={phase.name === 'working'}
        >
          <div className="field">
            <label className="label" htmlFor="refine-scope">
              What should change?
            </label>
            <select
              id="refine-scope"
              className="select"
              value={scope}
              disabled={phase.name === 'working'}
              onChange={(e) => {
                setScope(e.target.value as RefineScope);
              }}
            >
              {REFINE_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="refine-instruction">
              Your request
            </label>
            <p className="hint" id={hintId}>
              Utsav keeps everything you have ticked, booked, saved or typed yourself.
            </p>
            <textarea
              ref={textareaRef}
              id="refine-instruction"
              className="textarea"
              maxLength={LIMITS.instructionMax}
              aria-describedby={hintId}
              value={instruction}
              readOnly={phase.name === 'working'}
              onChange={(e) => {
                setInstruction(e.target.value);
              }}
            />
          </div>
          <div className="chips" role="group" aria-label="Suggestions">
            {SUGGESTIONS[scope].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="btn btn-secondary btn-small"
                disabled={phase.name === 'working'}
                onClick={() => {
                  setInstruction(suggestion);
                  textareaRef.current?.focus();
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          {phase.name === 'error' && (
            <p className="error-text" role="alert">
              {phase.message}
            </p>
          )}
          {phase.name === 'working' && (
            <div className="working">
              <p>Utsav is working on it. This usually takes a few seconds.</p>
              <progress aria-label="Refining your plan" />
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-quiet" onClick={close}>
              {phase.name === 'working' ? 'Cancel' : 'Close'}
            </button>
            {/* aria-disabled, not disabled, so focus stays on the button while Utsav works. */}
            <button
              type="submit"
              className="btn btn-primary"
              aria-disabled={phase.name === 'working'}
            >
              Ask Utsav
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
