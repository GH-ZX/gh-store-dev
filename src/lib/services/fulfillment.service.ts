import "server-only";

import { G2BulkError } from "@/providers/g2bulk/errors";
import { G2BulkFulfillmentClient } from "@/providers/g2bulk/client";
import { classifyProviderStatus } from "@/providers/g2bulk/fulfillment-schemas";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { notify } from "@/lib/services/notification.service";
import {
  decideReconciliation,
  GRACE_MINUTES,
  minutesSince,
  type ProviderState,
} from "@/lib/orders/reconciliation-policy";
import { isCallbackReachable } from "@/lib/settings/callback-url";
import { readMaxStoreCredentials } from "@/lib/settings/maxstore-settings";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { MaxStoreError } from "@/providers/maxstore/errors";
import { MAXSTORE_PROVIDER_NAME } from "@/providers/maxstore/mapping";
import { classifyOrderStatus as classifyMaxStoreOrder } from "@/providers/maxstore/schemas";
import { readG2BulkCredentials, readG2BulkWebhookSecret } from "@/lib/settings/provider-settings";
import { g2bulkCallbackUrl } from "@/lib/supabase/functions-url";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import type { Json } from "@/types/database";
import { log, logFailure } from "@/lib/logging/logger";

/**
 * Fulfilment.
 *
 * Runs with service authority, never under the customer's session. Advancing a
 * fulfilment and refunding a failure are the worker's decisions; if a shopper's
 * session could make them, a shopper could claim a refund on an order the
 * supplier actually delivered.
 *
 * The rules that keep money and goods in agreement:
 *
 *   * The supplier cost is re-read immediately before buying. Provider prices
 *     move with exchange rates, and the cost recorded at import time is a stale
 *     snapshot.
 *   * A purchase carries a 36-character idempotency key derived from the order
 *     item, so a retry within the provider's 30-minute window returns the
 *     original result instead of buying twice.
 *   * `pending` is not failure. An order that is still processing stays
 *     `fulfilling` and is never refunded, because refunding something the
 *     supplier later delivers loses the money outright.
 *   * A terminal failure refunds exactly once, through a service-role RPC that
 *     is itself idempotent.
 *   * The customer price is never sent to the provider.
 */

const POLL_ATTEMPTS = 4;
const POLL_DELAY_MS = 2_500;

export type FulfillmentOutcome =
  | { state: "completed"; deliveredItems: string[] }
  | { state: "processing" }
  | { state: "failed"; reason: string; refunded: boolean }
  | { state: "skipped"; reason: string };

/** What a reconciliation pass did to one order. */
export type ReconcileOutcome = {
  action: "completed" | "refunded" | "escalated" | "wait" | "skipped";
  reason?: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The stored supplier key, or null when the provider is off or unconfigured. */
async function readCredentials(): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const { apiKey, enabled } = readG2BulkCredentials(data?.providers ?? {});

  return apiKey && enabled ? apiKey : null;
}

/** The stored MaxStore token, or null when that provider is off or unconfigured. */
async function readMaxStoreToken(): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const { apiToken, enabled } = readMaxStoreCredentials(data?.providers ?? {});

  return apiToken && enabled ? apiToken : null;
}

/**
 * The address G2Bulk should report this order to, if there is a usable one.
 *
 * Null is a normal answer, not a fault: with no callback secret generated the
 * supplier is simply not asked to call back, and the reconciliation sweep
 * remains the only way an order settles — which is exactly where this stood
 * before the callback existed.
 *
 * An address the supplier could not reach is worse than none, because it looks
 * configured. A Supabase URL is public HTTPS by construction, so this only ever
 * rejects a local stack.
 */
async function readCallbackUrl(): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const secret = readG2BulkWebhookSecret(data?.providers ?? {});
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!secret || !supabaseUrl) {
    return null;
  }

  const url = g2bulkCallbackUrl(supabaseUrl, secret);

  return isCallbackReachable(url) ? url : null;
}

/** Provider keys must be exactly 36 characters, so a UUID is used verbatim. */
function providerIdempotencyKey(orderItemId: string): string {
  return orderItemId;
}

/**
 * Split a failure into what the customer reads and what an operator needs.
 *
 * The provider's own wording ("Invalid player ID. Please check and try again.")
 * is genuinely useful to a shopper, but our internal classification is not — a
 * refund note reading "request: Invalid player ID" leaks jargon onto the
 * customer's order page. The kind is kept alongside in `error_code`, where an
 * operator can still see it.
 */
