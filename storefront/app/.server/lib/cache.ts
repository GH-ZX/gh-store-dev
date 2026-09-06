/**
 * Isolate-local TTL cache for hot public reads.
 *
 * One Worker isolate serves many requests from the same memory, so a short
 * cache here absorbs repeated renders of data that changes rarely (store
 * settings, homepage catalog) without any coordination. Each entry carries its
 * own deadline; concurrent misses share one in-flight fetch so a stampede
 * still costs a single upstream read. Values are cloned on the way out so a
 * route can never mutate the cached copy for the next request.
 */
const store = new Map<string, { expiresAt: number; value: unknown; pending: Promise<unknown> | null }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && entry.expiresAt > now && entry.value !== undefined) {
    return structuredClone(entry.value) as T;
  }
  if (entry?.pending) {
    return (await entry.pending) as T;
  }

  const slot = { expiresAt: 0, value: undefined as unknown, pending: null as Promise<unknown> | null };
  store.set(key, slot);
  const pending = (async () => {
    const value = await load();
    slot.value = value;
    slot.expiresAt = Date.now() + ttlMs;
    slot.pending = null;
    return value;
  })();
  slot.pending = pending;
  try {
    const value = await pending;
    return structuredClone(value) as T;
  } catch (error) {
    if (store.get(key) === slot) {
      store.delete(key);
    }
    throw error;
  }
}
