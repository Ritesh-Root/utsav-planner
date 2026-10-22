import { HttpError } from '../errors.js';
import type { AiErrorKind } from './gemini.js';
import { AiError, toAiError } from './gemini.js';
import { InvalidOutputError } from './normalize.js';

/** Why a template was used instead of Gemini, in words the user sees. */
export const FALLBACK_REASONS = {
  off: 'AI planning is switched off on this server.',
  cap: 'Today’s AI limit has been reached.',
  breaker: 'The AI service is having trouble right now.',
  timeout: 'The AI took too long to answer.',
  blocked: 'The AI could not help with this request.',
  invalid: 'The AI answer could not be used.',
  error: 'The AI service is having trouble right now.',
} as const;
export type FallbackKind = keyof typeof FALLBACK_REASONS;

/** The planner declined to call the model at all (AI off, breaker open, daily cap used). */
export class PlannerFailure extends Error {
  constructor(readonly kind: FallbackKind) {
    super(kind);
    this.name = 'PlannerFailure';
  }
}

/**
 * Failures that would hit every user, so they open the breaker: the service struggling
 * (timeouts, 429, 5xx, network) or rejecting our fixed setup ('client': a 4xx caused by
 * the schema, model name or credentials, since user input is bounded before it is sent).
 */
const SERVICE_FAULTS: ReadonlySet<AiErrorKind> = new Set([
  'timeout',
  'rate-limit',
  'server',
  'network',
  'client',
]);

/**
 * Whether a failed call counts against the circuit breaker. An answer that could not be
 * used is shaped by one request, so one user cannot trip the breaker for everyone.
 */
export function isServiceFault(error: unknown): boolean {
  return error instanceof AiError && SERVICE_FAULTS.has(error.kind);
}

/** A failure worth one more attempt: a transient service fault or an unusable answer. */
export function isRetryable(error: unknown): boolean {
  return error instanceof InvalidOutputError || (error instanceof AiError && error.retryable);
}

/** Sort any failure into the reason shown to the user. */
export function failureKind(error: unknown): FallbackKind {
  if (error instanceof PlannerFailure) return error.kind;
  if (error instanceof InvalidOutputError) return 'invalid';
  const kind: AiErrorKind = toAiError(error).kind;
  if (kind === 'timeout') return 'timeout';
  if (kind === 'blocked') return 'blocked';
  if (kind === 'invalid' || kind === 'max-tokens' || kind === 'empty') return 'invalid';
  return 'error';
}

const UNCHANGED_RETRY_LATER = 'The AI couldn’t make that change right now. Your plan is unchanged.';

/** Refinements change the user's plan, so they fail visibly instead of falling back. */
export function refineError(kind: FallbackKind): HttpError {
  switch (kind) {
    case 'blocked':
      return new HttpError(
        422,
        'CONTENT_BLOCKED',
        'Utsav can’t help with that request. Try rephrasing it.',
      );
    case 'cap':
      return new HttpError(
        503,
        'AI_QUOTA',
        'Today’s AI limit has been reached. Your plan is unchanged.',
        { retryAfterSec: 3600 },
      );
    case 'timeout':
      return new HttpError(
        503,
        'AI_TIMEOUT',
        'The AI took too long. Your plan is unchanged; please try again.',
        { retryAfterSec: 5 },
      );
    case 'off':
      return new HttpError(
        503,
        'AI_UNAVAILABLE',
        'AI refinement is switched off. You can still edit everything by hand.',
      );
    case 'breaker':
    case 'invalid':
    case 'error':
      return new HttpError(503, 'AI_UNAVAILABLE', UNCHANGED_RETRY_LATER, { retryAfterSec: 30 });
  }
}
