import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  callbackEventId,
  classifyCallbackStatus,
  decideCallback,
} from "../../../src/lib/orders/g2bulk-callback.ts";

/**
 * G2Bulk order callback.
 *
 * Until this existed, an order the supplier finished a minute after checkout
 * gave up sat at `fulfilling` until the reconciliation sweep came round. The
 * sweep is still the backstop — it settles what never arrives here — but it runs
 * on a schedule, and a customer watching an order page should not wait for it.
 *
 * Hosted as an edge function rather than a route on the store, for the same
 * reason the Sam payment callback is: the supplier calls from its own network,
 * and the store has no public address until it is deployed. A callback pointed
 * at a development machine is an order that is never reported.
 *
 * The payload is treated as a claim, not an instruction. It says an order
 * finished; what the store does about that is decided against its own record of
 * the order — see `decideCallback`, which is kept in the store's source so it
 * can be tested, since nothing in this runtime can be.
 *
 * `verify_jwt` is off — G2Bulk cannot send a Supabase JWT — so the token check
 * below is the only gate and runs before anything else.
 */

type Payload = {
  order_id?: unknown;
  status?: unknown;
  message?: unknown;
  remark?: unknown;
};

/** The supplier waits 10s and retries once, so every answer must be quick. */
function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function digest(value: string): Promise<ArrayBuffer> {
  return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

/** Constant-time comparison that does not leak the secret's length. */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }

  return mismatch === 0;
}

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Postgres' unique violation: how a callback we have already handled announces itself. */
const UNIQUE_VIOLATION = "23505";

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const providers = settings?.providers as { g2bulk?: { webhook_secret?: unknown } } | null;
  const expected = text(providers?.g2bulk?.webhook_secret);
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";

  if (!expected || token.length === 0 || !(await secretMatches(token, expected))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: Payload;

  try {
    body = (await request.json()) as Payload;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const externalOrderId = text(body.order_id);

  if (!externalOrderId) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const status = classifyCallbackStatus(body.status);

  /*
   * A status that is not an outcome is answered 200 and dropped. It is not a
   * failure on either side, and a 4xx would earn a pointless retry of something
   * there is nothing to do about.
   */
  if (status === "unsupported") {
    return json({ ok: true, applied: false, reason: "not_terminal" }, 200);
  }

  const eventId = callbackEventId(externalOrderId, status);

  /*
   * Claim the event before acting on it. `(provider, external_event_id)` is
   * unique, which is what makes a retry harmless — but the claim is only half
   * of it: an event already claimed and *not* yet processed is one whose first
   * delivery died midway, and that one is worth running again rather than
   * discarding. This is the case a plain "insert or ignore" gets wrong.
   */
  const { data: claimed, error: claimError } = await supabase
    .from("fulfillment_events")
    .insert({
      provider: "g2bulk",
      external_event_id: eventId,
      status: text(body.status),
      payload: body as unknown as Record<string, unknown>,
    })
    .select("id")
    .maybeSingle();

  let eventRowId = claimed?.id ?? null;

  if (claimError) {
    if (claimError.code !== UNIQUE_VIOLATION) {
      return json({ ok: false, error: "storage_failed" }, 500);
    }

    const { data: existing } = await supabase
      .from("fulfillment_events")
      .select("id, processed_at")
      .eq("provider", "g2bulk")
      .eq("external_event_id", eventId)
      .maybeSingle();

    if (existing?.processed_at) {
      return json({ ok: true, applied: false, duplicate: true }, 200);
    }

    eventRowId = existing?.id ?? null;
  }

  const settle = async (patch: { attemptId?: string; error?: string | null }): Promise<void> => {
    if (!eventRowId) {
      return;
    }

    await supabase
      .from("fulfillment_events")
      .update({
        processed_at: new Date().toISOString(),
        ...(patch.attemptId ? { fulfillment_attempt_id: patch.attemptId } : {}),
        ...(patch.error === undefined ? {} : { processing_error: patch.error }),
      })
      .eq("id", eventRowId);
  };

  const { data: attempt } = await supabase
    .from("fulfillment_attempts")
    .select(
      "id, status, order_item_id, order_items!inner (order_id, orders!inner (id, order_number, status, user_id))",
    )
    .eq("provider", "g2bulk")
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  const item = attempt
    ? ((Array.isArray(attempt.order_items) ? attempt.order_items[0] : attempt.order_items) as {
        order_id: string;
        orders: { id: string; order_number: string; status: string; user_id: string };
      } | null)
    : null;
  const order = item
    ? ((Array.isArray(item.orders) ? item.orders[0] : item.orders) as {
        id: string;
        order_number: string;
        status: string;
        user_id: string;
      })
    : null;

  if (!attempt || !order) {
    /*
     * The supplier id is not one we have recorded — most likely because the
     * callback overtook our own write of it, which is a real race on a fast
     * order. Left unprocessed and answered 404 so the documented single retry
     * gets another go; the reconciliation sweep settles it either way.
     */
    await supabase
      .from("fulfillment_events")
      .update({ processing_error: "No fulfilment attempt carries this supplier order id." })
      .eq("id", eventRowId ?? "");

    return json({ ok: false, error: "unknown_order" }, 404);
  }

  const decision = decideCallback({
    status,
    attempt: { status: attempt.status, orderNumber: order.order_number },
    remark: text(body.remark),
  });

  if (decision.action === "ignore") {
    await settle({ attemptId: attempt.id, error: null });

    return json({ ok: true, applied: false, reason: decision.reason }, 200);
  }

  /*
   * A contradiction settles nothing. The order is left exactly as it is and the
   * disagreement is written where an operator already looks — the attempt's
   * error message shows on the order page — rather than only into a table
   * nothing renders. Answered 200 because a retry would reach the same
   * conclusion.
   */
  if (decision.action === "conflict") {
    await supabase
      .from("fulfillment_attempts")
      .update({ error_message: decision.reason, error_code: "callback_conflict" })
      .eq("id", attempt.id);
    await settle({ attemptId: attempt.id, error: decision.reason });

    return json({ ok: true, applied: false, reason: "conflict" }, 200);
  }

  const now = new Date().toISOString();

  if (decision.action === "complete") {
    await supabase
      .from("fulfillment_attempts")
      .update({ status: "completed", completed_at: now, last_checked_at: now })
      .eq("id", attempt.id);
    await supabase
      .from("orders")
      .update({ status: "completed", completed_at: now })
      .eq("id", order.id);

    // A failed notification must never fail the delivery it reports on.
    await supabase
      .from("notifications")
      .insert({
        user_id: order.user_id,
        notification_type: "order_delivered",
        title_ar: "تم تنفيذ طلبك",
        title_en: "Your order is delivered",
        body_ar: `طلب ${order.order_number} جاهز. افتح الطلب لعرض التفاصيل.`,
        body_en: `Order ${order.order_number} is ready. Open it to see the details.`,
        href: `/orders/${order.id}`,
        entity_type: "order",
        entity_id: order.id,
      })
      .then(() => undefined, () => undefined);

    await settle({ attemptId: attempt.id, error: null });

    return json({ ok: true, applied: true, status: "completed" }, 200);
  }

  await supabase
    .from("fulfillment_attempts")
    .update({ status: "failed", error_message: decision.reason, last_checked_at: now })
    .eq("id", attempt.id);
  await supabase.from("orders").update({ status: "failed" }).eq("id", order.id);

  /*
   * The refund key is the order item, the same key checkout and the sweep use,
   * so whichever of the three gets here first is the only one that moves money.
   */
  const { error: refundError } = await supabase.rpc("refund_failed_order", {
    p_order_id: order.id,
    p_reason: decision.reason,
    p_idempotency_key: attempt.order_item_id,
  });

  if (refundError) {
    /*
     * The worst state the store can be in: charged for nothing. The event is
     * left unprocessed and answered 5xx so the supplier's retry has another go,
     * and the sweep will find the order still unsettled.
     */
    await supabase
      .from("fulfillment_events")
      .update({
        fulfillment_attempt_id: attempt.id,
        processing_error: `Refund failed: ${refundError.message}`,
      })
      .eq("id", eventRowId ?? "");

    return json({ ok: false, error: "refund_failed" }, 500);
  }

  await supabase
    .from("fulfillment_attempts")
    .update({ status: "refunded", error_message: decision.reason })
    .eq("id", attempt.id);

  await supabase
    .from("notifications")
    .insert({
      user_id: order.user_id,
      notification_type: "order_failed",
      title_ar: "تعذّر تنفيذ طلبك وأعدنا المبلغ",
      title_en: "Your order failed and was refunded",
      body_ar: `طلب ${order.order_number}: ${decision.reason} أعدنا المبلغ إلى محفظتك.`,
      body_en: `Order ${order.order_number}: ${decision.reason} The amount is back in your wallet.`,
      href: `/orders/${order.id}`,
      entity_type: "order",
      entity_id: order.id,
    })
    .then(() => undefined, () => undefined);

  await settle({ attemptId: attempt.id, error: null });

  return json({ ok: true, applied: true, status: "refunded" }, 200);
});
