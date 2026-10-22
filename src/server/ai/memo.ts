import { LRUCache } from 'lru-cache';

export type Memo<T> = (
  key: string,
  produce: () => Promise<T>,
) => Promise<{ value: T; cached: boolean }>;

/**
 * Cache results by key, and let identical requests that arrive together share one
 * call. Failures are never cached, so the next identical request tries again.
 */
export function createMemo<T extends object>(options: { max: number; ttlMs: number }): Memo<T> {
  const cache = new LRUCache<string, T>({ max: options.max, ttl: options.ttlMs });
  const inFlight = new Map<string, Promise<T>>();

  return async (key, produce) => {
    const hit = cache.get(key);
    if (hit) return { value: hit, cached: true };
    const pending = inFlight.get(key);
    if (pending) return { value: await pending, cached: true };
    const promise = produce();
    inFlight.set(key, promise);
    try {
      const value = await promise;
      cache.set(key, value);
      return { value, cached: false };
    } finally {
      inFlight.delete(key);
    }
  };
}
