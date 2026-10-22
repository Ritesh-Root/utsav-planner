import type { AiClient, AiRequest, AiResponse } from '../../src/server/ai/gemini.js';
import type { AiPlan, Brief } from '../../src/shared/schemas.js';
import { buildTemplateDraft } from '../../src/shared/templates/index.js';

/** A plan shaped exactly like Gemini's output, with estimates filled in. */
export function aiPlanFor(brief: Brief): AiPlan {
  const draft = buildTemplateDraft(brief);
  return {
    ...draft,
    title: `${brief.title} plan`,
    budget: draft.budget.map((line) => ({
      ...line,
      estLow: Math.round((brief.budget * line.sharePct) / 120),
      estHigh: Math.round((brief.budget * line.sharePct) / 80),
    })),
  };
}

type Step = AiResponse | Error | ((request: AiRequest) => AiResponse | Promise<AiResponse>);

/** Plays back scripted answers in order; the last one repeats. Records every request. */
export class FakeAi implements AiClient {
  readonly model = 'fake-gemini';
  readonly requests: AiRequest[] = [];
  private readonly steps: Step[];

  constructor(...steps: Step[]) {
    this.steps = steps;
  }

  get calls(): number {
    return this.requests.length;
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    this.requests.push(request);
    const step = this.steps[Math.min(this.requests.length - 1, this.steps.length - 1)];
    if (step === undefined) throw new Error('FakeAi has no scripted answer');
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(request);
    return Promise.resolve(step);
  }
}

export const reply = (value: unknown): AiResponse => ({
  text: typeof value === 'string' ? value : JSON.stringify(value),
  usage: { promptTokens: 100, outputTokens: 200, thoughtTokens: 0, cachedTokens: 0 },
});