function describe(error: unknown): { customer: string; code: string | null } {
  if (error instanceof G2BulkError || error instanceof MaxStoreError) {
    const provider = error.message.trim();
    // Only a rejected request or a rejected key carries a message meant for a
    // person; a network or contract fault is machine detail.
    const usable = error.kind === "request" || error.kind === "auth" ? provider : "";

    return {
      customer: usable || "The supplier could not complete this order.",
      code: error.kind,
    };
  }

  return {
    customer: "The supplier could not complete this order.",
    code: error instanceof Error ? error.name : null,
  };
}

type FulfillmentContext = {
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  offerId: string | null;
  offerType: string;
  quantity: number;
  dynamicFields: Record<string, string>;
  gameCode: string | null;
  catalogueName: string | null;
  externalProductId: string | null;
  /**
   * Which supplier this offer is mapped to.
   *
   * Read from the mapping rather than assumed, now that more than one supplier
   * can own an offer. Null means the offer is not mapped at all — a hand-made
   * package, which nothing can deliver automatically.
   */
  providerName: string | null;
};

/**
 * Everything the worker needs about one order, in a single read.
 *
 * The provider identifiers live on the mapping rows, not on the offer, because a
 * product can be sold through more than one supplier.
 */
async function loadContext(orderId: string): Promise<FulfillmentContext | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, order_items (id, offer_id, quantity, dynamic_fields, metadata)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const item = Array.isArray(data.order_items) ? data.order_items[0] : data.order_items;

  if (!item) {
    return null;
  }

  const fields =
    item.dynamic_fields && typeof item.dynamic_fields === "object" && !Array.isArray(item.dynamic_fields)
      ? (item.dynamic_fields as Record<string, string>)
      : {};

  const metadata =
    item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? (item.metadata as { offer_type?: unknown })
      : {};

  let gameCode: string | null = null;
  let catalogueName: string | null = null;
  let externalProductId: string | null = null;
  let providerName: string | null = null;

  if (item.offer_id) {
    /*
     * Not filtered by supplier any more. An offer belongs to whichever provider
     * imported it, and asking G2Bulk about a MaxStore product would find nothing
     * and read as "not mapped" — which is a refund, not a delivery.
     */
    const { data: offerMapping } = await supabase
      .from("provider_offer_mappings")
      .select("provider_name, external_catalogue_name, external_product_id, offer_id")
      .eq("offer_id", item.offer_id)
      .maybeSingle();

    providerName = offerMapping?.provider_name ?? null;
    catalogueName = offerMapping?.external_catalogue_name ?? null;
    externalProductId = offerMapping?.external_product_id ?? null;

    const { data: offer } = await supabase
      .from("offers")
      .select("game_id")
      .eq("id", item.offer_id)
      .maybeSingle();

    if (offer?.game_id) {
      const { data: gameMapping } = await supabase
        .from("provider_game_mappings")
        .select("external_game_code")
        .eq("provider_name", G2BULK_PROVIDER_NAME)
        .eq("game_id", offer.game_id)
        .maybeSingle();

      gameCode = gameMapping?.external_game_code ?? null;
    }
  }

  return {
    orderId: data.id,
    orderNumber: data.order_number,
    orderItemId: item.id,
    offerId: item.offer_id,
    offerType: typeof metadata.offer_type === "string" ? metadata.offer_type : "topup",
    quantity: item.quantity,
    dynamicFields: fields,
    gameCode,
    catalogueName,
    externalProductId,
    providerName,
  };
}

async function setOrderStatus(orderId: string, status: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("orders")
    .update({
      status,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", orderId);
}

/**
 * The attempt row is the worker's memory.
 *
 * `(provider, idempotency_key)` is unique, so re-running fulfilment for the same
 * item reuses the existing attempt instead of starting a second purchase.
 */
type OpenAttempt = { id: string; externalOrderId: string | null; status: string };

async function openAttempt(
  context: FulfillmentContext,
  requestPayload: Record<string, Json>,
  provider: string = G2BULK_PROVIDER_NAME,
): Promise<OpenAttempt | null> {
  const supabase = createSupabaseServiceClient();
  const key = providerIdempotencyKey(context.orderItemId);

  const { data: existing } = await supabase
    .from("fulfillment_attempts")
    .select("id, external_order_id, status")
    .eq("provider", provider)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      externalOrderId: existing.external_order_id,
      status: existing.status,
    };
  }

  const { data, error } = await supabase
    .from("fulfillment_attempts")
    .insert({
      order_item_id: context.orderItemId,
      provider,
      status: "pending",
      idempotency_key: key,
      request_payload: requestPayload,
    })
    .select("id, external_order_id, status")
    .single();

  if (error) {
    return null;
  }

  return { id: data.id, externalOrderId: data.external_order_id, status: data.status };
}

