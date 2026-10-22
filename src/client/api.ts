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

async function postJson<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      0,
      timeout.aborted ? 'TIMEOUT' : 'NETWORK',
      'Couldn’t reach Utsav. Check your connection and try again.',
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const info = (data as ErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      info?.code ?? 'HTTP_ERROR',
      info?.message ?? 'Something went wrong. Please try again.',
      info?.fields ?? [],
    );
  }
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
