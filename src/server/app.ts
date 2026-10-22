import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';

import compression from 'compression';
import express from 'express';
import type { Express } from 'express';

import { LIMITS } from '../shared/limits.js';
import type { Planner } from './ai/planner.js';
import { errorHandler, notFound } from './errors.js';
import type { Logger } from './logger.js';
import { createApiRouter } from './routes.js';
import type { RateLimitSettings } from './security.js';
import {
  createRateLimiter,
  noStore,
  permissionsPolicy,
  requestId,
  requireJson,
  sameOriginWrites,
  securityHeaders,
} from './security.js';

export interface AppDeps {
  planner: Planner;
  logger: Logger;
  version: string;
  /** Built SPA (`dist/client`); omitted in API-only tests. */
  staticDir?: string | undefined;
  rateLimits?: { api: RateLimitSettings; ai: RateLimitSettings };
  now?: () => Date;
}

export const DEFAULT_RATE_LIMITS = {
  api: { windowMs: 60_000, limit: 120 },
  ai: { windowMs: 10 * 60_000, limit: 20 },
} as const;

const ONE_YEAR_SECONDS = 31_536_000;

/** Build the app with its dependencies injected, so tests can swap the AI for a fake. */
export function createApp(deps: AppDeps): Express {
  const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS;
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run puts exactly one proxy (Google's front end) in front of the app.
  app.set('trust proxy', 1);

  app.use(requestId, securityHeaders, permissionsPolicy, compression());

  app.use(
    '/api',
    noStore,
    createRateLimiter(limits.api, 'requests'),
    sameOriginWrites,
    requireJson,
    express.json({ limit: LIMITS.requestBytesMax, strict: true }),
  );
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }
    const started = Date.now();
    res.on('finish', () => {
      deps.logger.info('request', {
        requestId: String(res.locals.requestId ?? ''),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latencyMs: Date.now() - started,
      });
    });
    next();
  });
  app.use(
    '/api',
    createApiRouter({
      planner: deps.planner,
      version: deps.version,
      aiLimiter: createRateLimiter(limits.ai, 'AI requests'),
      now: deps.now ?? (() => new Date()),
    }),
  );
  app.use('/api', notFound);

  const staticDir = deps.staticDir;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, {
        index: 'index.html',
        setHeaders(res, filePath) {
          // Vite fingerprints everything in /assets, so it can be cached forever.
          res.setHeader(
            'Cache-Control',
            filePath.includes(`${sep}assets${sep}`)
              ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
              : 'no-cache',
          );
        },
      }),
    );
    // The SPA uses hash routing, so any other page path just gets the app shell.
    app.get('/{*page}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler(deps.logger));
  return app;
}
