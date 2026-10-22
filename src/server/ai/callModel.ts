import type { Logger } from '../logger.js';
import type { AiClient, AiUsage } from './gemini.js';
import { AiError } from './gemini.js';
import { PlannerFailure, isRetryable, isServiceFault } from './failures.js';
import type { CircuitBreaker, DailyBudget } from './guards.js';

/** What one route sends to the model; the caller adds the label and remaining time. */
interface ModelRequest {
  system: string;
  prompt: string;
  schema: unknown;
  maxOutputTokens: number;
  timeoutMs: number;
}

export type CallModel = <T>(
  label: string,
  request: ModelRequest,
  parse: (raw: unknown) => T,
) => Promise<T>;

const RETRY = {
  maxAttempts: 2,
  /** Every attempt for one request, together, finishes within this. */
  totalBudgetMs: 40_000,
  /** Don't start a retry with less time than this left. */
  minWindowMs: 8_000,
  /** A short random pause, so retries from many users don't arrive together. */
  jitterMs: () => 200 + Math.floor(Math.random() * 400),
} as const;

export interface ModelCallerDeps {
  ai: AiClient | null;
  logger: Logger;
  breaker: CircuitBreaker;
  budget: DailyBudget;
  /** Milliseconds since the epoch. */
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('invalid', 'response is not JSON');
  }
}

/** Log fields describing why an attempt failed; they never contain user text. */
function failureFields(error: unknown, usage: AiUsage | undefined) {
  return {
    outcome: error instanceof AiError ? error.kind : 'invalid-output',
    // Messages hold no user text (e.g. "too few ideas"); names expose code bugs.
    reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
    // An unusable answer is still billed; keep its tokens in the logs.
    ...(usage ?? (error instanceof AiError ? error.usage : undefined)),
  };
}

/**
 * One model call with at most one retry, inside an overall time budget. Each attempt
 * passes the breaker and the daily cap first, and is logged with its token usage.
 */
export function createModelCaller(deps: ModelCallerDeps): CallModel {
  const { ai, logger, breaker, budget, clock, sleep } = deps;

  const admit = () => {
    if (!breaker.allows()) throw new PlannerFailure('breaker');
    if (!budget.tryConsume()) throw new PlannerFailure('cap');
  };

  return async function callModel<T>(
    label: string,
    request: ModelRequest,
    parse: (raw: unknown) => T,
  ): Promise<T> {
    if (!ai) throw new PlannerFailure('off');
    const started = clock();
    const timeLeft = () => RETRY.totalBudgetMs - (clock() - started);
    for (let attempt = 1; ; attempt += 1) {
      admit();
      const attemptStarted = clock();
      const fields = { route: label, model: ai.model, attempt };
      let usage: AiUsage | undefined;
      try {
        const timeoutMs = Math.min(request.timeoutMs, timeLeft());
        const response = await ai.generate({ ...request, label, timeoutMs });
        usage = response.usage;
        const value = parse(parseJson(response.text));
        breaker.recordSuccess();
        logger.info('ai call', {
          ...fields,
          outcome: 'ok',
          latencyMs: clock() - attemptStarted,
          promptChars: request.prompt.length,
          ...usage,
        });
        return value;
      } catch (error) {
        if (isServiceFault(error)) breaker.recordFailure();
        logger.warn('ai call failed', {
          ...fields,
          latencyMs: clock() - attemptStarted,
          ...failureFields(error, usage),
        });
        const again = attempt < RETRY.maxAttempts && timeLeft() >= RETRY.minWindowMs;
        if (!again || !isRetryable(error)) throw error;
        await sleep(RETRY.jitterMs());
      }
    }
  };
}
