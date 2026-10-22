import { createHash } from 'node:crypto';

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
import type { Logger } from '../logger.js';
import type { CallModel } from './callModel.js';
import { createModelCaller } from './callModel.js';
import type { FallbackKind } from './failures.js';
import { FALLBACK_REASONS, failureKind, refineError } from './failures.js';
import type { AiClient } from './gemini.js';
import { createCircuitBreaker, createDailyBudget } from './guards.js';
import type { Memo } from './memo.js';
import { createMemo } from './memo.js';
import { normalizePlanDraft, normalizeRefine } from './normalize.js';
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
  planMaxTokens: 8192,
  refineMaxTokens: 4096,
  /** Per route (drafts and refinements are cached apart), 200 entries in all. */
  cacheEntries: 100,
  cacheTtlMs: 6 * 60 * 60 * 1000,
  breakerThreshold: 5,
  breakerCoolDownMs: 60_000,
} as const;

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

function planKey(model: string | null, brief: Brief, today: string): string {
  return hash([PROMPT_VERSION, model, 'plan', canonicalBrief(brief), daysUntil(brief.date, today)]);
}

function refineKey(model: string | null, request: RefineRequest): string {
  const { brief, today, context, scope, previous, instruction } = request;
  return hash([
    PROMPT_VERSION,
    model,
    'refine',
    canonicalBrief(brief),
    daysUntil(brief.date, today),
    context,
    scope,
    previous,
    instruction,
  ]);
}

interface DraftDeps {
  model: string | null;
  callModel: CallModel;
  drafts: Memo<AiPlan>;
}

/** Gemini's draft for a brief, or a labelled template when Gemini cannot help. */
async function draftPlan(
  { model, callModel, drafts }: DraftDeps,
  brief: Brief,
  today: string,
): Promise<{ draft: AiPlan; cached: boolean; fallback: FallbackKind | null }> {
  try {
    const { value, cached } = await drafts(planKey(model, brief, today), () =>
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
    return { draft: value, cached, fallback: null };
  } catch (error) {
    return { draft: buildTemplateDraft(brief), cached: false, fallback: failureKind(error) };
  }
}

/**
 * The planning service: turns a brief into a plan and applies refinements,
 * using Gemini when it can and the template engine when it cannot.
 */
export function createPlanner(deps: PlannerDeps): Planner {
  const { ai } = deps;
  const now = deps.now ?? (() => new Date());
  const clock = () => now().getTime();
  const newId = deps.newId ?? randomId;
  const model = ai?.model ?? null;
  const callModel = createModelCaller({
    ai,
    logger: deps.logger,
    clock,
    sleep: deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
    budget: createDailyBudget(deps.dailyCap, now),
    breaker: createCircuitBreaker({
      threshold: AI_LIMITS.breakerThreshold,
      coolDownMs: AI_LIMITS.breakerCoolDownMs,
      now: clock,
    }),
  });
  // Values are normalised drafts or refinements; plans get fresh ids each time.
  const cacheOptions = { max: AI_LIMITS.cacheEntries, ttlMs: AI_LIMITS.cacheTtlMs };
  const drafts = createMemo<AiPlan>(cacheOptions);
  const refinements = createMemo<RefineResult>(cacheOptions);

  return {
    mode: ai ? 'vertex' : 'off',
    model,

    async plan(brief, today) {
      const started = clock();
      const { draft, cached, fallback } = await draftPlan(
        { model, callModel, drafts },
        brief,
        today,
      );
      const plan = finalizePlan(draft, brief, {
        planId: newId('plan'),
        today,
        now: now(),
        source: fallback ? 'template' : 'ai',
        fallbackReason: fallback ? FALLBACK_REASONS[fallback] : null,
        model: fallback ? null : model,
        newId,
      });
      const { source, fallbackReason } = plan;
      const latencyMs = clock() - started;
      return { plan, meta: { source, fallbackReason, cached, latencyMs, model: plan.model } };
    },

    async refine(request) {
      const started = clock();
      try {
        const { value, cached } = await refinements(refineKey(model, request), () =>
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
        const latencyMs = clock() - started;
        return {
          result: value,
          meta: { source: 'ai', fallbackReason: null, cached, latencyMs, model },
        };
      } catch (error) {
        throw refineError(failureKind(error));
      }
    },
  };
}