async function recordAttempt(
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

/**
 * Settle a terminal failure: mark the order failed, then refund.
 *
 * The refund RPC is idempotent, so a repeated settlement returns the same result
 * rather than crediting twice.
 */
async function failAndRefund(
  context: FulfillmentContext,
  attemptId: string,
  reason: string,
  code: string | null = null,
): Promise<FulfillmentOutcome> {
  const supabase = createSupabaseServiceClient();

  await recordAttempt(attemptId, { status: "failed", errorMessage: reason, errorCode: code });
  await setOrderStatus(context.orderId, "failed");

  const { error } = await supabase.rpc("refund_failed_order", {
    p_order_id: context.orderId,
    p_reason: reason,
    // Distinct from the purchase key, and stable, so a retry refunds once.
    p_idempotency_key: context.orderItemId,
  });

  if (error) {
    /*
     * The order stays `failed` with the money still debited. This is the single
     * worst state the store can be in — a customer charged for nothing — so it
     * is logged at error level even though the function returns normally.
     */
    logFailure("fulfilment", "refund_failed", error, {
      orderId: context.orderId,
      orderNumber: context.orderNumber,
      reason,
    });

    return { state: "failed", reason, refunded: false };
  }

  await recordAttempt(attemptId, { status: "refunded", errorMessage: reason, errorCode: code });

  log.info("fulfilment", "order_refunded", {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    reason,
  });

  return { state: "failed", reason, refunded: true };
}

/** Live supplier cost, re-read immediately before buying. */
async function currentSupplierCost(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
): Promise<number | null> {
  if (!context.gameCode || !context.catalogueName) {
    return null;
  }

  try {
    const catalogue = await client.getGameCatalogue(context.gameCode);
    const item = catalogue.catalogues.find((entry) => entry.name === context.catalogueName);

    return item?.amount ?? null;
  } catch (error) {
    // Returning null makes the order fail and refund, so the reason matters.
    logFailure("fulfilment", "supplier_cost_unreadable", error, {
      orderId: context.orderId,
      game: context.gameCode,
    });
    return null;
  }
}

async function fulfillTopup(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
  callbackUrl: string | null,
): Promise<FulfillmentOutcome> {
  if (!context.gameCode || !context.catalogueName) {
    return { state: "skipped", reason: "This offer is not mapped to a provider product." };
  }

  const playerId =
    context.dynamicFields.userid ??
    context.dynamicFields.user_id ??
    context.dynamicFields.playerid ??
    context.dynamicFields.player_id ??
    "";
  const serverId = context.dynamicFields.serverid ?? context.dynamicFields.server_id ?? undefined;
  const charname = context.dynamicFields.charname ?? undefined;

  if (!playerId) {
    return { state: "skipped", reason: "The order carries no player id." };
  }

  const requestPayload: Record<string, Json> = {
    game: context.gameCode,
    catalogue_name: context.catalogueName,
    player_id: playerId,
    ...(serverId ? { server_id: serverId } : {}),
    ...(charname ? { charname } : {}),
  };

  const attempt = await openAttempt(context, requestPayload);

  if (!attempt) {
    return { state: "skipped", reason: "Could not open a fulfilment attempt." };
  }

  // Already settled by an earlier run.
  if (attempt.status === "completed") {
    return { state: "completed", deliveredItems: [] };
  }

  if (attempt.status === "refunded") {
    return { state: "failed", reason: "Previously refunded.", refunded: true };
  }

  await setOrderStatus(context.orderId, "fulfilling");

  // Validate the player before spending anything: a wrong id is the most common
  // reason a top-up fails, and it is cheaper to catch here.
  try {
    const check = await client.checkPlayer({
      game: context.gameCode,
      userId: playerId,
      serverId,
      charname,
    });

    if (!check.valid) {
      return failAndRefund(context, attempt.id, "The game rejected these account details.");
    }
  } catch (error) {
    // A validation outage is not proof the player is wrong, so this does not
    // fail the order on its own — the order attempt below is the real test.
    const detail = describe(error);
    await recordAttempt(attempt.id, {
      status: "processing",
      errorMessage: detail.customer,
      errorCode: detail.code,
    });
  }

  const cost = await currentSupplierCost(client, context);

  if (cost === null) {
    return failAndRefund(context, attempt.id, "The supplier no longer lists this package.");
  }

  let externalOrderId = attempt.externalOrderId;

  if (!externalOrderId) {
    try {
      const placed = await client.placeGameOrder(
        context.gameCode,
        {
          ...requestPayload,
          catalogue_name: context.catalogueName,
          player_id: playerId,
          // The store's own order number, so a supplier-side query can be traced
          // back. Never the customer's price.
          remark: context.orderNumber,
          /*
           * Where to report the outcome. Polling below still runs — the supplier
           * often finishes inside checkout's own window, and an order that
           * settles in front of the customer should not wait for a round trip
           * back through the callback.
           */
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        },
        providerIdempotencyKey(context.orderItemId),
      );

      externalOrderId = String(placed.order.order_id);
      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId,
        response: placed,
      });

      if (classifyProviderStatus(placed.order.status) === "completed") {
        await recordAttempt(attempt.id, { status: "completed", externalOrderId });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }
    } catch (error) {
      const detail = describe(error);

      return failAndRefund(context, attempt.id, detail.customer, detail.code);
    }
  }

  // Poll a bounded number of times. Staying `processing` is a correct answer:
  // the supplier may finish minutes later, and refunding now would give away the
  // goods for free.
  for (let round = 0; round < POLL_ATTEMPTS; round += 1) {
    await delay(POLL_DELAY_MS);

    try {
      const status = await client.findGameOrderStatus(externalOrderId);

      if (!status) {
        continue;
      }

      const state = classifyProviderStatus(status.status);

      if (state === "completed" && !status.refunded) {
        await recordAttempt(attempt.id, { status: "completed", response: status });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }

      if (state === "failed" || status.refunded) {
        return failAndRefund(context, attempt.id, "The supplier could not complete this order.");
      }
    } catch (error) {
      const detail = describe(error);
      await recordAttempt(attempt.id, {
        status: "processing",
        errorMessage: detail.customer,
        errorCode: detail.code,
      });
    }
  }

  await recordAttempt(attempt.id, { status: "processing" });

  return { state: "processing" };
}

