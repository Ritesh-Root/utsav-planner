/** Saved plans: read, write, import and name them, validating everything with zod. */
import { z } from 'zod';

import { LIMITS } from '../shared/limits.js';
import type { Plan } from '../shared/schemas.js';
import { PlanSchema } from '../shared/schemas.js';
import { PLANS_KEY, readJson, writeJson } from './browserStorage';

export { PLANS_KEY };

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

/** Save every plan; false when the browser refused. */
export function writePlans(plans: readonly Plan[]): boolean {
  return writeJson(PLANS_KEY, plans);
}

export type ImportResult = { ok: true; plans: Plan[] } | { ok: false; message: string };

/** A file holds one plan (Export) or a list of them (Download all plans). */
const PlanFileSchema = z.union([PlanSchema, z.array(PlanSchema).min(1).max(LIMITS.importPlansMax)]);

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
  const parsed = PlanFileSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: 'That file is not an Utsav plan, or it is damaged.' };
  }
  return { ok: true, plans: Array.isArray(parsed.data) ? parsed.data : [parsed.data] };
}

/** A safe file name from the event title, e.g. "utsav-mira-s-7th-birthday". */
export function planFileName(plan: Plan): string {
  const slug = plan.brief.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `utsav-${slug || 'plan'}`;
}
