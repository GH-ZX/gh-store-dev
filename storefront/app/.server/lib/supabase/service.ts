import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runtimeVar } from "@server/runtime-env";
import { getStoreEnv } from "@server/env";
import type { Database } from "@server/types/database";

/**
 * Service-role client. Bypasses row-level security entirely — same contract
 * as the legacy client: fulfilment, refunds, cross-row reads and admin writes
 * (after requireAdminId in the caller's request) only. Never serve page data
 * from it; RLS is the safety net for reads, and this client has none.
 *
 * Secrets come from Worker bindings via the runtime carrier, not process.env,
 * which does not exist in workerd. Singleton per isolate: the secret is
 * deployment-static, so sharing one client is safe.
 */

let serviceClient: SupabaseClient<Database> | undefined;

export class MissingServiceRoleKeyError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not configured. Fulfilment cannot run without it.");
    this.name = "MissingServiceRoleKeyError";
  }
}

export function createSupabaseServiceClient(): SupabaseClient<Database> {
  if (serviceClient) {
    return serviceClient;
  }

  const secret = runtimeVar("SUPABASE_SERVICE_ROLE_KEY");

  if (!secret) {
    throw new MissingServiceRoleKeyError();
  }

  const { url } = getStoreEnv({
    SUPABASE_URL: runtimeVar("SUPABASE_URL"),
    SUPABASE_PUBLISHABLE_KEY: runtimeVar("SUPABASE_PUBLISHABLE_KEY"),
    APP_URL: runtimeVar("APP_URL"),
  });

  serviceClient = createClient<Database>(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serviceClient;
}

/** Whether fulfilment is configured to run at all. */
export function hasServiceRoleKey(): boolean {
  return Boolean(runtimeVar("SUPABASE_SERVICE_ROLE_KEY"));
}
