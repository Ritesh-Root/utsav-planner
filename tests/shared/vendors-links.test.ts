import { describe, expect, it } from 'vitest';

import { googleCalendarUrl, googleMapsSearchUrl } from '../../src/shared/links.js';
import {
  committedByKey,
  vendorHasUserData,
  vendorProgress,
  vendorState,
} from '../../src/shared/vendors.js';

describe('vendors', () => {
  const today = '2026-10-22';

  it('works out each vendor’s state from its status and book-by date', () => {
    expect(vendorState({ status: 'booked', bookBy: '2026-10-01' }, today)).toBe('booked');
    expect(vendorState({ status: 'not-needed', bookBy: '2026-10-01' }, today)).toBe('not-needed');
    expect(vendorState({ status: 'contacted', bookBy: '2026-10-21' }, today)).toBe('overdue');
    expect(vendorState({ status: 'not-started', bookBy: '2026-11-01' }, today)).toBe('book-soon');
    expect(vendorState({ status: 'researching', bookBy: '2027-01-01' }, today)).toBe('open');
  });

  it('counts progress without NaN, ignoring vendors marked not needed', () => {
    expect(vendorProgress([])).toEqual({ booked: 0, needed: 0, percent: 0 });
    expect(
      vendorProgress([{ status: 'booked' }, { status: 'not-needed' }, { status: 'contacted' }]),
    ).toEqual({ booked: 1, needed: 2, percent: 50 });
  });

  it('sums booked quotes per budget line', () => {
    expect(
      committedByKey([
        { status: 'booked', quote: 30_000, budgetKey: 'catering' },
        { status: 'booked', quote: 5_000, budgetKey: 'catering' },
        { status: 'quoted', quote: 9_000, budgetKey: 'decor' },
        { status: 'booked', quote: 0, budgetKey: 'venue' },
      ]),
    ).toEqual({ catering: 35_000 });
  });

  it('knows when a vendor holds user data that must survive a refinement', () => {
    const blank = {
      status: 'not-started' as const,
      contactName: '',
      contact: '',
      quote: 0,
      notes: '',
    };
    expect(vendorHasUserData(blank)).toBe(false);
    expect(vendorHasUserData({ ...blank, notes: 'Called twice' })).toBe(true);
    expect(vendorHasUserData({ ...blank, status: 'contacted' })).toBe(true);
  });
});

describe('links', () => {
  it('builds an all-day Google Calendar link', () => {
    const url = new URL(
      googleCalendarUrl({
        title: 'Mela & fair',
        date: '2026-11-08',
        days: 2,
        details: 'Bring IDs',
      }),
    );
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('dates')).toBe('20261108/20261110');
    expect(url.searchParams.get('text')).toBe('Mela & fair');
    expect(url.searchParams.get('details')).toBe('Bring IDs');
  });

  it('builds a Google Maps search instead of naming businesses', () => {
    const url = new URL(googleMapsSearchUrl('Cake baker', 'Pune'));
    expect(url.searchParams.get('query')).toBe('Cake baker near Pune');
    expect(url.searchParams.get('api')).toBe('1');
  });
});
