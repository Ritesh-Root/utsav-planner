import { BASIS_POINTS, LIMITS } from './limits.js';

/**
 * Split `total` whole units in proportion to `weights` using the largest-remainder
 * method. The parts always add up to exactly `total`. Ties go to the earlier
 * item so results are stable. If every weight is zero the split is equal.
 */
export function apportion(total: number, weights: readonly number[]): number[] {
  const count = weights.length;
  if (count === 0) return [];
  const whole = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((acc, w) => acc + w, 0);
  const effective = sum > 0 ? clean : clean.map(() => 1);
  const effectiveSum = sum > 0 ? sum : count;

  const exact = effective.map((w) => (w / effectiveSum) * whole);
  const parts = exact.map((x) => Math.floor(x));
  let leftover = whole - parts.reduce((acc, p) => acc + p, 0);
  const byRemainder = exact
    .map((x, index) => ({ index, fraction: x - Math.floor(x) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    leftover -= 1;
  }
  return parts;
}

/** Percentages (any scale) to basis points that sum to exactly 10,000. */
export function toBasisPoints(shares: readonly number[]): number[] {
  return apportion(BASIS_POINTS, shares);
}

export interface ShareLine {
  key: string;
  share: number;
}

/**
 * Keep a contingency line between 5% and 15% of the budget, adding one (8%) as the
 * last entry if it is missing, and scale the other lines to fill the rest. Returns
 * basis points, one per line plus the added contingency.
 */
export function withContingency(lines: readonly ShareLine[]): number[] {
  const minBp = LIMITS.contingencyMinPct * 100;
  const maxBp = LIMITS.contingencyMaxPct * 100;
  const defaultBp = LIMITS.contingencyDefaultPct * 100;

  const shares = lines.map((line) => line.share);
  let index = lines.findIndex((line) => line.key === 'contingency');
  if (index === -1) {
    shares.push(0);
    index = shares.length - 1;
  }

  // Only respect a contingency share the input actually gave a weight to.
  const given = (shares[index] ?? 0) > 0;
  const current = toBasisPoints(shares)[index] ?? 0;
  const target = given ? Math.min(Math.max(current, minBp), maxBp) : defaultBp;

  const otherWeights = shares.map((share, i) => (i === index ? 0 : share));
  const othersOnly = otherWeights.every((w) => w <= 0)
    ? otherWeights.map((_, i) => (i === index ? 0 : 1))
    : otherWeights;
  const others = apportion(BASIS_POINTS - target, othersOnly);
  return others.map((value, i) => (i === index ? target : value));
}

export interface AllocatableLine {
  shareBp: number;
  locked: boolean;
  amount: number;
}

export interface Allocation {
  amounts: number[];
  /** How far the locked lines alone exceed the total (0 when they fit). */
  overBy: number;
}

/**
 * Planned amount for every line: locked lines keep what the user typed and the
 * rest of the total is split across unlocked lines by their share.
 */
export function allocate(total: number, lines: readonly AllocatableLine[]): Allocation {
  const whole = Math.max(0, Math.round(total));
  const lockedSum = lines.reduce((acc, line) => acc + (line.locked ? line.amount : 0), 0);
  const free = whole - lockedSum;
  const unlocked = lines.map((line, index) => ({ line, index })).filter(({ line }) => !line.locked);
  const freeParts = apportion(
    Math.max(free, 0),
    unlocked.map(({ line }) => line.shareBp),
  );

  const amounts = lines.map((line) => (line.locked ? line.amount : 0));
  unlocked.forEach(({ index }, i) => {
    amounts[index] = freeParts[i] ?? 0;
  });
  return { amounts, overBy: Math.max(-free, 0) };
}

export interface BudgetSummary {
  total: number;
  planned: number;
  actual: number;
  /** Total minus planned; negative when over budget. */
  remaining: number;
  overBy: number;
  plannedPerGuest: number;
  /** Percent of the total spent so far, rounded. */
  spentPercent: number;
  /** Each line's share of the planned amount; sums to 100 when anything is planned. */
  percents: number[];
}

/** Totals for the budget panel: planned, spent, remaining, overspend and per-guest cost. */
export function summarizeBudget(
  lines: readonly { amount: number; actual: number }[],
  total: number,
  guests: number,
): BudgetSummary {
  const planned = lines.reduce((acc, line) => acc + line.amount, 0);
  const actual = lines.reduce((acc, line) => acc + line.actual, 0);
  return {
    total,
    planned,
    actual,
    remaining: total - planned,
    overBy: Math.max(planned - total, 0),
    plannedPerGuest: guests > 0 ? Math.round(planned / guests) : 0,
    spentPercent: total > 0 ? Math.round((actual / total) * 100) : 0,
    percents:
      planned > 0
        ? apportion(
            100,
            lines.map((line) => line.amount),
          )
        : lines.map(() => 0),
  };
}

export interface GuestProjection {
  fromGuests: number;
  toGuests: number;
  /** Each line's amount if per-guest costs scale with the new head count. */
  amounts: number[];
  projectedTotal: number;
  /** Projected total minus the current budget. */
  difference: number;
}

/** What the plan would cost at a different guest count, keeping per-guest quality. */
export function projectGuests(
  lines: readonly { amount: number; perGuest: boolean }[],
  fromGuests: number,
  toGuests: number,
  budget: number,
): GuestProjection {
  const ratio = fromGuests > 0 ? toGuests / fromGuests : 1;
  const amounts = lines.map((line) =>
    line.perGuest ? Math.round(line.amount * ratio) : line.amount,
  );
  const projectedTotal = amounts.reduce((acc, value) => acc + value, 0);
  return { fromGuests, toGuests, amounts, projectedTotal, difference: projectedTotal - budget };
}
