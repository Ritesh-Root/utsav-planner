import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Tests run from the project root (vitest's default working directory).
const css = readFileSync(resolve('src/client/styles/tokens.css'), 'utf8');

/** Tokens for one theme: the light defaults with the theme's overrides on top. */
function tokens(selector: string | null): Record<string, string> {
  const block = (sel: string) => {
    const start = css.indexOf(`${sel} {`);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1] ?? '', m[2] ?? '']),
    );
  };
  return { ...block(':root'), ...(selector ? block(selector) : {}) };
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'ground'],
  ['text', 'surface'],
  ['muted', 'ground'],
  ['muted', 'surface'],
  ['accent', 'ground'],
  ['accent', 'surface'],
  ['negative', 'surface'],
  ['positive', 'surface'],
  ['warning', 'surface'],
  ['primary-ink', 'primary'],
  ['pill-positive-ink', 'pill-positive-bg'],
  ['pill-negative-ink', 'pill-negative-bg'],
  ['pill-warning-ink', 'pill-warning-bg'],
  ['pill-neutral-ink', 'pill-neutral-bg'],
];

describe('colour tokens', () => {
  it.each([
    ['light', null, 4.5],
    ['dark', ":root[data-theme='dark']", 4.5],
    ['high contrast', ":root[data-theme='contrast']", 7],
  ] as const)('%s theme: every text pair reaches %s', (_name, selector, minimum) => {
    const t = tokens(selector);
    for (const [fg, bg] of TEXT_PAIRS) {
      const value = ratio(t[fg] ?? '', t[bg] ?? '');
      expect(value, `${fg} on ${bg} is ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it.each([
    ['light', null],
    ['dark', ":root[data-theme='dark']"],
    ['high contrast', ":root[data-theme='contrast']"],
  ] as const)(
    '%s theme: input borders and the focus ring reach 3:1 (WCAG 1.4.11)',
    (_name, selector) => {
      const t = tokens(selector);
      expect(ratio(t.control ?? '', t.surface ?? '')).toBeGreaterThanOrEqual(3);
      expect(ratio(t.focus ?? '', t.ground ?? '')).toBeGreaterThanOrEqual(3);
    },
  );
});
