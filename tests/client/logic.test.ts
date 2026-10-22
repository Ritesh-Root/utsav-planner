import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, requestPlan } from '../../src/client/api';
import { draftFromBrief, emptyDraft, errorsFromServer, toBrief } from '../../src/client/briefForm';
import { buildOfflinePlan } from '../../src/client/offline';
import { hrefFor, parseRoute } from '../../src/client/router';
import { loadSettings, resolveTheme, saveSettings } from '../../src/client/settings';
import { storeReducer } from '../../src/client/state/store';
import {
  PLANS_KEY,
  parsePlanFile,
  planFileName,
  readPlans,
  writePlans,
} from '../../src/client/storage';
import { PlanSchema } from '../../src/shared/schemas.js';
import { NOW, TODAY, birthdayBrief, templatePlan } from '../fixtures/plans';
import { jsonResponse } from './helpers';

describe('router', () => {
  it('parses every route and round-trips through hrefFor', () => {
    const cases = [
      ['#/', { name: 'home' }],
      ['#/new', { name: 'new', preset: null }],
      ['#/new/wedding', { name: 'new', preset: 'wedding' }],
      ['#/plan/p-1', { name: 'plan', id: 'p-1', tab: 'overview' }],
      ['#/plan/p-1/budget', { name: 'plan', id: 'p-1', tab: 'budget' }],
      ['#/settings', { name: 'settings' }],
    ] as const;
    for (const [hash, route] of cases) {
      expect(parseRoute(hash)).toEqual(route);
      expect(parseRoute(hrefFor(route))).toEqual(route);
    }
  });

  it('treats unknown paths, tabs and presets safely', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/new/party')).toEqual({ name: 'new', preset: null });
    expect(parseRoute('#/plan/p-1/hacks')).toEqual({ name: 'plan', id: 'p-1', tab: 'overview' });
    expect(parseRoute('#/plan/a%20b')).toEqual({ name: 'plan', id: 'a b', tab: 'overview' });
    expect(hrefFor({ name: 'not-found' })).toBe('#/');
  });
});

describe('brief form', () => {
  it('turns a valid draft into a brief, forgiving separators', () => {
    const result = toBrief(
      { ...draftFromBrief(birthdayBrief), budget: '25,000', guests: ' 30 ' },
      TODAY,
    );
    expect(result.errors).toBeNull();
    expect(result.brief).toMatchObject({ budget: 25_000, guests: 30, honoreeAge: 7, days: 1 });
  });

  it('reports every problem with a plain message', () => {
    const result = toBrief({ ...emptyDraft(TODAY), date: '2026-10-01', guests: 'lots' }, TODAY);
    expect(result.brief).toBeNull();
    expect(result.errors).toMatchObject({
      title: 'Give the event a name.',
      location: 'Add the city or area.',
      date: 'Choose today or a date in the future.',
    });
    expect(result.errors?.guests).toContain('whole number');
    expect(result.errors?.budget).toContain('above zero');
  });

  it('only keeps an age for birthdays and checks it is a number', () => {
    const wedding = toBrief(
      { ...draftFromBrief(birthdayBrief), type: 'wedding', honoreeAge: '30' },
      TODAY,
    );
    expect(wedding.brief?.honoreeAge).toBeNull();
    const badAge = toBrief({ ...draftFromBrief(birthdayBrief), honoreeAge: 'seven' }, TODAY);
    expect(badAge.errors?.honoreeAge).toMatch(/age/);
    const farAway = toBrief({ ...draftFromBrief(birthdayBrief), date: '2031-01-01' }, TODAY);
    expect(farAway.errors?.date).toMatch(/three years/);
  });

  it('maps server field errors back onto the form', () => {
    expect(
      errorsFromServer([
        { path: 'brief.guests', message: 'Too small' },
        { path: 'today', message: 'Bad' },
      ]),
    ).toEqual({ guests: 'Enter a whole number of guests from 1 to 5000.' });
  });
});

