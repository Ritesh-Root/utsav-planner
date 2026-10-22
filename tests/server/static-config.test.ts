import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlanner } from '../../src/server/ai/planner.js';
import { createApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { HttpError, errorHandler } from '../../src/server/errors.js';
import { createLogger, silentLogger } from '../../src/server/logger.js';

describe('static files', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'utsav-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Utsav</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const app = () =>
    createApp({
      planner: createPlanner({ ai: null, logger: silentLogger, dailyCap: 0 }),
      logger: silentLogger,
      version: 'test',
      staticDir: dir,
    });

  it('serves the app shell without caching it', async () => {
    const res = await request(app()).get('/').expect(200);
    expect(res.text).toContain('<title>Utsav</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('caches fingerprinted assets for a year', async () => {
    const res = await request(app()).get('/assets/app-abc123.js').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves the shell for other page paths, and compresses responses', async () => {
    const res = await request(app())
      .get('/plans/anything')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.text).toContain('Utsav');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('still answers API routes with JSON', async () => {
    await request(app()).get('/api/health').expect(200);
    await request(app()).get('/api/missing').expect(404);
  });
});

describe('config', () => {
  it('uses Vertex AI only when a project is configured', () => {
    expect(loadConfig({ GOOGLE_CLOUD_PROJECT: 'p' }).ai).toEqual({
      mode: 'vertex',
      project: 'p',
      location: 'global',
      model: 'gemini-3.5-flash-lite',
    });
    expect(loadConfig({}).ai).toEqual({ mode: 'off' });
    expect(loadConfig({ GOOGLE_CLOUD_PROJECT: 'p', AI_MODE: 'off' }).ai.mode).toBe('off');
  });

  it('parses numbers and fails fast on bad settings', () => {
    expect(loadConfig({ PORT: '9000', DAILY_AI_CAP: '5' })).toMatchObject({
      port: 9000,
      dailyAiCap: 5,
    });
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
    expect(() => loadConfig({ AI_MODE: 'magic' })).toThrow();
  });
});

describe('logger and error handler', () => {
  it('writes one JSON line per entry with a Cloud Logging severity', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.info('hello', { count: 2 });
    logger.warn('careful');
    logger.error('bad');
    expect(lines.map((l) => (JSON.parse(l) as { severity: string }).severity)).toEqual([
      'INFO',
      'WARNING',
      'ERROR',
    ]);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ message: 'hello', count: 2 });
  });

  it('hides internal errors from clients', async () => {
    const lines: string[] = [];
    const { default: express } = await import('express');
    const app = express();
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    app.get('/known', () => {
      throw new HttpError(409, 'CONFLICT', 'Already exists', { retryAfterSec: 3 });
    });
    app.use(errorHandler(createLogger((line) => lines.push(line))));
    const res = await request(app).get('/boom').expect(500);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.body.error.code).toBe('INTERNAL');
    expect(lines.join('')).not.toContain('hunter2');
    const known = await request(app).get('/known').expect(409);
    expect(known.headers['retry-after']).toBe('3');
  });
});
