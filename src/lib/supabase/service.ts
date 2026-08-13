import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * Exactly one part of the application needs this: fulfilment. Placing an order
 * runs under the customer's own session through a definer RPC, but advancing a
 * fulfilment — recording a provider result, and refunding a terminal failure —
 * must not be something a customer's session can do. If it were, a shopper could
 * claim a refund on an order the supplier actually delivered.
 *
 * `import "server-only"` makes it a build error for this key to reach a client
 * bundle. Never use this client to serve data to a page: RLS is the safety net
 * for reads, and this client has none.
 */

let serviceClient: SupabaseClient<Database> | undefined;

export class MissingServiceRoleKeyError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Fulfilment cannot run without it.",
    );
    this.name = "MissingServiceRoleKeyError";
  }
}

export function createSupabaseServiceClient(): SupabaseClient<Database> {
  if (serviceClient) {
    return serviceClient;
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new MissingServiceRoleKeyError();
  }

  const { url } = getSupabaseEnv();

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
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
