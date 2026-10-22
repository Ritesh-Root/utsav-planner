import { startTransition, useEffect, useState } from 'react';

import type { EventType } from '../shared/constants.js';
import { EVENT_TYPES } from '../shared/constants.js';

export const PLAN_TABS = ['overview', 'budget', 'timeline', 'vendors', 'ideas'] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

export type Route =
  | { name: 'home' }
  | { name: 'new'; preset: EventType | null }
  | { name: 'plan'; id: string; tab: PlanTab }
  | { name: 'settings' }
  | { name: 'not-found' };

const isTab = (value: string | undefined): value is PlanTab => PLAN_TABS.includes(value as PlanTab);
const isEventType = (value: string | undefined): value is EventType =>
  EVENT_TYPES.includes(value as EventType);

/** Routes live in the hash (`#/plan/abc/budget`), so the server only ever serves one page. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [first, second, third] = parts;
  if (parts.length === 0) return { name: 'home' };
  if (first === 'new' && parts.length <= 2) {
    return { name: 'new', preset: isEventType(second) ? second : null };
  }
  if (first === 'plan' && second && parts.length <= 3) {
    return { name: 'plan', id: second, tab: isTab(third) ? third : 'overview' };
  }
  if (first === 'settings' && parts.length === 1) return { name: 'settings' };
  return { name: 'not-found' };
}

/** The hash for a route; the inverse of parseRoute. */
export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'new':
      return route.preset ? `#/new/${route.preset}` : '#/new';
    case 'plan':
      return `#/plan/${encodeURIComponent(route.id)}${route.tab === 'overview' ? '' : `/${route.tab}`}`;
    case 'settings':
      return '#/settings';
    case 'not-found':
      return '#/';
  }
}

/** Go to a route; `replace` swaps the history entry (used for tab changes). */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const href = hrefFor(route);
  if (options.replace) {
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

// Only `#/…` hashes are routes; others (such as the skip link's `#main`) leave the page as it is.
let lastRouteHash = '';
function currentRouteHash(): string {
  const { hash } = window.location;
  if (hash === '' || hash.startsWith('#/')) lastRouteHash = hash;
  return lastRouteHash;
}

/**
 * The current route. Changes are React transitions, so while the next view's
 * code loads the current screen stays up instead of flashing a loading state.
 */
export function useRoute(): Route {
  const [hash, setHash] = useState(currentRouteHash);
  useEffect(() => {
    const onChange = () => {
      startTransition(() => {
        setHash(currentRouteHash());
      });
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return parseRoute(hash);
}