async function fulfillVoucher(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
): Promise<FulfillmentOutcome> {
  if (!context.externalProductId) {
    return { state: "skipped", reason: "This card is not mapped to a provider product." };
  }

  const attempt = await openAttempt(context, {
    product_id: context.externalProductId,
    quantity: context.quantity,
  });

  if (!attempt) {
    return { state: "skipped", reason: "Could not open a fulfilment attempt." };
  }

  if (attempt.status === "completed") {
    return { state: "completed", deliveredItems: [] };
  }

  if (attempt.status === "refunded") {
    return { state: "failed", reason: "Previously refunded.", refunded: true };
  }

  await setOrderStatus(context.orderId, "fulfilling");

  let externalOrderId = attempt.externalOrderId;

  if (!externalOrderId) {
    try {
      const purchase = await client.purchaseVoucher(
        context.externalProductId,
        context.quantity,
        providerIdempotencyKey(context.orderItemId),
      );

      externalOrderId = String(purchase.order_id);
      const items = purchase.delivery_items ?? [];

      if (items.length > 0) {
        // Codes must be persisted the moment they arrive: the provider keeps them
        // for 30 days, and this is the only copy the customer will ever get.
        await recordAttempt(attempt.id, {
          status: "completed",
          externalOrderId,
          response: purchase,
          delivered: { items },
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: items };
      }

      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId,
        response: purchase,
      });
    } catch (error) {
      const detail = describe(error);

      return failAndRefund(context, attempt.id, detail.customer, detail.code);
    }
  }

  for (let round = 0; round < POLL_ATTEMPTS; round += 1) {
    await delay(POLL_DELAY_MS);

    try {
      const result = await client.pollVoucherDelivery(externalOrderId);

      if (result.state === "delivered") {
        await recordAttempt(attempt.id, {
          status: "completed",
          delivered: { items: result.items },
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: result.items };
      }

      if (result.state === "failed") {
        // A 410 means the provider already refunded its side; ours still has to
        // return the customer's money.
        return failAndRefund(context, attempt.id, "The supplier could not deliver this card.");
      }
    } catch (error) {
      const detail = describe(error);
      await recordAttempt(attempt.id, {
        status: "processing",
        errorMessage: detail.customer,
        errorCode: detail.code,
      });
    }
  }

  return { state: "processing" };
}


