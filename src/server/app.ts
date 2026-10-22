import { existsSync, readdirSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

import compression from 'compression';
import express from 'express';
import type { Express, RequestHandler } from 'express';

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
  /** Trusted proxies in front of the app (1 on Cloud Run). */
  trustProxy?: number;
  now?: () => Date;
}

const DEFAULT_RATE_LIMITS = {
  api: { windowMs: 60_000, limit: 120 },
  ai: { windowMs: 10 * 60_000, limit: 20 },
} as const;

const ONE_YEAR_SECONDS = 31_536_000;
const IMMUTABLE = `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
/** Unfingerprinted public files (the theme script, the icon) may be a day stale. */
const SHORT_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

/**
 * Serve the build's pre-compressed copies of fingerprinted scripts and styles
 * (brotli quality 11, gzip level 9; see scripts/precompress.mjs) instead of
 * compressing every response. Only plain file names match, so no traversal.
 */
function precompressed(assetsDir: string): RequestHandler {
  const available = new Set(existsSync(assetsDir) ? readdirSync(assetsDir) : []);
  return (req, res, next) => {
    const match = /^\/assets\/([\w.-]+\.(?:js|css))$/.exec(req.path);
    const name = match?.[1];
    if (!name || (req.method !== 'GET' && req.method !== 'HEAD')) {
      next();
      return;
    }
    // Browsers list gzip first ("gzip, deflate, br"), so ask about brotli on its own:
    // the quality-11 .br files are the smallest whenever the client accepts them.
    const encoding = req.acceptsEncodings('br')
      ? 'br'
      : req.acceptsEncodings('gzip')
        ? 'gzip'
        : null;
    const suffix = encoding === 'br' ? '.br' : encoding === 'gzip' ? '.gz' : null;
    if (!suffix || !available.has(name + suffix)) {
      next();
      return;
    }
    res.setHeader('Content-Encoding', encoding ?? '');
    res.setHeader('Vary', 'Accept-Encoding');
    res.type(extname(name));
    res.sendFile(join(assetsDir, name + suffix), { maxAge: '1y', immutable: true });
  };
}

/** Build the app with its dependencies injected, so tests can swap the AI for a fake. */
export function createApp(deps: AppDeps): Express {
  const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS;
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run puts exactly one proxy (Google's front end) in front of the app.
  app.set('trust proxy', deps.trustProxy ?? 1);

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
    app.use(precompressed(join(staticDir, 'assets')));
    app.use(
      express.static(staticDir, {
        index: 'index.html',
        setHeaders(res, filePath) {
          // Vite fingerprints everything in /assets, so it can be cached forever;
          // the page shell must always be revalidated.
          let policy = SHORT_CACHE;
          if (filePath.includes(`${sep}assets${sep}`)) policy = IMMUTABLE;
          else if (filePath.endsWith('.html')) policy = 'no-cache';
          res.setHeader('Cache-Control', policy);
        },
      }),
    );
    // A missing file is a 404, not the app shell: an old tab asking for a replaced
    // chunk then fails cleanly instead of parsing HTML as JavaScript.
    app.use('/assets', (_req, res) => {
      res.status(404).end();
    });
    // The SPA uses hash routing, so any other page path just gets the app shell.
    app.get('/{*page}', (req, res) => {
      if (extname(req.path)) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler(deps.logger));
  return app;
}
