import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { isCallbackReachable } from "@/lib/settings/callback-url";
import { readMaxStoreCredentials } from "@/lib/settings/maxstore-settings";
import { readG2BulkCredentials, readG2BulkWebhookSecret } from "@/lib/settings/provider-settings";
import { readBatStoreCredentials } from "@/lib/settings/batstore-settings";
import { g2bulkCallbackUrl } from "@/lib/supabase/functions-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Everything the worker needs about one order, in a single read.
 *
 * The provider identifiers live on the mapping rows, not on the offer, because a
 * product can be sold through more than one supplier.
 */
export type FulfillmentContext = {
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
  /** The order's own status; `paid` means money taken and nothing attempted yet. */
  status: string | null;
  /**
   * `gift` orders are paid-on-arrival admin purchases with no wallet behind
   * them. A fulfilment failure must not try to refund one, because there is no
   * wallet transaction to reverse.
   */
  paymentMethod: string | null;
  /**
   * Which supplier this offer is mapped to.
   *
   * Read from the mapping rather than assumed, now that more than one supplier
   * can own an offer. Null means the offer is not mapped at all — a hand-made
   * package, which nothing can deliver automatically.
   */
  providerName: string | null;
  /**
   * `direct` goods need nothing from the buyer — stock delivered as codes,
   * accounts or activation links. `account` goods land on an identifier the
   * buyer supplied at checkout.
   */
  deliveryKind: "account" | "direct" | "manual" | "stored";
};

export async function loadContext(orderId: string): Promise<FulfillmentContext | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, payment_method, order_items (id, offer_id, quantity, dynamic_fields, metadata)",
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
  let deliveryKind: "account" | "direct" | "manual" | "stored" = "account";

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
      .select("product_id, delivery_kind")
      .eq("id", item.offer_id)
      .maybeSingle();

    deliveryKind =
      offer?.delivery_kind === "direct" ||
      offer?.delivery_kind === "manual" ||
      offer?.delivery_kind === "stored"
        ? offer.delivery_kind
        : "account";

    if (offer?.product_id) {
      const { data: gameMapping } = await supabase
        .from("provider_game_mappings")
        .select("external_game_code")
        .eq("provider_name", G2BULK_PROVIDER_NAME)
        .eq("game_id", offer.product_id)
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
    paymentMethod: data.payment_method,
    providerName,
    deliveryKind,
    status: data.status,
  };
}

/** The stored supplier key, or null when the provider is off or unconfigured. */
export async function readCredentials(): Promise<string | null> {
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
export async function readMaxStoreToken(): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const { apiToken, enabled } = readMaxStoreCredentials(data?.providers ?? {});

  return apiToken && enabled ? apiToken : null;
}

/** The stored BatStore key, or null when that provider is off or unconfigured. */
export async function readBatStoreToken(): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const { apiToken, enabled } = readBatStoreCredentials(data?.providers ?? {});

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
export async function readCallbackUrl(): Promise<string | null> {
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
export function providerIdempotencyKey(orderItemId: string): string {
  return orderItemId;
}
