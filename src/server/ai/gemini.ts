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

export interface AiResponse {
  text: string;
  usage: { promptTokens: number; outputTokens: number };
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

export class AiError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly kind: AiErrorKind,
    message: string = kind,
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
        if (response.promptFeedback?.blockReason) throw new AiError('blocked');
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason && BLOCKED_FINISH.has(finishReason)) throw new AiError('blocked');
        if (finishReason === FinishReason.MAX_TOKENS) throw new AiError('max-tokens');
        const text = response.text;
        if (!text) throw new AiError('empty');
        return {
          text,
          usage: {
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          },
        };
      } catch (error) {
        throw toAiError(error, signal);
      }
    },
  };
}
