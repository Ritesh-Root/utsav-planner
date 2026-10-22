import type { z } from 'zod';

import type { Brief, RefineRequest } from '../shared/schemas.js';
import { PlanResponseSchema, RefineResponseSchema } from '../shared/schemas.js';

export interface FieldIssue {
  path: string;
  message: string;
}

/** A failed request, with the server's code and message when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The planning service could not be reached at all (offline, DNS, server down). */
  get unreachable(): boolean {
    return this.status === 0 || this.status >= 502;
  }
}

/** Generous enough for a slow model plus one retry on the server. */
const TIMEOUT_MS = 60_000;

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: FieldIssue[] };
}

/** POST JSON; a network failure or timeout becomes an ApiError with status 0. */
async function send(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    // The caller cancelling is not a failure to report; let it through unchanged.
    if (signal?.aborted) throw error;
    throw new ApiError(
      0,
      timeout.aborted ? 'TIMEOUT' : 'NETWORK',
      'Couldn’t reach Utsav. Check your connection and try again.',
    );
  }
}

/** The server's `{ error: { code, message, fields } }` body, as an ApiError. */
function errorFrom(status: number, data: unknown): ApiError {
  const info = (data as ErrorBody | null)?.error;
  return new ApiError(
    status,
    info?.code ?? 'HTTP_ERROR',
    info?.message ?? 'Something went wrong. Please try again.',
    info?.fields ?? [],
  );
}

async function postJson<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const response = await send(path, body, signal);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFrom(response.status, data);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(response.status, 'BAD_RESPONSE', 'Utsav sent back something unexpected.');
  }
  return parsed.data;
}

export function requestPlan(brief: Brief, today: string, signal?: AbortSignal) {
  return postJson('/api/plan', { brief, today }, PlanResponseSchema, signal);
}

export function requestRefinement(request: RefineRequest, signal?: AbortSignal) {
  return postJson('/api/refine', request, RefineResponseSchema, signal);
}
