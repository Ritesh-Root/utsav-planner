import type { GenerateContentResponse } from '@google/genai';
import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
} from '@google/genai';

export interface AiRequest {
  system: string;
  prompt: string;
  /** JSON Schema the model must follow. */
  schema: unknown;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Short route name, recorded as a Vertex request label for cost tracking. */
  label: string;
}

/** Tokens a call was billed for. */
export interface AiUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  cachedTokens: number;
}

export interface AiResponse {
  text: string;
  usage: AiUsage;
}

export type AiErrorKind =
  | 'timeout'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'blocked'
  | 'max-tokens'
  | 'empty'
  | 'invalid'
  | 'client';

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set([
  'rate-limit',
  'server',
  'network',
  'empty',
  'invalid',
]);

/** A failed model call, sorted into a kind the planner can act on (retry, fall back, or report). */
export class AiError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly kind: AiErrorKind,
    message: string = kind,
    /** What the failed call was still billed for, when the model answered at all. */
    readonly usage?: AiUsage,
  ) {
    super(message);
    this.name = 'AiError';
    this.retryable = RETRYABLE.has(kind);
  }
}

/** The one thing the planner needs from a model; tests swap in a fake. */
export interface AiClient {
  readonly model: string;
  generate(request: AiRequest): Promise<AiResponse>;
}

const BLOCKED_FINISH: ReadonlySet<FinishReason> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }));

/** Classify any failure from the SDK so the planner knows whether to retry. */
export function toAiError(error: unknown, signal?: AbortSignal): AiError {
  if (error instanceof AiError) return error;
  if (signal?.aborted || (error instanceof Error && /abort|timeout/i.test(error.name))) {
    return new AiError('timeout');
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return new AiError('rate-limit');
    if (error.status >= 500) return new AiError('server');
    return new AiError('client', `HTTP ${error.status}`);
  }
  return new AiError('network');
}

/** Tokens a response was billed for; Vertex leaves out the counts that are zero. */
function readUsage(response: GenerateContentResponse): AiUsage {
  const counts = response.usageMetadata ?? {};
  return {
    promptTokens: counts.promptTokenCount ?? 0,
    outputTokens: counts.candidatesTokenCount ?? 0,
    thoughtTokens: counts.thoughtsTokenCount ?? 0,
    cachedTokens: counts.cachedContentTokenCount ?? 0,
  };
}

/** The answer's text, or an `AiError` saying why there is nothing usable. */
function readText(response: GenerateContentResponse, usage: AiUsage): string {
  if (response.promptFeedback?.blockReason) throw new AiError('blocked', undefined, usage);
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && BLOCKED_FINISH.has(finishReason)) {
    throw new AiError('blocked', undefined, usage);
  }
  if (finishReason === FinishReason.MAX_TOKENS) throw new AiError('max-tokens', undefined, usage);
  const text = response.text;
  if (!text) throw new AiError('empty', undefined, usage);
  return text;
}

/**
 * Gemini on Vertex AI. Authentication comes from the Cloud Run service account
 * (or local Application Default Credentials): there is no API key anywhere.
 */
export function createGeminiClient(options: {
  project: string;
  location: string;
  model: string;
}): AiClient {
  const genai = new GoogleGenAI({
    vertexai: true,
    project: options.project,
    location: options.location,
    // The planner owns retries, so SDK retries must not stack on top.
    httpOptions: { retryOptions: { attempts: 1 } },
  });

  return {
    model: options.model,
    async generate(request) {
      const signal = AbortSignal.timeout(request.timeoutMs);
      try {
        const response = await genai.models.generateContent({
          model: options.model,
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          config: {
            systemInstruction: request.system,
            responseMimeType: 'application/json',
            responseJsonSchema: request.schema,
            maxOutputTokens: request.maxOutputTokens,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            safetySettings: SAFETY_SETTINGS,
            labels: { app: 'utsav-planner', route: request.label },
            abortSignal: signal,
          },
        });
        const usage = readUsage(response);
        return { text: readText(response, usage), usage };
      } catch (error) {
        throw toAiError(error, signal);
      }
    },
  };
}
