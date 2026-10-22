import type { RefObject, SubmitEvent } from 'react';
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
import { Select } from './Select';

/** Gemini's suggested change, waiting for Apply or Discard. */
interface Preview {
  name: 'preview';
  proposed: Plan;
  message: string;
  summary: string;
}
type Phase = { name: 'idle' } | { name: 'working' } | Preview | { name: 'error'; message: string };

export interface RefineRequestState {
  scope: RefineScope;
  instruction: string;
  /** Changes on every open, so the dialog starts fresh each time. */
  nonce: number;
}

interface RefinementOptions {
  plan: Plan;
  today: string;
  /** Earlier instructions for this plan, so follow-ups keep their context. */
  history: string[];
  onAsked: (instruction: string) => void;
}

/** Ask Gemini for a change and preview it; the request is cancelled if the dialog closes. */
function useRefinement({ plan, today, history, onAsked }: RefinementOptions) {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const announce = useAnnounce();

  useEffect(() => () => controller.current?.abort(), []);

  const ask = async (instruction: string, scope: RefineScope) => {
    if (phase.name === 'working') return;
    const text = instruction.trim();
    if (text.length < LIMITS.instructionMin) {
      setPhase({ name: 'error', message: 'Tell Utsav what to change, in a few words.' });
      return;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPhase({ name: 'working' });
    announce('Asking Utsav to refine your plan…');
    try {
      const context = toRefineContext(plan);
      const previous = history.slice(-LIMITS.previousInstructionsMax);
      const { result } = await requestRefinement(
        { brief: plan.brief, today, context, instruction: text, scope, previous },
        current.signal,
      );
      const proposed = mergeRefinement(plan, result, { today, now: new Date(), newId: randomId });
      const summary = describeDiff(diffPlans(plan, proposed));
      onAsked(text);
      setPhase({ name: 'preview', proposed, message: result.message, summary });
      announce(`Suggested changes ready. ${summary}`);
    } catch (error) {
      if (current.signal.aborted) {
        setPhase({ name: 'idle' });
        return;
      }
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Your plan is unchanged.';
      setPhase({ name: 'error', message });
    }
  };

  return { phase, setPhase, ask, cancel: () => controller.current?.abort() };
}

function RefinePreview({
  preview,
  applyRef,
  onDiscard,
  onApply,
}: {
  preview: Preview;
  applyRef: RefObject<HTMLButtonElement | null>;
  onDiscard: () => void;
  onApply: () => void;
}) {
  return (
    <div className="refine-preview" aria-live="polite">
      <p className="finding">{preview.message}</p>
      <p className="panel-caption">{preview.summary}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDiscard}>
          Discard
        </button>
        <button type="button" className="btn btn-primary" ref={applyRef} onClick={onApply}>
          Apply changes
        </button>
      </div>
    </div>
  );
}

interface FormProps {
  scope: RefineScope;
  onScope: (scope: RefineScope) => void;
  instruction: string;
  onInstruction: (instruction: string) => void;
  phase: Exclude<Phase, Preview>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: () => void;
  onClose: () => void;
}

function ScopeField({
  scope,
  onScope,
  disabled,
}: Pick<FormProps, 'scope' | 'onScope'> & { disabled: boolean }) {
  return (
    <div className="field">
      <label className="label" htmlFor="refine-scope">
        What should change?
      </label>
      <Select
        id="refine-scope"
        className="select"
        value={scope}
        disabled={disabled}
        options={REFINE_SCOPES}
        optionLabel={(s) => SCOPE_LABELS[s]}
        onChange={onScope}
      />
    </div>
  );
}

/** Example requests for the chosen part of the plan; picking one fills in the request. */
function Suggestions({
  scope,
  disabled,
  onPick,
}: {
  scope: RefineScope;
  disabled: boolean;
  onPick: (suggestion: string) => void;
}) {
  return (
    <div className="chips" role="group" aria-label="Suggestions">
      {SUGGESTIONS[scope].map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="btn btn-secondary btn-small"
          disabled={disabled}
          onClick={() => {
            onPick(suggestion);
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function RefineForm(props: FormProps) {
  const { instruction, onInstruction, phase, textareaRef, onSubmit, onClose } = props;
  const hintId = useId();
  const working = phase.name === 'working';
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="form" onSubmit={submit} aria-busy={working}>
      <ScopeField scope={props.scope} onScope={props.onScope} disabled={working} />
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
          readOnly={working}
          onChange={(e) => {
            onInstruction(e.target.value);
          }}
        />
      </div>
      <Suggestions
        scope={props.scope}
        disabled={working}
        onPick={(suggestion) => {
          onInstruction(suggestion);
          textareaRef.current?.focus();
        }}
      />
      {phase.name === 'error' && (
        <p className="error-text" role="alert">
          {phase.message}
        </p>
      )}
      {working && (
        <div className="working">
          <p>Utsav is working on it. This usually takes a few seconds.</p>
          <progress aria-label="Refining your plan" />
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          {working ? 'Cancel' : 'Close'}
        </button>
        {/* aria-disabled, not disabled, so focus stays on the button while Utsav works. */}
        <button type="submit" className="btn btn-primary" aria-disabled={working}>
          Ask Utsav
        </button>
      </div>
    </form>
  );
}

/**
 * Ask Gemini to change part of the plan. Nothing changes until the user sees
 * what will change and chooses Apply; Undo is offered afterwards too.
 * Mounted only while open, so its state starts from the request each time.
 */
export function RefinePanel({
  request,
  onClose,
  onApply,
  ...options
}: RefinementOptions & {
  request: RefineRequestState;
  onClose: () => void;
  onApply: (proposed: Plan, summary: string) => void;
}) {
  const [scope, setScope] = useState<RefineScope>(request.scope);
  const [instruction, setInstruction] = useState(request.instruction);
  const { phase, setPhase, ask, cancel } = useRefinement(options);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);

  // Keep keyboard focus where the next step is: Apply on a preview, the request otherwise.
  useEffect(() => {
    if (phase.name === 'preview') applyRef.current?.focus();
    else if (phase.name === 'error') textareaRef.current?.focus();
  }, [phase.name]);

  const close = () => {
    cancel();
    onClose();
  };

  return (
    <Dialog open onClose={close} title="Refine with AI" initialFocus={textareaRef}>
      {phase.name === 'preview' ? (
        <RefinePreview
          preview={phase}
          applyRef={applyRef}
          onDiscard={() => {
            setPhase({ name: 'idle' });
          }}
          onApply={() => {
            onApply(phase.proposed, phase.summary);
          }}
        />
      ) : (
        <RefineForm
          scope={scope}
          onScope={setScope}
          instruction={instruction}
          onInstruction={setInstruction}
          phase={phase}
          textareaRef={textareaRef}
          onSubmit={() => void ask(instruction, scope)}
          onClose={close}
        />
      )}
    </Dialog>
  );
}
