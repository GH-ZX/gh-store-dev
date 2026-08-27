import "server-only";

import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import { logFailure } from "@/lib/logging/logger";
import type { Json } from "@/types/database";

/**
 * Alerts delivered over Telegram.
 *
 * The Cloudflare Worker delivers these on its schedule; this module only writes
 * the queue. Same rule as customer notifications: alerting must never break the
 * thing it reports on, so {@link enqueueTelegramAlert} swallows every failure
 * and the money path never waits on Telegram.
 *
 * `userId` routes the alert to a linked customer's chat (looked up by the
 * Worker); when omitted the alert goes to the owner's chat, as before. Owner
 * and customer alerts share the same queue and types — `order_failed` already
 * carries the refund state both audiences want — so there is exactly one drain
 * and one retry loop.
 *
 * `dedupKey` is optional and deliberately rare — it exists for events that fire
 * repeatedly (a low wallet blocking every checkout) where a unique key makes
 * the insert a no-op instead of a flood.
 */

export type TelegramAlertType =
  | "order_placed"
  | "order_delivered"
  | "order_failed"
  | "recharge_request"
  | "recharge_approved"
  | "recharge_rejected"
  | "support_message"
  | "support_reply"
  | "low_wallet"
  | "low_stock"
  | "wallet_adjusted"
  | "new_customer";

export async function enqueueTelegramAlert(input: {
  type: TelegramAlertType;
  payload: Json;
  dedupKey?: string;
  /** When set, delivered to the linked customer chat instead of the owner. */
  userId?: string;
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
        ...(input.userId ? { user_id: input.userId } : {}),
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
