import { LIMITS } from '../shared/limits.js';
import type { Plan } from '../shared/schemas.js';
import { PlanSchema } from '../shared/schemas.js';

export const PLANS_KEY = 'utsav:v1:plans';

/** localStorage can be missing or blocked (private mode, policies); never let that crash the app. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    storage()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const newestFirst = (a: Plan, b: Plan) => b.updatedAt.localeCompare(a.updatedAt);

/** Saved plans, newest first. Anything that fails validation is skipped, never trusted. */
export function readPlans(): Plan[] {
  const raw = readJson(PLANS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => PlanSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort(newestFirst);
}

export function writePlans(plans: readonly Plan[]): boolean {
  return writeJson(PLANS_KEY, plans);
}

export type ImportResult = { ok: true; plan: Plan } | { ok: false; message: string };

/** Check an imported plan file thoroughly before it touches saved data. */
export function parsePlanFile(text: string): ImportResult {
  if (new TextEncoder().encode(text).length > LIMITS.importBytesMax) {
    return { ok: false, message: 'That file is too large to be an Utsav plan.' };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That file is not valid JSON.' };
  }
  const parsed = PlanSchema.safeParse(data);
  return parsed.success
    ? { ok: true, plan: parsed.data }
    : { ok: false, message: 'That file is not an Utsav plan, or it is damaged.' };
}

export function planFileName(plan: Plan): string {
  const slug = plan.brief.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `utsav-${slug || 'plan'}`;
}
