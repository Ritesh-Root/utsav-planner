import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlanner } from '../../src/server/ai/planner.js';
import { createApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { HttpError, errorHandler } from '../../src/server/errors.js';
import { createLogger } from '../../src/server/logger.js';
import { silentLogger } from '../fixtures/logger.js';

describe('static files', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'utsav-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Utsav</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'assets', 'app-abc123.js.br'), brotliCompressSync('console.log(1)'));
    writeFileSync(join(dir, 'assets', 'app-abc123.js.gz'), gzipSync('console.log(1)'));
    writeFileSync(join(dir, 'theme-init.js'), '// theme');
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

  it('serves the precompressed brotli copy when the browser accepts it, whatever the order', async () => {
    const res = await request(app())
      .get('/assets/app-abc123.js')
      .set('Accept-Encoding', 'gzip, deflate, br, zstd')
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers.vary).toContain('Accept-Encoding');
  });

  it('falls back to the gzip copy, and answers missing files with 404', async () => {
    const res = await request(app())
      .get('/assets/app-abc123.js')
      .set('Accept-Encoding', 'gzip')
      .buffer(true)
      .parse((r, done) => {
        r.on('data', () => undefined);
        r.on('end', () => {
          done(null, null);
        });
      })
      .expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    await request(app()).get('/assets/app-old999.js').expect(404);
    await request(app()).get('/manifest.webmanifest').expect(404);
  });

  it('lets unfingerprinted public files be cached briefly', async () => {
    const res = await request(app()).get('/theme-init.js').expect(200);
    expect(res.headers['cache-control']).toBe(
      'public, max-age=86400, stale-while-revalidate=604800',
    );
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

  it('says why AI is off and trusts one proxy by default', () => {
    expect(loadConfig({}).aiOffReason).toBe('GOOGLE_CLOUD_PROJECT is not set');
    expect(loadConfig({ AI_MODE: 'off', GOOGLE_CLOUD_PROJECT: 'p' }).aiOffReason).toBe(
      'AI_MODE is off',
    );
    expect(loadConfig({ GOOGLE_CLOUD_PROJECT: 'p' }).aiOffReason).toBeNull();
    expect(loadConfig({}).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: '0' }).trustProxy).toBe(0);
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
