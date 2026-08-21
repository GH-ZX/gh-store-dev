import "server-only";

import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import { logFailure } from "@/lib/logging/logger";
import type { Json } from "@/types/database";

/**
 * Owner alerts delivered over Telegram.
 *
 * The Cloudflare Worker delivers these on its schedule; this module only writes
 * the queue. Same rule as customer notifications: alerting must never break the
 * thing it reports on, so {@link enqueueTelegramAlert} swallows every failure
 * and the money path never waits on Telegram.
 *
 * `dedupKey` is optional and deliberately rare — it exists for events that fire
 * repeatedly (a low wallet blocking every checkout) where a unique key makes
 * the insert a no-op instead of a flood.
 */

export type TelegramAlertType =
  | "order_placed"
  | "order_failed"
  | "recharge_request"
  | "support_message"
  | "low_wallet";

export async function enqueueTelegramAlert(input: {
  type: TelegramAlertType;
  payload: Json;
  dedupKey?: string;
}): Promise<void> {
  if (!hasServiceRoleKey()) {
    return;
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("telegram_alerts").upsert(
      {
        type: input.type,
        payload: input.payload,
        ...(input.dedupKey ? { dedup_key: input.dedupKey } : {}),
      },
      {
        onConflict: input.dedupKey ? "type,dedup_key" : undefined,
        // A re-enqueued dedup event must not resurrect a delivered alert.
        ignoreDuplicates: Boolean(input.dedupKey),
      },
    );

    if (error) {
      logFailure("telegram", "enqueue_failed", error, { type: input.type });
    }
  } catch (error) {
    logFailure("telegram", "enqueue_threw", error, { type: input.type });
  }
}
