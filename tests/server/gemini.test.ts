import { ApiError } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const { AiError, createGeminiClient, toAiError } = await import('../../src/server/ai/gemini.js');

const request = {
  system: 'sys',
  prompt: 'prompt',
  schema: { type: 'object' },
  maxOutputTokens: 100,
  timeoutMs: 1000,
  label: 'plan',
};

const client = () => createGeminiClient({ project: 'p', location: 'global', model: 'm' });

describe('toAiError', () => {
  it('classifies failures so the planner knows what to retry', () => {
    expect(toAiError(new ApiError({ message: 'x', status: 429 })).kind).toBe('rate-limit');
    expect(toAiError(new ApiError({ message: 'x', status: 503 })).kind).toBe('server');
    expect(toAiError(new ApiError({ message: 'x', status: 400 })).kind).toBe('client');
    expect(toAiError(new DOMException('t', 'TimeoutError')).kind).toBe('timeout');
    expect(toAiError(new TypeError('fetch failed')).kind).toBe('network');
    const existing = new AiError('blocked');
    expect(toAiError(existing)).toBe(existing);
    expect(new AiError('server').retryable).toBe(true);
    expect(new AiError('timeout').retryable).toBe(false);
  });
});

describe('createGeminiClient', () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it('asks for schema-bound JSON with low thinking and labels', async () => {
    generateContent.mockResolvedValue({
      text: '{"ok":true}',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    });
    const response = await client().generate(request);
    expect(response).toEqual({
      text: '{"ok":true}',
      usage: { promptTokens: 10, outputTokens: 20 },
    });
    const call = generateContent.mock.calls[0]?.[0] as {
      model: string;
      config: Record<string, unknown>;
    };
    expect(call.model).toBe('m');
    expect(call.config).toMatchObject({
      systemInstruction: 'sys',
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      maxOutputTokens: 100,
      thinkingConfig: { thinkingLevel: 'LOW' },
      labels: { app: 'utsav-planner', route: 'plan' },
    });
  });

  it.each([
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'blocked'],
    [{ text: 'x', candidates: [{ finishReason: 'SAFETY' }] }, 'blocked'],
    [{ text: 'x', candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'max-tokens'],
    [{ text: '', candidates: [{ finishReason: 'STOP' }] }, 'empty'],
  ])('maps %o to %s', async (response, kind) => {
    generateContent.mockResolvedValue(response);
    await expect(client().generate(request)).rejects.toMatchObject({ kind });
  });

  it('turns transport errors into AiErrors', async () => {
    generateContent.mockRejectedValue(new ApiError({ message: 'busy', status: 429 }));
    await expect(client().generate(request)).rejects.toMatchObject({ kind: 'rate-limit' });
  });
});
