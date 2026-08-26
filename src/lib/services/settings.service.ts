import { unstable_cache } from "next/cache";
import { cache } from "react";
import { normalizeHomeLayout, type HomeSection } from "@/lib/home/layout";
import {
  EMPTY_PUBLIC_SETTINGS,
  normalizePublicSettings,
  type PublicStoreSettings,
} from "@/lib/settings/public-settings";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Storefront settings reads.
 *
 * Both reads go through security-definer RPCs, never a table select, because
 * `store_settings` also holds payment and provider configuration. A failed read
 * degrades to defaults: the storefront chrome is not worth an error page.
 *
 * Both are also cached across requests, not just within one. These two rows are
 * the most-read data in the product — the settings RPC alone had been called
 * over seventeen thousand times, once per page view — and they change only when
 * the owner edits them. The database sits ~500ms away, so an uncached read of a
 * value that is identical all day was the most expensive thing on the critical
 * path of every render.
 *
 * `updateColumn` in the admin website service calls `updateTag` on every write,
 * so the owner sees an edit on the very next response. The one-minute window is
 * only a backstop for a write path that forgets to.
 */

/** Invalidated by every action that writes `store_settings`. */
export const STORE_SETTINGS_TAG = "store-settings";

async function fetchHomeLayout() {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_home_layout");

  return error ? null : data;
}

async function fetchPublicStoreSettings() {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_public_store_settings");

  return error ? null : data;
}

const cachedHomeLayout = unstable_cache(fetchHomeLayout, ["home-layout"], {
  tags: [STORE_SETTINGS_TAG],
  revalidate: 60,
});

const cachedPublicStoreSettings = unstable_cache(fetchPublicStoreSettings, ["public-store-settings"], {
  tags: [STORE_SETTINGS_TAG],
  revalidate: 60,
});

/*
 * The cache is an optimisation, never a dependency.
 *
 * `unstable_cache` throws outright if it cannot find an incremental cache to
 * write through to, and these two reads sit in the root layout — so a
 * misconfigured or unavailable cache backend would take down every page of the
 * site rather than merely slow it down. Falling back to the direct RPC keeps the
 * storefront correct and merely un-accelerated, which is the right way round.
 */
async function readThrough<T>(cached: () => Promise<T>, direct: () => Promise<T>): Promise<T> {
  try {
    return await cached();
  } catch {
    return direct();
  }
}

export async function getHomeLayout(): Promise<HomeSection[]> {
  return normalizeHomeLayout(await readThrough(cachedHomeLayout, fetchHomeLayout));
}

/**
 * Deduplicated per request on top of the cross-request cache.
 *
 * Three layers want these settings on a single render — the root layout for the
 * theme, the locale layout for the footer, and a page for its own SEO override.
 * `cache` collapses that to one lookup per request without any of the three
 * having to know the others exist.
 */
export const getPublicStoreSettings = cache(async (): Promise<PublicStoreSettings> => {
  const data = await readThrough(cachedPublicStoreSettings, fetchPublicStoreSettings);

  return data === null ? EMPTY_PUBLIC_SETTINGS : normalizePublicSettings(data);
});
