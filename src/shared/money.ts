import { LIMITS } from './limits.js';

/** Currencies a plan can be budgeted in. */
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];

const formatters = new Map<string, Intl.NumberFormat>();

/** Whole-unit currency formatting, e.g. ₹2,50,000 for INR in the Indian grouping. */
export function formatMoney(amount: number, currency: Currency, locale = 'en-IN'): string {
  const key = `${locale}|${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(Math.round(amount));
}

/**
 * A whole number typed by a person, forgiving spaces and thousands separators
 * ("2,50,000", "25 000"). Null for anything else, including decimals.
 */
export function parseWholeNumber(text: string): number | null {
  const cleaned = text.replace(/[\s,_]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

/** The largest AI cost estimate worth keeping for a given total budget. */
export function estimateCap(budget: number): number {
  return budget * LIMITS.estimateCapMultiple;
}

/** Clamp to a whole, non-negative amount. */
export function toWholeAmount(value: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), max);
}
