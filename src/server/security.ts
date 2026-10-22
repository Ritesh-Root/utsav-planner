import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

import { HttpError } from './errors.js';

/** Strict headers: the SPA loads nothing but its own files. */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  frameguard: { action: 'deny' },
});

export const permissionsPolicy: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  next();
};

export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/**
 * Browsers say where a request came from. Refuse cross-site writes so other
 * sites cannot spend this app's AI quota through a visitor's browser.
 */
export const sameOriginWrites: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }
  const site = req.get('sec-fetch-site');
  const origin = req.get('origin');
  const crossSite = site !== undefined && site !== 'same-origin' && site !== 'none';
  let foreignOrigin = false;
  if (origin !== undefined) {
    try {
      foreignOrigin = new URL(origin).host !== req.get('host');
    } catch {
      foreignOrigin = true;
    }
  }
  if (crossSite || foreignOrigin) {
    next(new HttpError(403, 'CROSS_SITE', 'Requests from other sites are not allowed.'));
    return;
  }
  next();
};

export const requireJson: RequestHandler = (req, _res, next) => {
  if (req.method === 'POST' && !req.is('application/json')) {
    next(
      new HttpError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Send JSON with Content-Type: application/json.',
      ),
    );
    return;
  }
  next();
};

export interface RateLimitSettings {
  windowMs: number;
  limit: number;
}

export function createRateLimiter(settings: RateLimitSettings, label: string): RequestHandler {
  return rateLimit({
    windowMs: settings.windowMs,
    limit: settings.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next, options) => {
      next(
        new HttpError(
          429,
          'RATE_LIMITED',
          `Too many ${label}. Please wait a moment and try again.`,
          {
            retryAfterSec: Math.ceil(options.windowMs / 1000),
          },
        ),
      );
    },
  });
}
