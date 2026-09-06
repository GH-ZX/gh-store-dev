import { normalizeHomeLayout, type HomeSection } from "@/lib/home/layout";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cached } from "@server/lib/cache";
import {
  EMPTY_PUBLIC_SETTINGS,
  normalizePublicSettings,
  type PublicStoreSettings,
} from "@server/lib/settings/public-settings";

/**
 * Public storefront settings via the security-definer RPC — never a table
 * select, since `store_settings` also holds payment/provider secrets. A failed
 * read degrades to defaults: the chrome is not worth an error page.
 *
 * Cached 60s per isolate: this row changes only when the owner edits it, and
 * it is read on nearly every page (chrome, invoices).
 */
export async function getPublicStoreSettings(
  supabase: SupabaseClient,
): Promise<PublicStoreSettings> {
  return cached("public-store-settings", 60_000, async () => {
    const { data, error } = await supabase.rpc("get_public_store_settings");
    if (error || !data) {
      return EMPTY_PUBLIC_SETTINGS;
    }
    return normalizePublicSettings(data);
  });
}

/** Public layout configuration; never expose the store settings table. */
export async function getHomeLayout(supabase: SupabaseClient): Promise<HomeSection[]> {
  const { data, error } = await supabase.rpc("get_home_layout");
  return normalizeHomeLayout(error ? null : data);
}
