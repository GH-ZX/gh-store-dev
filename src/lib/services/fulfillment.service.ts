import "server-only";

import { G2BulkError } from "@/providers/g2bulk/errors";
import { G2BulkFulfillmentClient } from "@/providers/g2bulk/client";
import { classifyProviderStatus } from "@/providers/g2bulk/fulfillment-schemas";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { readG2BulkCredentials } from "@/lib/settings/provider-settings";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (error instanceof G2BulkError) {
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

  if (item.offer_id) {
    const { data: offerMapping } = await supabase
      .from("provider_offer_mappings")
      .select("external_catalogue_name, external_product_id, offer_id")
      .eq("provider_name", G2BULK_PROVIDER_NAME)
      .eq("offer_id", item.offer_id)
      .maybeSingle();

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
): Promise<OpenAttempt | null> {
  const supabase = createSupabaseServiceClient();
  const key = providerIdempotencyKey(context.orderItemId);

  const { data: existing } = await supabase
    .from("fulfillment_attempts")
    .select("id, external_order_id, status")
    .eq("provider", G2BULK_PROVIDER_NAME)
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
      provider: G2BULK_PROVIDER_NAME,
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
    // The order stays `failed` with the money still debited; reconciliation is
    // an operator's job, and leaving it visible is better than hiding it.
    return { state: "failed", reason, refunded: false };
  }

  await recordAttempt(attemptId, { status: "refunded", errorMessage: reason, errorCode: code });

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
  } catch {
    return null;
  }
}

async function fulfillTopup(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
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

  const supabase = createSupabaseServiceClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const { apiKey, enabled } = readG2BulkCredentials(settings?.providers ?? {});

  if (!apiKey || !enabled) {
    return { state: "skipped", reason: "The G2Bulk provider is not configured." };
  }

  const client = new G2BulkFulfillmentClient({ apiKey });

  return context.offerType === "topup" ? fulfillTopup(client, context) : fulfillVoucher(client, context);
}
