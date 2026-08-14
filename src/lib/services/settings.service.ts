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
 */

export async function getHomeLayout(): Promise<HomeSection[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_home_layout");

  if (error) {
    return normalizeHomeLayout(null);
  }

  return normalizeHomeLayout(data);
}

/**
 * Deduplicated per request.
 *
 * Three layers now want these settings on a single render — the root layout for
 * the theme, the locale layout for the footer, and a page for its own SEO
 * override — and they are the same row every time. `cache` collapses that to one
 * RPC per request without any of the three having to know the others exist.
 */
export const getPublicStoreSettings = cache(async function getPublicStoreSettings(): Promise<PublicStoreSettings> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_public_store_settings");

  if (error) {
    return EMPTY_PUBLIC_SETTINGS;
  }

  return normalizePublicSettings(data);
});
