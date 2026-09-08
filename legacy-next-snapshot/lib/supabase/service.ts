import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * This client exists because some work must not run under a customer's session:
 * advancing a fulfilment and refunding a terminal failure (a shopper must never
 * be able to claim a refund on an order the supplier actually delivered), and
 * the neighbouring machinery that must keep running when no customer is
 * involved — the reconciliation sweep, the notification and alert queues the
 * sweep feeds, invoice reads the customer's own RLS row set cannot express, and
 * the trending scan over every customer's order items, which RLS rightly locks
 * to its owner. Admin dashboard writes use it too, only after `requireAdmin`
 * has asserted the session in the caller's own request.
 *
 * The common shape of every legitimate use: the service client decides something
 * the calling session must not be able to decide, or reads across rows the
 * calling session must not be able to see. Anything that *can* run under the
 * caller's session still does, so RLS keeps answering for the reads it exists
 * to answer for.
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
