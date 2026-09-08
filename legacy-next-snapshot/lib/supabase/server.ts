import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { hardenSessionCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Cookie-bound Supabase client for server code.
 *
 * Memoized per request with React `cache()`. A dashboard render calls this
 * through a dozen service functions, and every extra call used to build a
 * fresh GoTrueClient — which re-fetches the JWKS before it can verify a token
 * locally. The database is ~500ms away over the network, so a duplicated
 * client is not a wasted allocation but a wasted round-trip.
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, hardenSessionCookieOptions(options));
          });
        } catch {
          // Server Components cannot always write cookies; middleware refreshes them.
        }
      },
    },
  });
});
