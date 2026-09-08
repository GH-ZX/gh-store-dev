import type { Json } from "@/types/database";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { providerIdempotencyKey, type FulfillmentContext } from "./context";

/**
 * The attempt row is the worker's memory, plus the order-status writes that
 * move an order between `paid`, `fulfilling` and `completed`.
 *
 * `(provider, idempotency_key)` is unique, so re-running fulfilment for the same
 * item reuses the existing attempt instead of starting a second purchase.
 *
 * The polling constants live here too: every provider flow waits the same way,
 * and a single definition keeps the checkout window identical for all of them.
 */

export const POLL_ATTEMPTS = 4;
export const POLL_DELAY_MS = 2_500;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OpenAttempt = {
  id: string;
  externalOrderId: string | null;
  status: string;
  /** True only for the worker that atomically claimed the purchase slot. */
  ownsPurchaseClaim: boolean;
};

export async function openAttempt(
  context: FulfillmentContext,
  requestPayload: Record<string, Json>,
  provider: string = G2BULK_PROVIDER_NAME,
): Promise<OpenAttempt | null> {
  const supabase = createSupabaseServiceClient();
  const key = providerIdempotencyKey(context.orderItemId);

  const { data, error } = await supabase
    .from("fulfillment_attempts")
    .upsert(
      {
        order_item_id: context.orderItemId,
        provider,
        status: "pending",
        idempotency_key: key,
        request_payload: requestPayload,
      },
      { onConflict: "provider,idempotency_key", ignoreDuplicates: true },
    )
    .select("id, external_order_id, status")
    .maybeSingle();

  if (data) {
    const { data: claimed } = await supabase
      .from("fulfillment_attempts")
      .update({ status: "processing", last_checked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending")
      .is("external_order_id", null)
      .select("id")
      .maybeSingle();

    return {
      id: data.id,
      externalOrderId: data.external_order_id,
      status: "processing",
      ownsPurchaseClaim: Boolean(claimed),
    };
  }

  // Another worker may have inserted the unique attempt first. Read it back;
  // never start a provider purchase when the claim is ambiguous.
  const { data: existing } = await supabase
    .from("fulfillment_attempts")
    .select("id, external_order_id, status")
    .eq("provider", provider)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (existing) {
    if (existing.status === "pending" && existing.external_order_id === null) {
      const { data: claimed } = await supabase
        .from("fulfillment_attempts")
        .update({ status: "processing", last_checked_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("status", "pending")
        .is("external_order_id", null)
        .select("id")
        .maybeSingle();

      return {
        id: existing.id,
        externalOrderId: existing.external_order_id,
        status: "processing",
        ownsPurchaseClaim: Boolean(claimed),
      };
    }

    return {
      id: existing.id,
      externalOrderId: existing.external_order_id,
      status: existing.status,
      ownsPurchaseClaim: false,
    };
  }

  void error;
  return null;
}

export async function recordAttempt(
  attemptId: string,
  patch: {
    status: string;
    externalOrderId?: string | null;
    response?: unknown;
    delivered?: unknown;
    errorMessage?: string | null;
    errorCode?: string | null;
  },
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("fulfillment_attempts")
    .update({
      status: patch.status,
      ...(patch.externalOrderId !== undefined ? { external_order_id: patch.externalOrderId } : {}),
      ...(patch.response !== undefined ? { response_payload: patch.response as never } : {}),
      ...(patch.delivered !== undefined ? { delivered_payload: patch.delivered as never } : {}),
      ...(patch.errorMessage !== undefined ? { error_message: patch.errorMessage } : {}),
      ...(patch.errorCode !== undefined ? { error_code: patch.errorCode } : {}),
      last_checked_at: new Date().toISOString(),
      ...(patch.status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", attemptId);
}

export async function setOrderStatus(orderId: string, status: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("orders")
    .update({
      status,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", orderId);
}
