/**
 * Cleans model output (and imported plans) before it reaches the UI. Text is
 * always rendered as text, never HTML, but this also removes contact details so
 * the app can never present invented vendors as real ones.
 */

// Control characters, bidirectional overrides and zero-width characters.
const INVISIBLE =
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const MARKDOWN = /[*_`#>~|[\]]/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Bare domains such as "shop.example.in" with no scheme. The top-level domain must be
// lower case, so ordinary prose ("venue.In the morning") is left alone.
const BARE_DOMAIN =
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|in|org|net|co|io|shop|store|biz|info|app|online|site)\b(?:\/\S*)?/g;
// A run of digits with spaces, dots, dashes or brackets between them. Commas are
// excluded so amounts like ₹2,50,000 survive; colons are excluded so 18:30 does.
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{7,}\d/g;
const PHONE_MIN_DIGITS = 10;

function scrubPhones(text: string): string {
  return text.replace(PHONE_CANDIDATE, (match) =>
    match.replace(/\D/g, '').length >= PHONE_MIN_DIGITS ? '' : match,
  );
}

/** Normalise, strip unsafe characters and contact details, collapse whitespace, cap length. */
export function cleanText(input: string, maxLength: number): string {
  const cleaned = scrubPhones(
    input
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      .replace(URL_PATTERN, '')
      .replace(EMAIL_PATTERN, '')
      .replace(BARE_DOMAIN, '')
      .replace(MARKDOWN, ''),
  )
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  return truncate(cleaned, maxLength);
}

/**
 * Cap `text` at `maxLength` UTF-16 units (the unit zod and `maxLength` use),
 * cutting between code points and at a word boundary where possible.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  let cut = '';
  for (const char of text) {
    if (cut.length + char.length > maxLength - 1) break;
    cut += char;
  }
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/** Case- and space-insensitive key for spotting duplicate titles. */
export function dedupeKey(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Keep the first item for each key. */
export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
