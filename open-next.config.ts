import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/*
 * Incremental cache: prepared, not yet armed.
 *
 * Without one, OpenNext runs on the `dummy` override, which stores nothing:
 * every prerenderable page is rendered from scratch on every request, and each
 * of those renders makes several PostgREST calls to a database in Singapore
 * that answers in ~500ms even when it is warm. The queries themselves take
 * under a millisecond — practically the whole page is the ocean. R2 gives that
 * work somewhere to land, so the second visitor to a page pays for none of it.
 *
 * It is left commented out because the bucket does not exist yet, and an R2
 * binding to a missing bucket fails the deploy outright rather than degrading.
 * Enabling it is one command and one commit, and both halves have to land
 * together:
 *
 *   wrangler r2 bucket create gh-store-inc-cache
 *
 * then uncomment the two imports above, the two lines in the config below, and
 * the `r2_buckets` block in wrangler.jsonc.
 *
 * The binding name is not ours to choose: `r2-incremental-cache.js` reads
 * `getCloudflareContext().env.NEXT_INC_CACHE_R2_BUCKET` (see `BINDING_NAME` on
 * line 6 of that file in @opennextjs/cloudflare 1.20.2), so wrangler.jsonc has
 * to declare exactly that name.
 *
 * `memoryQueue` is what regenerates an entry once it goes stale. It needs no
 * binding of its own beyond `WORKER_SELF_REFERENCE`, which is already declared,
 * and it de-dupes concurrent revalidations of one path per isolate — without it
 * a stale page would keep being served until the next deployment changed the
 * build id.
 *
 * The tag cache stays on `dummy` even after that, so `revalidatePath` will not
 * evict entries here. Turning it on means a `NEXT_TAG_CACHE_D1` binding, and a
 * D1 database id only exists once someone creates the database — a placeholder
 * would fail the deploy. See the note beside the R2 binding in wrangler.jsonc.
 */
// Armed: bucket `gh-store-inc-cache` and D1 `gh-store-tag-cache` exist on the
// deploying account and are bound in wrangler.jsonc.
export default defineCloudflareConfig({
	incrementalCache: r2IncrementalCache,
	queue: memoryQueue,
	tagCache: d1NextTagCache,
});
