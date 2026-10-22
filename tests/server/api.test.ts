import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createPlanner } from '../../src/server/ai/planner.js';
import { createApp } from '../../src/server/app.js';
import { silentLogger } from '../fixtures/logger.js';
import { toRefineContext } from '../../src/shared/plan.js';
import { PlanSchema } from '../../src/shared/schemas.js';
import { FakeAi, aiPlanFor, reply } from '../fixtures/ai.js';
import { NOW, TODAY, birthdayBrief, templatePlan } from '../fixtures/plans.js';

function appWith(ai: FakeAi | null = new FakeAi(reply(aiPlanFor(birthdayBrief))), aiLimit = 20) {
  return createApp({
    planner: createPlanner({
      ai,
      logger: silentLogger,
      dailyCap: 100,
      now: () => NOW,
      sleep: () => Promise.resolve(),
    }),
    logger: silentLogger,
    version: 'test',
    now: () => NOW,
    rateLimits: { api: { windowMs: 60_000, limit: 100 }, ai: { windowMs: 60_000, limit: aiLimit } },
  });
}

const planBody = { brief: birthdayBrief, today: TODAY };

describe('GET /api/health', () => {
  it('reports status, version and AI mode', async () => {
    const res = await request(appWith()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', version: 'test', ai: 'vertex', model: 'fake-gemini' });
    expect((await request(appWith(null)).get('/api/health')).body.ai).toBe('off');
  });
});

describe('POST /api/plan', () => {
  it('returns a valid plan with metadata', async () => {
    const res = await request(appWith()).post('/api/plan').send(planBody).expect(200);
    expect(PlanSchema.safeParse(res.body.plan).success).toBe(true);
    expect(res.body.meta).toMatchObject({ source: 'ai', cached: false });
  });

  it('still returns a plan (from a template) when AI is off', async () => {
    const res = await request(appWith(null)).post('/api/plan').send(planBody).expect(200);
    expect(res.body.meta.source).toBe('template');
  });

  it('explains which fields are invalid', async () => {
    const res = await request(appWith())
      .post('/api/plan')
      .send({ ...planBody, brief: { ...birthdayBrief, guests: 0, extra: 'x' } })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.map((f: { path: string }) => f.path)).toContain('brief.guests');
    expect(res.body.error.requestId).toMatch(/[0-9a-f-]{36}/);
  });

  it('rejects past event dates and a wrong device date', async () => {
    const past = await request(appWith())
      .post('/api/plan')
      .send({ ...planBody, brief: { ...birthdayBrief, date: '2026-10-01' } })
      .expect(400);
    expect(past.body.error.fields[0].path).toBe('brief.date');
    const skewed = await request(appWith())
      .post('/api/plan')
      .send({ ...planBody, today: '2026-10-30' })
      .expect(400);
    expect(skewed.body.error.code).toBe('INVALID_TODAY');
  });

  it('accepts the user’s local date one day ahead of UTC', async () => {
    await request(appWith())
      .post('/api/plan')
      .send({ ...planBody, today: '2026-10-23' })
      .expect(200);
  });
});

describe('POST /api/refine', () => {
  const body = {
    brief: birthdayBrief,
    today: TODAY,
    context: toRefineContext(templatePlan(birthdayBrief)),
    instruction: 'Add a magic show',
    scope: 'ideas',
    previous: [],
  };

  it('returns the changed sections', async () => {
    const ai = new FakeAi(reply({ message: 'Added it.', ideas: aiPlanFor(birthdayBrief).ideas }));
    const res = await request(appWith(ai)).post('/api/refine').send(body).expect(200);
    expect(res.body.result.message).toBe('Added it.');
    expect(res.body.result.sections.ideas).toHaveLength(aiPlanFor(birthdayBrief).ideas.length);
  });

  it('fails visibly, with Retry-After, when AI is unavailable', async () => {
    const res = await request(appWith(null)).post('/api/refine').send(body).expect(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    const timeout = await request(appWith(new FakeAi(new Error('boom'))))
      .post('/api/refine')
      .send(body)
      .expect(503);
    expect(timeout.headers['retry-after']).toBe('30');
  });

  it('validates the instruction', async () => {
    await request(appWith())
      .post('/api/refine')
      .send({ ...body, instruction: 'x' })
      .expect(400);
  });
});

describe('request hygiene', () => {
  it('only accepts JSON', async () => {
    const res = await request(appWith())
      .post('/api/plan')
      .type('text/plain')
      .send('hi')
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects malformed and oversized bodies', async () => {
    const bad = await request(appWith())
      .post('/api/plan')
      .type('application/json')
      .send('{"brief":')
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const huge = await request(appWith())
      .post('/api/plan')
      .send({ ...planBody, padding: 'x'.repeat(40_000) })
      .expect(413);
    expect(huge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('blocks cross-site writes but allows same-origin ones', async () => {
    const app = appWith();
    await request(app)
      .post('/api/plan')
      .set('Sec-Fetch-Site', 'cross-site')
      .send(planBody)
      .expect(403);
    await request(app)
      .post('/api/plan')
      .set('Origin', 'https://evil.example')
      .send(planBody)
      .expect(403);
    await request(app).post('/api/plan').set('Origin', 'not a url').send(planBody).expect(403);
    await request(app)
      .post('/api/plan')
      .set('Sec-Fetch-Site', 'same-origin')
      .send(planBody)
      .expect(200);
  });

  it('rate-limits AI requests per client', async () => {
    const app = appWith(undefined, 2);
    await request(app).post('/api/plan').send(planBody).expect(200);
    await request(app).post('/api/plan').send(planBody).expect(200);
    const limited = await request(app).post('/api/plan').send(planBody).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBe('60');
  });

  it('keys limits on the address the trusted proxy saw, so spoofed headers do not help', async () => {
    const app = appWith(undefined, 2);
    const send = (forwarded: string) =>
      request(app).post('/api/plan').set('X-Forwarded-For', forwarded).send(planBody);
    await send('1.1.1.1, 203.0.113.9').expect(200);
    await send('2.2.2.2, 203.0.113.9').expect(200);
    await send('3.3.3.3, 203.0.113.9').expect(429);
    // A different address seen by the proxy gets its own allowance.
    await send('3.3.3.3, 203.0.113.10').expect(200);
  });

  it('accepts a device a day behind UTC and refuses events beyond the horizon', async () => {
    await request(appWith())
      .post('/api/plan')
      .send({ ...planBody, today: '2026-10-21' })
      .expect(200);
    const far = await request(appWith())
      .post('/api/plan')
      .send({ brief: { ...birthdayBrief, date: '2030-01-01' }, today: TODAY })
      .expect(400);
    expect(far.body.error.fields).toEqual([
      { path: 'brief.date', message: 'Pick a date within three years' },
    ]);
  });

  it('returns JSON 404s for unknown API routes', async () => {
    const res = await request(appWith()).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('security headers', () => {
  it('sends a strict CSP and hardening headers, and never caches API responses', async () => {
    const res = await request(appWith()).get('/api/health');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
