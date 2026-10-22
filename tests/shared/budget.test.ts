import { describe, expect, it } from 'vitest';

import {
  allocate,
  apportion,
  projectGuests,
  summarizeBudget,
  toBasisPoints,
  withContingency,
} from '../../src/shared/budget.js';
import {
  estimateCap,
  formatMoney,
  parseWholeNumber,
  toWholeAmount,
} from '../../src/shared/money.js';

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

/** Small deterministic PRNG so the property test is repeatable. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('apportion', () => {
  it('always adds up to exactly the total (500 seeded random cases)', () => {
    const random = mulberry32(42);
    for (let i = 0; i < 500; i += 1) {
      const total = Math.floor(random() * 10_000_000);
      const weights = Array.from({ length: 1 + Math.floor(random() * 12) }, () =>
        random() < 0.15 ? 0 : random() * 100,
      );
      const parts = apportion(total, weights);
      expect(sum(parts)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });

  it('gives leftover units to the largest remainders, ties to the earlier line', () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(100, [1, 2])).toEqual([33, 67]);
  });

  it('splits equally when every weight is zero or invalid, and handles empties', () => {
    expect(apportion(9, [0, 0, 0])).toEqual([3, 3, 3]);
    expect(apportion(5, [Number.NaN, -1])).toEqual([3, 2]);
    expect(apportion(100, [])).toEqual([]);
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
    expect(apportion(Number.NaN, [1])).toEqual([0]);
  });

  it('never gives units to a zero-weight line when others have weight', () => {
    expect(apportion(7, [0, 1, 1])).toEqual([0, 4, 3]);
  });
});

describe('withContingency', () => {
  it('adds an 8% contingency when the plan has none', () => {
    const { keys, bp } = withContingency([
      { key: 'venue', share: 50 },
      { key: 'catering', share: 50 },
    ]);
    expect(keys).toEqual(['venue', 'catering', 'contingency']);
    expect(bp).toEqual([4600, 4600, 800]);
  });

  it('clamps an existing contingency into the 5–15% range', () => {
    const low = withContingency([
      { key: 'venue', share: 98 },
      { key: 'contingency', share: 2 },
    ]);
    expect(low.bp[1]).toBe(500);
    const high = withContingency([
      { key: 'venue', share: 60 },
      { key: 'contingency', share: 40 },
    ]);
    expect(high.bp[1]).toBe(1500);
    expect(sum(high.bp)).toBe(10_000);
  });

  it('still produces a valid split when only the contingency has weight', () => {
    const { bp } = withContingency([
      { key: 'venue', share: 0 },
      { key: 'contingency', share: 0 },
    ]);
    expect(sum(bp)).toBe(10_000);
    expect(bp[1]).toBe(800);
  });

  it('converts percentages to basis points that sum to 10,000', () => {
    expect(sum(toBasisPoints([33.3, 33.3, 33.3]))).toBe(10_000);
  });
});

describe('allocate', () => {
  it('keeps locked amounts and splits the rest exactly by share', () => {
    const { amounts, overBy } = allocate(100_000, [
      { shareBp: 5000, locked: false, amount: 0 },
      { shareBp: 3000, locked: true, amount: 40_000 },
      { shareBp: 2000, locked: false, amount: 0 },
    ]);
    expect(amounts).toEqual([42_857, 40_000, 17_143]);
    expect(sum(amounts)).toBe(100_000);
    expect(overBy).toBe(0);
  });

  it('reports how far locked lines exceed the total and zeroes the rest', () => {
    const { amounts, overBy } = allocate(50_000, [
      { shareBp: 5000, locked: true, amount: 60_000 },
      { shareBp: 5000, locked: false, amount: 0 },
    ]);
    expect(amounts).toEqual([60_000, 0]);
    expect(overBy).toBe(10_000);
  });

  it('handles a zero total', () => {
    expect(allocate(0, [{ shareBp: 10_000, locked: false, amount: 0 }]).amounts).toEqual([0]);
  });
});

describe('summarizeBudget', () => {
  it('summarises planned, spent, remaining and per-guest cost', () => {
    const summary = summarizeBudget(
      [
        { amount: 60_000, actual: 10_000 },
        { amount: 40_000, actual: 0 },
      ],
      120_000,
      50,
    );
    expect(summary).toMatchObject({
      planned: 100_000,
      actual: 10_000,
      remaining: 20_000,
      overBy: 0,
      plannedPerGuest: 2000,
      spentPercent: 8,
    });
    expect(sum(summary.percents)).toBe(100);
  });

  it('flags over-budget plans and copes with zero guests and nothing planned', () => {
    const over = summarizeBudget([{ amount: 130_000, actual: 0 }], 100_000, 0);
    expect(over.overBy).toBe(30_000);
    expect(over.remaining).toBe(-30_000);
    expect(over.plannedPerGuest).toBe(0);
    const empty = summarizeBudget([{ amount: 0, actual: 0 }], 0, 10);
    expect(empty.percents).toEqual([0]);
    expect(empty.spentPercent).toBe(0);
  });
});

describe('projectGuests', () => {
  it('scales only per-guest lines', () => {
    const projection = projectGuests(
      [
        { amount: 50_000, perGuest: true },
        { amount: 30_000, perGuest: false },
      ],
      100,
      150,
      80_000,
    );
    expect(projection.amounts).toEqual([75_000, 30_000]);
    expect(projection.projectedTotal).toBe(105_000);
    expect(projection.difference).toBe(25_000);
    expect(projectGuests([{ amount: 10, perGuest: true }], 0, 5, 10).amounts).toEqual([10]);
  });
});

describe('money helpers', () => {
  it('parses whole numbers people type, forgiving separators', () => {
    expect(parseWholeNumber('2,50,000')).toBe(250_000);
    expect(parseWholeNumber(' 25 000 ')).toBe(25_000);
    expect(parseWholeNumber('1_000')).toBe(1000);
    expect(parseWholeNumber('12.5')).toBeNull();
    expect(parseWholeNumber('-3')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
    expect(parseWholeNumber('lots')).toBeNull();
  });

  it('caps AI estimates at three times the budget and rounds amounts', () => {
    expect(estimateCap(25_000)).toBe(75_000);
    expect(toWholeAmount(12.6)).toBe(13);
    expect(toWholeAmount(-4)).toBe(0);
    expect(toWholeAmount(Number.NaN)).toBe(0);
    expect(toWholeAmount(500, 100)).toBe(100);
    expect(formatMoney(250_000, 'INR')).toBe('₹2,50,000');
  });
});
