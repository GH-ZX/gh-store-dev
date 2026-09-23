import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@server/lib/auth/guards";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
export async function getStoreHealth() {
  await requireAdmin();
  const client = await createSupabaseServerClient() as SupabaseClient;
  const since = new Date(Date.now()-6*86400000).toISOString().slice(0,10);
  const [metrics, terms] = await Promise.all([
    client.from("store_daily_metrics").select("event,count").gte("day",since),
    client.from("offers").select("id,product_id,name_en,name_ar",{count:"exact"}).eq("is_active",true).eq("terms_review_required",true).order("name_en").limit(10),
  ]);
  const counts: Record<string,number> = {};
  for (const row of metrics.data ?? []) counts[row.event] = (counts[row.event] ?? 0) + Number(row.count);
  return { counts: metrics.error ? null : counts, terms: terms.error ? null : { count: terms.count ?? 0, rows: terms.data ?? [] } };
}
