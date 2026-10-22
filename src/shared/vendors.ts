import { diffDays } from './dates.js';
import type { BudgetKey, Vendor, VendorStatus } from './schemas.js';

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  'not-started': 'Not started',
  researching: 'Researching',
  contacted: 'Contacted',
  quoted: 'Quote received',
  booked: 'Booked',
  'not-needed': 'Not needed',
};

/** Book-by dates within this many days count as "book soon". */
export const BOOK_SOON_DAYS = 14;

export type VendorState = 'booked' | 'not-needed' | 'overdue' | 'book-soon' | 'open';

export function vendorState(vendor: Pick<Vendor, 'status' | 'bookBy'>, today: string): VendorState {
  if (vendor.status === 'booked') return 'booked';
  if (vendor.status === 'not-needed') return 'not-needed';
  const daysLeft = diffDays(today, vendor.bookBy);
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= BOOK_SOON_DAYS) return 'book-soon';
  return 'open';
}

export function vendorProgress(vendors: readonly Pick<Vendor, 'status'>[]): {
  booked: number;
  needed: number;
  percent: number;
} {
  const needed = vendors.filter((v) => v.status !== 'not-needed').length;
  const booked = vendors.filter((v) => v.status === 'booked').length;
  return { booked, needed, percent: needed > 0 ? Math.round((booked / needed) * 100) : 0 };
}

/** Sum of quotes from booked vendors, per budget line key. */
export function committedByKey(
  vendors: readonly Pick<Vendor, 'status' | 'quote' | 'budgetKey'>[],
): Partial<Record<BudgetKey, number>> {
  const totals: Partial<Record<BudgetKey, number>> = {};
  for (const vendor of vendors) {
    if (vendor.status !== 'booked' || vendor.quote <= 0) continue;
    totals[vendor.budgetKey] = (totals[vendor.budgetKey] ?? 0) + vendor.quote;
  }
  return totals;
}

/** True when the user has recorded anything a refinement must not throw away. */
export function vendorHasUserData(
  vendor: Pick<Vendor, 'status' | 'contactName' | 'contact' | 'quote' | 'notes'>,
): boolean {
  return (
    vendor.status !== 'not-started' ||
    vendor.contactName !== '' ||
    vendor.contact !== '' ||
    vendor.quote > 0 ||
    vendor.notes !== ''
  );
}
