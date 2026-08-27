import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

/*
 * Somewhere for cached work to land.
 *
 * Without an incremental cache OpenNext runs on the `dummy` override, which
 * stores nothing. Every route in this app renders dynamically — the root layout
 * reads a request header and the locale layout reads the session cookie — so
 * this is not about serving prerendered pages. What it backs is the data cache:
 * `unstable_cache` refuses to persist anything without a store behind it, and
 * measured against production, six renders still produced six
 * `get_public_store_settings` calls before this existed.
 *
 * The binding name is not ours to choose: `r2-incremental-cache.js` reads
 * `getCloudflareContext().env.NEXT_INC_CACHE_R2_BUCKET` (see `BINDING_NAME` on
 * line 6 of that file in @opennextjs/cloudflare 1.20.2), so wrangler.jsonc has
 * to declare exactly that name.
 *
 * `memoryQueue` regenerates an entry once it goes stale and de-dupes concurrent
 * revalidations of one path per isolate. It needs no binding beyond
 * `WORKER_SELF_REFERENCE`, which is already declared.
 *
 * Still on the `dummy` tag cache, which is a genuine no-op — `getByTag` returns
 * an empty array and `writeTags` does nothing. So `updateTag` cannot evict
 * anything stored here, and a cached entry lives until its own window expires.
 * That is why the settings cache in settings.service.ts keeps a short window
 * instead of a long one and a tag: the tag is correct for the day a tag cache
 * exists, and the window is what actually bounds staleness today. Giving
 * `revalidatePath`/`updateTag` real teeth means a `NEXT_TAG_CACHE_D1` binding
 * and `tagCache: d1NextTagCache`; the database id only exists once someone
 * creates the database, so it is not written down here.
 */
export default defineCloudflareConfig({
	incrementalCache: r2IncrementalCache,
	queue: memoryQueue,
});
