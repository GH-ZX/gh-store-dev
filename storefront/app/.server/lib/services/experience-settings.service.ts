import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_DISCOVERY_SETTINGS,
  DEFAULT_POSTHOG_SETTINGS,
  discoverySettingsSchema,
  posthogSettingsSchema,
} from "@/lib/settings/experience-settings";
import { cached, clearCache } from "@server/lib/cache";
import { requireAdmin } from "@server/lib/auth/guards";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";

export async function getDiscoverySettings(client: SupabaseClient) {
  return cached("discovery-settings", 30_000, async () => {
    const { data, error } = await client.from("store_discovery_settings").select("quick_buy_count,category_count,products_per_category,offers_per_product,hide_empty_categories").eq("id", true).single();
    if (error || !data) { console.warn("Discovery settings unavailable; using safe defaults"); return DEFAULT_DISCOVERY_SETTINGS; }
    const parsed = discoverySettingsSchema.safeParse(data);
    return parsed.success ? parsed.data : DEFAULT_DISCOVERY_SETTINGS;
  });
}
export async function getPosthogSettings() {
  return cached("posthog-settings", 30_000, async () => {
    let client: SupabaseClient;
    try {
      client = createSupabaseServiceClient() as SupabaseClient;
    } catch {
      return DEFAULT_POSTHOG_SETTINGS;
    }
    try {
      const { data, error } = await client.from("store_posthog_settings").select("enabled,project_key,region,project_id").eq("id", true).single();
      if (!error && data) {
        const parsed = posthogSettingsSchema.safeParse(data);
        if (parsed.success) return parsed.data;
        return DEFAULT_POSTHOG_SETTINGS;
      }
      // Fail closed: a missing DB setting must never enable analytics through another source.
    } catch {
      return DEFAULT_POSTHOG_SETTINGS;
    }
    return DEFAULT_POSTHOG_SETTINGS;
  });
}
export async function getPosthogEnabled(client: SupabaseClient) {
  try {
    return await cached("posthog-enabled", 30_000, async () => {
      const { data, error } = await client.rpc("store_posthog_enabled");
      if (!error) return data === true;

      return false;
    });
  } catch {
    return false;
  }
}
export async function getAdminExperienceSettings() {
  await requireAdmin();
  const client = await createSupabaseServerClient() as SupabaseClient;
  const discovery = await getDiscoverySettings(client);
  const result = await client.from("store_posthog_settings").select("enabled,project_key,region,project_id").eq("id", true).single();
  if (result.error || !result.data) throw new Error("Analytics settings unavailable");
  const settings = posthogSettingsSchema.parse(result.data);
  const { project_key, ...posthog } = settings;
  return { discovery, posthog: { ...posthog, configured: Boolean(project_key) } };
}
export async function saveExperienceSettings(form: FormData) {
  await requireAdmin();
  const client = await createSupabaseServerClient() as SupabaseClient;
  const analytics = form.get("intent") === "savePosthog";
  let values: ReturnType<typeof discoverySettingsSchema.safeParse> | ReturnType<typeof posthogSettingsSchema.safeParse>;
  if (analytics) {
    const { data, error } = await client.from("store_posthog_settings").select("project_key").eq("id", true).single();
    if (error) return { error: "save_failed" };
    values = posthogSettingsSchema.safeParse({ ...Object.fromEntries(form), enabled: form.get("enabled") === "on", project_key: String(form.get("project_key") ?? "").trim() || data.project_key });
  } else {
    values = discoverySettingsSchema.safeParse({ ...Object.fromEntries(form), hide_empty_categories: form.get("hide_empty_categories") === "on" });
  }
  const parsed = values;
  if (!parsed.success) return { error: "invalid_input" };
  const { error } = await client.from(analytics ? "store_posthog_settings" : "store_discovery_settings").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return { error: "save_failed" };
  clearCache();
  return { error: null, saved: true };
}
