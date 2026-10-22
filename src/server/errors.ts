import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodError } from 'zod';

import { LIMITS } from '../shared/limits.js';
import type { Logger } from './logger.js';

export interface FieldError {
  path: string;
  message: string;
}

/** An error that is safe to show to the client as-is. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { fields?: FieldError[]; retryAfterSec?: number } = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** A 400 that lists the fields to fix, by path, without echoing the input. */
export function validationError(error: ZodError, message = 'Some details need fixing.'): HttpError {
  return new HttpError(400, 'VALIDATION_FAILED', message, {
    fields: error.issues.slice(0, LIMITS.fieldErrorsMax).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

/** Unknown API routes become a 404 in the standard error envelope. */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'No such endpoint.'));
};

function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return typeof error === 'object' && error !== null && 'type' in error && 'status' in error;
}

/** Every error becomes `{ error: { code, message, requestId, … } }`; internals stay in the logs. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const requestId = String(res.locals.requestId ?? '');
    let httpError: HttpError;
    if (error instanceof HttpError) {
      httpError = error;
    } else if (isBodyParserError(error) && error.type === 'entity.too.large') {
      httpError = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    } else if (isBodyParserError(error) && error.type === 'entity.parse.failed') {
      httpError = new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
    } else {
      logger.error('unhandled error', {
        requestId,
        path: req.path,
        error: error instanceof Error ? error.name : 'unknown',
      });
      httpError = new HttpError(500, 'INTERNAL', 'Something went wrong. Please try again.');
    }
    if (httpError.details.retryAfterSec !== undefined) {
      res.setHeader('Retry-After', String(httpError.details.retryAfterSec));
    }
    res.status(httpError.status).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId,
        ...httpError.details,
      },
    });
  };
}
