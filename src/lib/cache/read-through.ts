/**
 * Read-through caching for reads that sit in front of the database.
 *
 * Two layers, cheapest first:
 *
 *  * `isolateCached` — a short-lived copy in the isolate's own memory. On
 *    Cloudflare Workers a Worker isolate serves many requests before it is
 *    recycled, so remembering a value for a few seconds removes almost all of
 *    the reads of it at any real request rate. It needs no binding at all.
 *
 *  * `readThrough` — Next's `unstable_cache`, which persists through the
 *    OpenNext incremental cache so the copy is shared across isolates. It
 *    throws outright when no backing store is configured (until the R2 bucket
 *    exists there is none), so it is never called directly: the fallback keeps
 *    the caller correct and merely un-accelerated, which is the right way
 *    round for a cache.
 *
 * Extracted from `settings.service.ts`, where the shape was first built, so the
 * trending-offers read — the other scan that runs on every homepage render —
 * can share it. Both layers store only resolved values, never in-flight
 * promises: caching a pending promise at module scope is what made the
 * supplier-wallet read throw "Cannot perform I/O on behalf of a different
 * request" on Workers, because a second request would await an I/O context
 * belonging to the first.
 *
 * Isolate memory cannot be reached by `updateTag`. A caller whose writes must
 * be visible immediately keeps the TTL short (settings uses 15s behind an
 * admin save that also calls `updateTag`); a value like the trending list that
 * already tolerates a minute of staleness can use a longer one.
 */

type IsolateEntry<T> = { value: T; at: number };

export function isolateCached<T>(read: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let entry: IsolateEntry<T> | null = null;

  return async () => {
    if (entry && Date.now() - entry.at < ttlMs) {
      return entry.value;
    }

    const value = await read();
    entry = { value, at: Date.now() };

    return value;
  };
}

/**
 * The cached read when the incremental cache can answer, the direct read when
 * it cannot. Every failure of the cache layer — a missing binding, a runtime
 * without `unstable_cache` — degrades to the direct read.
 */
export async function readThrough<T>(cached: () => Promise<T>, direct: () => Promise<T>): Promise<T> {
  try {
    return await cached();
  } catch {
    return direct();
  }
}
