/**
 * localStorage access with no validation library attached, so the first screen
 * can read settings without loading zod. It can be missing or blocked (private
 * windows, policies); nothing here ever throws.
 */

import type { Plan } from '../shared/schemas.js';

export const PLANS_KEY = 'utsav:v1:plans';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Parsed JSON from localStorage, or null when missing, blocked or broken. */
export function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** False when the browser refused: storage blocked, or the quota is full. */
export function writeJson(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Save every plan; false when the browser refused. */
export function writePlans(plans: readonly Plan[]): boolean {
  return writeJson(PLANS_KEY, plans);
}
