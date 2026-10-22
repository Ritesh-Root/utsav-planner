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

/** Clamp to a whole, non-negative amount. */
export function toWholeAmount(value: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), max);
}
