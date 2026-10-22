import { describe, expect, it } from 'vitest';

import { cleanText, dedupeKey, truncate, uniqueBy } from '../../src/shared/sanitize.js';

describe('cleanText', () => {
  it('removes URLs and email addresses', () => {
    expect(cleanText('Call us at www.best-caterer.example or https://x.example/a?b=1', 200)).toBe(
      'Call us at or',
    );
    expect(cleanText('Write to owner@caterer.example for rates', 200)).toBe('Write to for rates');
  });

  it('removes bare domains but leaves ordinary sentences alone', () => {
    expect(cleanText('Order from amazon.in or sharmacaterers.co.in/menu today', 200)).toBe(
      'Order from or today',
    );
    expect(cleanText('Book the venue.In the evening, relax.', 200)).toBe(
      'Book the venue.In the evening, relax.',
    );
  });

  it('removes phone numbers but keeps money amounts, times and dates', () => {
    expect(cleanText('Phone +91 98765 43210 today', 200)).toBe('Phone today');
    expect(cleanText('Budget ₹2,50,000 by 18:30 on 2026-11-08', 200)).toBe(
      'Budget ₹2,50,000 by 18:30 on 2026-11-08',
    );
  });

  it('strips control, bidi and markdown characters and normalises width', () => {
    expect(cleanText('**Bold**\u202E evil\u0007', 100)).toBe('Bold evil');
    expect(cleanText('ＦＵＬＬ width', 100)).toBe('FULL width');
    expect(cleanText('  spaced   out , text  ', 100)).toBe('spaced out, text');
  });
});

describe('truncate', () => {
  it('cuts at a word boundary and adds an ellipsis', () => {
    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('The quick brown fox jumps', 16)).toBe('The quick brown…');
    expect(truncate('Supercalifragilistic', 10)).toBe('Supercali…');
  });

  it('respects UTF-16 length without splitting emoji', () => {
    const result = truncate('🎉🎉🎉🎉🎉🎉', 6);
    expect(result.length).toBeLessThanOrEqual(6);
    expect(result).toBe('🎉🎉…');
  });
});

describe('dedupe helpers', () => {
  it('treats case and punctuation as the same title', () => {
    expect(dedupeKey('Book the Venue!')).toBe(dedupeKey('book  the venue'));
    expect(uniqueBy(['A', 'a', 'B'], (x) => x.toLowerCase())).toEqual(['A', 'B']);
  });
});
