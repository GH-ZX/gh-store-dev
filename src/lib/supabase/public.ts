import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/*
 * Anonymous read client for storefront data.
 *
 * A module singleton, because it carries no per-request state: no cookies, no
 * session, no token refresh. A homepage render touches this through ~15 catalog
 * reads, and allocating a client per read bought nothing but garbage.
 */
let client: SupabaseClient<Database> | null = null;

export function createSupabasePublicClient() {
  if (client) {
    return client;
  }

  const { url, publishableKey } = getSupabaseEnv();

  client = createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