describe('storage and settings', () => {
  it('reads only valid plans, newest first', () => {
    const older = {
      ...templatePlan(birthdayBrief),
      id: 'older',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const newer = {
      ...templatePlan(birthdayBrief),
      id: 'newer',
      updatedAt: '2026-10-21T00:00:00.000Z',
    };
    localStorage.setItem(PLANS_KEY, JSON.stringify([older, { nonsense: true }, newer]));
    expect(readPlans().map((p) => p.id)).toEqual(['newer', 'older']);
    localStorage.setItem(PLANS_KEY, '{broken');
    expect(readPlans()).toEqual([]);
    expect(writePlans([newer])).toBe(true);
    expect(readPlans()).toHaveLength(1);
  });

  it('checks imported plan files before trusting them', () => {
    const plan = templatePlan(birthdayBrief);
    expect(parsePlanFile(JSON.stringify(plan))).toEqual({ ok: true, plan });
    expect(parsePlanFile('not json')).toMatchObject({ ok: false });
    expect(parsePlanFile(JSON.stringify({ ...plan, version: 9 }))).toMatchObject({ ok: false });
    expect(parsePlanFile('x'.repeat(300_000))).toEqual({
      ok: false,
      message: 'That file is too large to be an Utsav plan.',
    });
    expect(planFileName(plan)).toBe('utsav-mira-s-7th-birthday');
  });

  it('saves settings and resolves the theme from the device', () => {
    expect(loadSettings()).toEqual({ theme: 'system', reading: 'standard' });
    saveSettings({ theme: 'contrast', reading: 'simple' });
    expect(loadSettings()).toEqual({ theme: 'contrast', reading: 'simple' });
    localStorage.setItem('utsav:v1:settings', '{"theme":"neon"}');
    expect(loadSettings().theme).toBe('system');
    expect(resolveTheme('system', (q) => q.includes('dark'))).toBe('dark');
    expect(resolveTheme('system', (q) => q.includes('contrast'))).toBe('contrast');
    expect(resolveTheme('system', () => false)).toBe('light');
    expect(resolveTheme('light', () => true)).toBe('light');
  });
});

describe('plan store', () => {
  const plan = templatePlan(birthdayBrief);
  const edited = { ...plan, title: 'Edited' };

  it('saves, undoes and removes plans', () => {
    let state = storeReducer({ plans: [], history: {} }, { type: 'save', plan, undoable: true });
    expect(state.history[plan.id]).toBeUndefined();
    state = storeReducer(state, { type: 'save', plan: edited, undoable: true });
    expect(state.plans[0]?.title).toBe('Edited');
    state = storeReducer(state, { type: 'undo', id: plan.id });
    expect(state.plans[0]?.title).toBe(plan.title);
    expect(storeReducer(state, { type: 'undo', id: plan.id })).toBe(state);
    state = storeReducer(state, { type: 'remove', id: plan.id });
    expect(state.plans).toEqual([]);
  });

  it('keeps at most 20 undo steps', () => {
    let state = storeReducer(
      { plans: [plan], history: {} },
      { type: 'replace-all', plans: [plan] },
    );
    for (let i = 0; i < 25; i += 1) {
      state = storeReducer(state, {
        type: 'save',
        plan: { ...plan, title: `v${i}` },
        undoable: true,
      });
    }
    expect(state.history[plan.id]).toHaveLength(20);
  });
});

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a validated plan', async () => {
    const plan = templatePlan(birthdayBrief);
    const meta = { source: 'ai', fallbackReason: null, cached: false, latencyMs: 10, model: 'm' };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ plan, meta }))),
    );
    await expect(requestPlan(birthdayBrief, TODAY)).resolves.toEqual({ plan, meta });
    expect(fetch).toHaveBeenCalledWith('/api/plan', expect.objectContaining({ method: 'POST' }));
  });

  it('surfaces server errors with their fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Fix it',
                fields: [{ path: 'brief.guests', message: 'x' }],
              },
            },
            400,
          ),
        ),
      ),
    );
    const error = await requestPlan(birthdayBrief, TODAY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', unreachable: false });
  });

  it('flags network failures and unexpected bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(requestPlan(birthdayBrief, TODAY)).rejects.toMatchObject({
      code: 'NETWORK',
      unreachable: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ plan: 'nope' }))),
    );
    await expect(requestPlan(birthdayBrief, TODAY)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('busy', { status: 503 }))),
    );
    await expect(requestPlan(birthdayBrief, TODAY)).rejects.toMatchObject({ unreachable: true });
  });

  it('builds a labelled plan on the device when offline', () => {
    const plan = buildOfflinePlan(birthdayBrief, TODAY, NOW);
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(plan).toMatchObject({ source: 'template', model: null });
    expect(plan.fallbackReason).toMatch(/built on your device/);
  });
});