/**
 * Buy through MaxStore.
 *
 * The supplier holds the idempotency rather than the store: `order_uuid` is the
 * order item's id, so a retry — from a checkout that timed out, an operator, or
 * the sweep — returns the original order instead of buying a second time. That
 * is why the key must never be freshly generated per attempt.
 *
 * There is no callback to wait for. MaxStore documents no webhook at all, so
 * polling `/check` is not a fallback here the way it is for G2Bulk; it is the
 * only mechanism, and an order left `processing` genuinely waits for the sweep.
 */
async function fulfillMaxStore(
  context: FulfillmentContext,
  apiToken: string,
): Promise<FulfillmentOutcome> {
  if (!context.externalProductId) {
    return { state: "skipped", reason: "This offer is not mapped to a provider product." };
  }

  const client = new MaxStoreClient({ apiToken });
  const orderUuid = providerIdempotencyKey(context.orderItemId);
  const attempt = await openAttempt(
    context,
    { product_id: context.externalProductId, qty: context.quantity },
    MAXSTORE_PROVIDER_NAME,
  );

  if (!attempt) {
    return { state: "skipped", reason: "Could not open a fulfilment attempt." };
  }

  if (attempt.status === "completed") {
    return { state: "completed", deliveredItems: [] };
  }

  if (attempt.status === "refunded") {
    return { state: "failed", reason: "Previously refunded.", refunded: true };
  }

  await setOrderStatus(context.orderId, "fulfilling");

  if (!attempt.externalOrderId) {
    try {
      const placed = await client.placeOrder({
        productId: context.externalProductId,
        quantity: context.quantity,
        orderUuid,
        // Whatever the customer filled in for this product. MaxStore refuses an
        // order with a field missing (code 106), which is the right failure:
        // better a refund than a delivery to the wrong account.
        params: context.dynamicFields,
      });

      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId: placed.orderId,
        response: placed,
      });

      const state = classifyMaxStoreOrder(placed.status);

      if (state === "completed") {
        await recordAttempt(attempt.id, { status: "completed" });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }

      if (state === "failed") {
        return failAndRefund(context, attempt.id, "The supplier rejected this order.");
      }
    } catch (error) {
      const detail = describe(error);

      return failAndRefund(context, attempt.id, detail.customer, detail.code);
    }
  }

  for (let round = 0; round < POLL_ATTEMPTS; round += 1) {
    await delay(POLL_DELAY_MS);

    try {
      const [result] = await client.checkOrders([orderUuid]);

      if (!result) {
        continue;
      }

      const state = classifyMaxStoreOrder(result.status);

      if (state === "completed") {
        await recordAttempt(attempt.id, {
          status: "completed",
          response: result,
          // Whatever the supplier hands over — codes, an account, a note. Stored
          // the moment it arrives, because this may be the only copy.
          delivered: result.delivery ? { items: result.delivery } : undefined,
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }

      if (state === "failed") {
        return failAndRefund(context, attempt.id, "The supplier could not complete this order.");
      }
    } catch (error) {
      const detail = describe(error);
      await recordAttempt(attempt.id, {
        status: "processing",
        errorMessage: detail.customer,
        errorCode: detail.code,
      });
    }
  }

  await recordAttempt(attempt.id, { status: "processing" });

  return { state: "processing" };
}

/**
 * Fulfil a paid order.
 *
 * Safe to call more than once: the attempt row and the provider's own
 * idempotency window both make a repeat a no-op rather than a second purchase.
 */
export async function fulfillOrder(orderId: string): Promise<FulfillmentOutcome> {
  if (!hasServiceRoleKey()) {
    return {
      state: "skipped",
      reason: "SUPABASE_SERVICE_ROLE_KEY is not configured, so fulfilment cannot run.",
    };
  }

  const context = await loadContext(orderId);

  if (!context) {
    return { state: "skipped", reason: "Order not found." };
  }

  if (context.providerName === MAXSTORE_PROVIDER_NAME) {
    const apiToken = await readMaxStoreToken();

    if (!apiToken) {
      return { state: "skipped", reason: "The MaxStore provider is not configured." };
    }

    const outcome = await fulfillMaxStore(context, apiToken);

    await announceOutcome(context, outcome);

    return outcome;
  }

  const apiKey = await readCredentials();

  if (!apiKey) {
    return { state: "skipped", reason: "The G2Bulk provider is not configured." };
  }

  const client = new G2BulkFulfillmentClient({ apiKey });
  const outcome =
    context.offerType === "topup"
      ? // Only top-ups have a callback: the supplier documents one for game
        // orders and not for card purchases, which deliver their codes inline.
        await fulfillTopup(client, context, await readCallbackUrl())
      : await fulfillVoucher(client, context);

  await announceOutcome(context, outcome);

  return outcome;
}

/**
 * Settle an order the supplier never finished in front of the customer.
 *
 * Checkout gives the supplier about ten seconds and then leaves the order at
 * `fulfilling`; this is what eventually goes back and asks how it turned out.
 *
 * It never buys. The purchase path is reached only from checkout and from an
 * operator's explicit retry, both of which a person is waiting on. A background
 * sweep that could place an order would be one bug away from buying a second
 * time for every order it looked at, so it is not given the option: when there
 * is no supplier order to poll, the answer is a question for a human rather
 * than a purchase or a refund.
 */
export async function reconcileOrder(orderId: string, now = Date.now()): Promise<ReconcileOutcome> {
  if (!hasServiceRoleKey()) {
    return { action: "skipped", reason: "Service role key is not configured." };
  }

  const context = await loadContext(orderId);

  if (!context) {
    return { action: "skipped", reason: "Order not found." };
  }

  const supabase = createSupabaseServiceClient();
  const provider = context.providerName ?? G2BULK_PROVIDER_NAME;
  const { data: attempt } = await supabase
    .from("fulfillment_attempts")
    .select("id, status, external_order_id, created_at")
    .eq("provider", provider)
    .eq("idempotency_key", providerIdempotencyKey(context.orderItemId))
    .maybeSingle();

  if (!attempt) {
    // Nothing was ever attempted, so nothing was bought and nothing is owed to
    // the supplier — but the customer has paid, so this needs a person.
    return { action: "escalated", reason: "No fulfilment was ever attempted for this order." };
  }

  if (attempt.status === "completed" || attempt.status === "refunded") {
    return { action: "skipped", reason: "Already settled." };
  }

  const ageMinutes = minutesSince(attempt.created_at, now);

  /*
   * Ask the supplier first, but only when there is something to ask about. The
   * policy needs the answer to decide, and a missing supplier id short-circuits
   * to escalation without spending a request.
   */
  let providerState: ProviderState = null;
  let refunded = false;

  if (attempt.external_order_id && ageMinutes >= GRACE_MINUTES) {
    /*
     * Ask whichever supplier actually holds this order. For MaxStore this poll
     * is not a backstop but the only way an order ever settles — it publishes no
     * callback — so a sweep that asked the wrong provider would strand every one
     * of its orders at `fulfilling` for ever.
     */
    const credentials =
      provider === MAXSTORE_PROVIDER_NAME ? await readMaxStoreToken() : await readCredentials();

    if (!credentials) {
      return { action: "skipped", reason: "That supplier is not configured." };
    }

    try {
      if (provider === MAXSTORE_PROVIDER_NAME) {
        // Keyed by our own uuid, which is what MaxStore knows the order as.
        const [result] = await new MaxStoreClient({ apiToken: credentials }).checkOrders([
          providerIdempotencyKey(context.orderItemId),
        ]);
        // MaxStore's own words map straight onto the policy's: `wait` is
        // pending, and pending never settles an order either way.
        providerState = result ? classifyMaxStoreOrder(result.status) : null;
      } else {
        const status = await new G2BulkFulfillmentClient({
          apiKey: credentials,
        }).findGameOrderStatus(attempt.external_order_id);

        providerState = status ? classifyProviderStatus(status.status) : null;
        refunded = status?.refunded === true;
      }
    } catch (error) {
      // An unreachable supplier is not an answer about the order. Record why the
      // check failed and leave the order where it is.
      const detail = describe(error);
      await recordAttempt(attempt.id, {
        status: attempt.status === "pending" ? "pending" : "processing",
        errorMessage: detail.customer,
        errorCode: detail.code,
      });

      return { action: "wait", reason: detail.customer };
    }
  }

  const decision = decideReconciliation({
    providerState,
    refunded,
    hasExternalOrderId: Boolean(attempt.external_order_id),
    ageMinutes,
  });

  if (decision.action === "wait") {
    return { action: "wait" };
  }

  if (decision.action === "complete") {
    await recordAttempt(attempt.id, { status: "completed" });
    await setOrderStatus(context.orderId, "completed");
    await announceOutcome(context, { state: "completed", deliveredItems: [] });

    return { action: "completed" };
  }

  if (decision.action === "fail") {
    const outcome = await failAndRefund(context, attempt.id, decision.reason);
    await announceOutcome(context, outcome);

    return { action: "refunded", reason: decision.reason };
  }

  /*
   * `reconcile` is the state the schema has always declared and nothing has ever
   * written: the supplier's answer does not settle this, and guessing either way
   * risks giving away goods or taking money for nothing. The order stays as it
   * is, and the dashboard already renders this state as needing attention.
   */
  await recordAttempt(attempt.id, { status: "reconcile", errorMessage: decision.reason });

  // Warn, not info: this one needs a person, and nobody is watching the order.
  log.warn("fulfilment", "order_escalated", {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    reason: decision.reason,
    ageMinutes: Math.round(ageMinutes),
    hasExternalOrderId: Boolean(attempt.external_order_id),
  });

  return { action: "escalated", reason: decision.reason };
}

/**
 * Tell the customer how it went.
 *
 * At this boundary rather than inside each branch, so every caller — a checkout
 * and an operator's retry alike — produces exactly one message per outcome. It
 * only speaks for terminal states: a `pending` order has nothing to report yet,
 * and `skipped` is a configuration problem for the owner, not news for a customer.
 *
 * `notify` cannot throw, so a notification failure leaves the delivery alone.
 */
async function announceOutcome(
  context: FulfillmentContext,
  outcome: FulfillmentOutcome,
): Promise<void> {
  if (outcome.state !== "completed" && outcome.state !== "failed") {
    return;
  }

  const supabase = createSupabaseServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("user_id")
    .eq("id", context.orderId)
    .maybeSingle();

  if (!order) {
    return;
  }

  // Stored without a locale prefix; the page that renders it adds the reader's.
  const href = `/orders/${context.orderId}`;

  if (outcome.state === "completed") {
    await notify({
      userId: order.user_id,
      type: "order_delivered",
      titleAr: "تم تنفيذ طلبك",
      titleEn: "Your order is delivered",
      bodyAr: `طلب ${context.orderNumber} جاهز. افتح الطلب لعرض التفاصيل.`,
      bodyEn: `Order ${context.orderNumber} is ready. Open it to see the details.`,
      href,
      entityType: "order",
      entityId: context.orderId,
    });

    return;
  }

  /*
   * The refund is the part the customer cares about, so it leads. `outcome.reason`
   * is already the provider's customer-facing wording — the jargon went to
   * `error_code` — so it is safe to repeat here.
   */
  await notify({
    userId: order.user_id,
    type: "order_failed",
    titleAr: outcome.refunded ? "تعذّر تنفيذ طلبك وأعدنا المبلغ" : "تعذّر تنفيذ طلبك",
    titleEn: outcome.refunded ? "Your order failed and was refunded" : "Your order failed",
    bodyAr: outcome.refunded
      ? `طلب ${context.orderNumber}: ${outcome.reason} أعدنا المبلغ إلى محفظتك.`
      : `طلب ${context.orderNumber}: ${outcome.reason} تواصل معنا وسنعالج الأمر.`,
    bodyEn: outcome.refunded
      ? `Order ${context.orderNumber}: ${outcome.reason} The amount is back in your wallet.`
      : `Order ${context.orderNumber}: ${outcome.reason} Contact us and we will sort it out.`,
    href,
    entityType: "order",
    entityId: context.orderId,
  });
}
