import { useEffect, useRef, useState } from 'react';

import { localToday } from '../shared/dates.js';

/** Today's date on the user's own calendar; refreshed when they come back to the tab. */
export function useToday(): string {
  const [today, setToday] = useState(() => localToday());
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setToday(localToday());
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Utsav`;
  }, [title]);
}

/**
 * Move focus to the page heading when the view changes, so screen-reader and
 * keyboard users start at the top of the new view. Skipped on first load.
 */
let firstView = true;
export function usePageFocus<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (firstView) {
      firstView = false;
      return;
    }
    ref.current?.focus();
  }, [key]);
  return ref;
}

/**
 * The rendered width of an element, so charts can draw in real pixels and keep
 * their 12px labels readable at every size.
 */
export function useWidth<T extends Element>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(Math.round(entry.contentRect.width), 160));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width] as const;
}
