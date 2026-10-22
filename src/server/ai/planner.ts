import { createHash } from 'node:crypto';

import { LRUCache } from 'lru-cache';

import type { IdFactory } from '../../shared/plan.js';
import { finalizePlan, randomId } from '../../shared/plan.js';
import type {
  AiPlan,
  Brief,
  Plan,
  RefineRequest,
  RefineResult,
  ResponseMeta,
} from '../../shared/schemas.js';
import { buildTemplateDraft } from '../../shared/templates/index.js';
import { daysUntil } from '../../shared/timeline.js';
import { HttpError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { AiClient, AiErrorKind, AiUsage } from './gemini.js';
import { AiError, toAiError } from './gemini.js';
import { createCircuitBreaker, createDailyBudget } from './guards.js';
import { InvalidOutputError, normalizePlanDraft, normalizeRefine } from './normalize.js';
import {
  PLAN_SYSTEM,
  PROMPT_VERSION,
  REFINE_SYSTEM,
  buildPlanPrompt,
  buildRefinePrompt,
} from './prompts.js';
import { PLAN_RESPONSE_SCHEMA, refineResponseSchema } from './schema.js';

const AI_LIMITS = {
  planTimeoutMs: 25_000,
  refineTimeoutMs: 20_000,
  totalBudgetMs: 40_000,
  /** Don't start a retry with less time than this left. */
  minRetryWindowMs: 8_000,
  planMaxTokens: 8192,
  refineMaxTokens: 4096,
  cacheEntries: 200,
  cacheTtlMs: 6 * 60 * 60 * 1000,
  breakerThreshold: 5,
  breakerCoolDownMs: 60_000,
} as const;

/** Why a template was used instead of Gemini, in words the user sees. */
const FALLBACK_REASONS = {
  off: 'AI planning is switched off on this server.',
  cap: 'Today’s AI limit has been reached.',
  breaker: 'The AI service is having trouble right now.',
  timeout: 'The AI took too long to answer.',
  blocked: 'The AI could not help with this request.',
  invalid: 'The AI answer could not be used.',
  error: 'The AI service is having trouble right now.',
} as const;
type FallbackKind = keyof typeof FALLBACK_REASONS;

/** Failures that mean the model service itself is struggling. */
const SERVICE_FAULTS: ReadonlySet<AiErrorKind> = new Set([
  'timeout',
  'rate-limit',
  'server',
  'network',
  'client',
]);

class PlannerFailure extends Error {
  constructor(readonly kind: FallbackKind) {
    super(kind);
    this.name = 'PlannerFailure';
  }
}

function failureKind(error: unknown): FallbackKind {
  if (error instanceof PlannerFailure) return error.kind;
  if (error instanceof InvalidOutputError) return 'invalid';
  const kind: AiErrorKind = toAiError(error).kind;
  if (kind === 'timeout') return 'timeout';
  if (kind === 'blocked') return 'blocked';
  if (kind === 'invalid' || kind === 'max-tokens' || kind === 'empty') return 'invalid';
  return 'error';
}

interface PlanOutcome {
  plan: Plan;
  meta: ResponseMeta;
}

interface RefineOutcome {
  result: RefineResult;
  meta: ResponseMeta;
}

export interface Planner {
  readonly mode: 'vertex' | 'off';
  readonly model: string | null;
  plan(brief: Brief, today: string): Promise<PlanOutcome>;
  refine(request: RefineRequest): Promise<RefineOutcome>;
}

export interface PlannerDeps {
  ai: AiClient | null;
  logger: Logger;
  dailyCap: number;
  now?: () => Date;
  newId?: IdFactory;
  sleep?: (ms: number) => Promise<void>;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The brief with list order normalised, so equivalent briefs share a cache entry. */
function canonicalBrief(brief: Brief): Brief {
  return { ...brief, priorities: [...brief.priorities].sort(), dietary: [...brief.dietary].sort() };
}

/**
 * The planning service: turns a brief into a plan and applies refinements,
 * using Gemini when it can and the template engine when it cannot.
 */
export function createPlanner(deps: PlannerDeps): Planner {
  const { ai, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomId;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const budget = createDailyBudget(deps.dailyCap, now);
  const breaker = createCircuitBreaker({
    threshold: AI_LIMITS.breakerThreshold,
    coolDownMs: AI_LIMITS.breakerCoolDownMs,
    now: () => now().getTime(),
  });
  // Values are already normalised drafts or refinements; plans get fresh ids each time.
  const cache = new LRUCache<string, AiPlan | RefineResult>({
    max: AI_LIMITS.cacheEntries,
    ttl: AI_LIMITS.cacheTtlMs,
  });
  const inFlight = new Map<string, Promise<AiPlan | RefineResult>>();

  /** One model call with at most one retry, inside an overall time budget. */
  async function callModel<T>(
    label: string,
    request: {
      system: string;
      prompt: string;
      schema: unknown;
      maxOutputTokens: number;
      timeoutMs: number;
    },
    parse: (raw: unknown) => T,
  ): Promise<T> {
    if (!ai) throw new PlannerFailure('off');
    const clock = () => now().getTime();
    const started = clock();
    for (let attempt = 1; ; attempt += 1) {
      if (!breaker.allows()) throw new PlannerFailure('breaker');
      if (!budget.tryConsume()) throw new PlannerFailure('cap');
      const remaining = AI_LIMITS.totalBudgetMs - (clock() - started);
      const callStarted = clock();
      let usage: AiUsage | undefined;
      try {
        const response = await ai.generate({
          ...request,
          label,
          timeoutMs: Math.min(request.timeoutMs, remaining),
        });
        usage = response.usage;
        let raw: unknown;
        try {
          raw = JSON.parse(response.text);
        } catch {
          throw new AiError('invalid', 'response is not JSON');
        }
        const value = parse(raw);
        breaker.recordSuccess();
        logger.info('ai call', {
          route: label,
          model: ai.model,
          attempt,
          outcome: 'ok',
          latencyMs: clock() - callStarted,
          promptChars: request.prompt.length,
          ...usage,
        });
        return value;
      } catch (error) {
        const retryable =
          error instanceof InvalidOutputError || (error instanceof AiError && error.retryable);
        // Only faults of the AI service open the breaker. An answer that could not be
        // used is shaped by the request itself, so one user cannot trip it for everyone.
        if (error instanceof AiError && SERVICE_FAULTS.has(error.kind)) breaker.recordFailure();
        logger.warn('ai call failed', {
          route: label,
          model: ai.model,
          attempt,
          outcome: error instanceof AiError ? error.kind : 'invalid-output',
          // Messages hold no user text (e.g. "too few ideas"); names expose code bugs.
          reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
          latencyMs: clock() - callStarted,
          // An unusable answer is still billed; keep its tokens in the logs.
          ...(usage ?? (error instanceof AiError ? error.usage : undefined)),
        });
        const timeLeft = AI_LIMITS.totalBudgetMs - (clock() - started);
        if (!retryable || attempt >= 2 || timeLeft < AI_LIMITS.minRetryWindowMs) throw error;
        await sleep(200 + Math.floor(Math.random() * 400));
      }
    }
  }

  /** Cache and de-duplicate identical requests; failures are never cached. */
  async function memo<T extends AiPlan | RefineResult>(
    key: string,
    produce: () => Promise<T>,
  ): Promise<{ value: T; cached: boolean }> {
    const hit = cache.get(key);
    if (hit) return { value: hit as T, cached: true };
    const pending = inFlight.get(key);
    if (pending) return { value: (await pending) as T, cached: true };
    const promise = produce();
    inFlight.set(key, promise);
    try {
      const value = await promise;
      cache.set(key, value);
      return { value, cached: false };
    } finally {
      inFlight.delete(key);
    }
  }

  const model = ai?.model ?? null;

  return {
    mode: ai ? 'vertex' : 'off',
    model,

    async plan(brief, today) {
      const started = now().getTime();
      const key = hash([
        PROMPT_VERSION,
        model,
        'plan',
        canonicalBrief(brief),
        daysUntil(brief.date, today),
      ]);
      let draft: AiPlan;
      let cached = false;
      let fallback: FallbackKind | null = null;
      try {
        const outcome = await memo(key, () =>
          callModel(
            'plan',
            {
              system: PLAN_SYSTEM,
              prompt: buildPlanPrompt(brief, today),
              schema: PLAN_RESPONSE_SCHEMA,
              maxOutputTokens: AI_LIMITS.planMaxTokens,
              timeoutMs: AI_LIMITS.planTimeoutMs,
            },
            (raw) => normalizePlanDraft(raw, brief),
          ),
        );
        draft = outcome.value;
        cached = outcome.cached;
      } catch (error) {
        fallback = failureKind(error);
        draft = buildTemplateDraft(brief);
      }
      const plan = finalizePlan(draft, brief, {
        planId: newId('plan'),
        today,
        now: now(),
        source: fallback ? 'template' : 'ai',
        fallbackReason: fallback ? FALLBACK_REASONS[fallback] : null,
        model: fallback ? null : model,
        newId,
      });
      return {
        plan,
        meta: {
          source: plan.source,
          fallbackReason: plan.fallbackReason,
          cached,
          latencyMs: now().getTime() - started,
          model: plan.model,
        },
      };
    },

    async refine(request) {
      const started = now().getTime();
      const key = hash([
        PROMPT_VERSION,
        model,
        'refine',
        canonicalBrief(request.brief),
        daysUntil(request.brief.date, request.today),
        request.context,
        request.scope,
        request.previous,
        request.instruction,
      ]);
      try {
        const { value, cached } = await memo(key, () =>
          callModel(
            'refine',
            {
              system: REFINE_SYSTEM,
              prompt: buildRefinePrompt(request),
              schema: refineResponseSchema(request.scope),
              maxOutputTokens: AI_LIMITS.refineMaxTokens,
              timeoutMs: AI_LIMITS.refineTimeoutMs,
            },
            (raw) => normalizeRefine(raw, request.scope, request.brief, request.today),
          ),
        );
        return {
          result: value,
          meta: {
            source: 'ai',
            fallbackReason: null,
            cached,
            latencyMs: Date.now() - started,
            model,
          },
        };
      } catch (error) {
        throw refineError(failureKind(error));
      }
    },
  };
}

/** Refinements change the user's plan, so they fail visibly instead of falling back. */
function refineError(kind: FallbackKind): HttpError {
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
        {
          retryAfterSec: 3600,
        },
      );
    case 'timeout':
      return new HttpError(
        503,
        'AI_TIMEOUT',
        'The AI took too long. Your plan is unchanged; please try again.',
        {
          retryAfterSec: 5,
        },
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
      return new HttpError(
        503,
        'AI_UNAVAILABLE',
        'The AI couldn’t make that change right now. Your plan is unchanged.',
        {
          retryAfterSec: 30,
        },
      );
  }
}
