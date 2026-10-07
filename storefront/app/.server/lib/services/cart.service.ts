import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillOrder } from "@server/fulfillment";
import { enqueueTelegramAlert } from "@server/lib/services/telegram-alerts.service";
import { logFailure, logOutcome } from "@server/lib/logging/logger";
import { assertVelocityLimit } from "@server/lib/services/velocity-guard.service";

export interface CartItemModel {
  id: string;
  userId: string;
  offerId: string;
  quantity: number;
  dynamicFields: Record<string, string>;
  createdAt: string;
  offer: {
    id: string;
    slug: string;
    name: string;
    price: number;
    currency: string;
    isActive: boolean;
  };
  product: {
    id: string;
    slug: string;
    name: string;
    imageUrl: string | null;
    categorySlug: string;
    isActive: boolean;
  };
}

export interface CartSummary {
  items: CartItemModel[];
  totalQuantity: number;
  subtotal: number;
  currency: string;
}

export async function getCart(
  supabase: SupabaseClient,
  userId: string,
  locale: "ar" | "en",
): Promise<CartSummary> {
  const { data, error } = await (supabase as any)
    .from("cart_items")
    .select(`
      id,
      user_id,
      offer_id,
      quantity,
      dynamic_fields,
      created_at,
      offers!inner (
        id,
        slug,
        name_ar,
        name_en,
        price,
        currency,
        is_active,
        products!inner (
          id,
          slug,
          name_ar,
          name_en,
          image_url,
          is_active,
          categories!products_category_id_fkey (slug)
        )
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { items: [], totalQuantity: 0, subtotal: 0, currency: "USD" };
  }

  const isAr = locale === "ar";
  let subtotal = 0;
  let totalQuantity = 0;
  let currency = "USD";

  const items: CartItemModel[] = (data as any[]).map((row) => {
    const offer = row.offers;
    const product = offer?.products;
    const cat = product?.categories;
    const catSlug = Array.isArray(cat) ? cat[0]?.slug : cat?.slug ?? "products";

    const itemPrice = typeof offer?.price === "number" ? offer.price : 0;
    const qty = typeof row.quantity === "number" ? row.quantity : 1;
    currency = offer?.currency ?? currency;

    subtotal += itemPrice * qty;
    totalQuantity += qty;

    return {
      id: row.id,
      userId: row.user_id,
      offerId: row.offer_id,
      quantity: qty,
      dynamicFields: row.dynamic_fields ?? {},
      createdAt: row.created_at,
      offer: {
        id: offer.id,
        slug: offer.slug,
        name: isAr ? offer.name_ar : offer.name_en,
        price: itemPrice,
        currency: offer.currency,
        isActive: offer.is_active,
      },
      product: {
        id: product.id,
        slug: product.slug,
        name: isAr ? product.name_ar : product.name_en,
        imageUrl: product.image_url,
        categorySlug: catSlug,
        isActive: product.is_active,
      },
    };
  });

  return {
    items,
    totalQuantity,
    subtotal: Math.round(subtotal * 100) / 100,
    currency,
  };
}

export async function getCartCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("cart_items")
    .select("quantity")
    .eq("user_id", userId);

  if (error || !data) return 0;
  return (data as any[]).reduce((sum, item) => sum + (item.quantity || 1), 0);
}

export async function addToCart(
  supabase: SupabaseClient,
  userId: string,
  input: {
    offerId: string;
    quantity?: number;
    dynamicFields?: Record<string, string>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const qty = Math.max(1, Math.min(10, input.quantity ?? 1));

  const { error } = await (supabase as any).from("cart_items").upsert(
    {
      user_id: userId,
      offer_id: input.offerId,
      quantity: qty,
      dynamic_fields: input.dynamicFields ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,offer_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateCartItemQuantity(
  supabase: SupabaseClient,
  userId: string,
  cartItemId: string,
  quantity: number,
): Promise<{ ok: boolean }> {
  if (quantity <= 0) {
    return removeFromCart(supabase, userId, cartItemId);
  }

  const safeQty = Math.max(1, Math.min(10, quantity));
  const { error } = await (supabase as any)
    .from("cart_items")
    .update({ quantity: safeQty, updated_at: new Date().toISOString() })
    .eq("id", cartItemId)
    .eq("user_id", userId);

  return { ok: !error };
}

export async function removeFromCart(
  supabase: SupabaseClient,
  userId: string,
  cartItemId: string,
): Promise<{ ok: boolean }> {
  const { error } = await (supabase as any)
    .from("cart_items")
    .delete()
    .eq("id", cartItemId)
    .eq("user_id", userId);

  return { ok: !error };
}

export async function clearCart(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean }> {
  const { error } = await (supabase as any)
    .from("cart_items")
    .delete()
    .eq("user_id", userId);

  return { ok: !error };
}

export type CheckoutCartResult =
  | {
      ok: true;
      orders: Array<{
        orderId: string;
        orderNumber: string;
        total: number;
        balance: number;
      }>;
      totalCharged: number;
      remainingBalance: number;
    }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "suspended"
        | "cart_empty"
        | "insufficient_balance"
        | "offer_unavailable"
        | "too_many"
        | "unknown";
    };

export async function checkoutCart(input: {
  userId: string;
  sessionSupabase: SupabaseClient;
  idempotencyKey: string;
  couponCode?: string | null;
  schedule: (promise: Promise<unknown>) => void;
}): Promise<CheckoutCartResult> {
  const supabase = input.sessionSupabase;

  // Velocity guard
  const velocity = await assertVelocityLimit(supabase, input.userId, "order");
  if (!velocity.allowed) {
    return { ok: false, reason: "too_many" };
  }

  // Fetch current cart items to pass to RPC
  const { data: cartRows, error: cartError } = await (supabase as any)
    .from("cart_items")
    .select("offer_id, quantity, dynamic_fields")
    .eq("user_id", input.userId);

  if (cartError || !cartRows || cartRows.length === 0) {
    return { ok: false, reason: "cart_empty" };
  }

  const itemsPayload = cartRows.map((r: any) => ({
    offer_id: r.offer_id,
    quantity: r.quantity,
    dynamic_fields: r.dynamic_fields || {},
  }));

  const { data, error } = await supabase.rpc("place_cart_order", {
    p_items: itemsPayload,
    p_idempotency_key: input.idempotencyKey,
    p_coupon_code: input.couponCode?.trim() || null,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("insufficient")) return { ok: false, reason: "insufficient_balance" };
    if (msg.includes("suspended")) return { ok: false, reason: "suspended" };
    if (msg.includes("authentication")) return { ok: false, reason: "unauthenticated" };
    if (msg.includes("unavailable")) return { ok: false, reason: "offer_unavailable" };
    if (msg.includes("empty")) return { ok: false, reason: "cart_empty" };
    return { ok: false, reason: "unknown" };
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return { ok: false, reason: "unknown" };
  }

  const createdOrders = (data as any[]).map((row) => ({
    orderId: row.order_id as string,
    orderNumber: row.order_number as string,
    total: Number(row.total),
    balance: Number(row.balance),
  }));

  const totalCharged = createdOrders.reduce((sum, o) => sum + o.total, 0);
  const remainingBalance = createdOrders[0]?.balance ?? 0;

  // Schedule background fulfillment and Telegram alerts for each order
  for (const ord of createdOrders) {
    input.schedule(
      (async () => {
        try {
          await enqueueTelegramAlert({
            type: "order_placed",
            payload: {
              order_id: ord.orderId,
              order_number: ord.orderNumber,
              total: ord.total,
            },
          });
        } catch (err) {
          logFailure("notifications", "cart_order_alert_failed", err, { orderId: ord.orderId });
        }
      })(),
    );

    input.schedule(
      fulfillOrder(ord.orderId).catch((err) => {
        logFailure("fulfilment", "cart_order_fulfilment_failed", err, { orderId: ord.orderId });
      }),
    );
  }

  logOutcome("checkout", "cart_checkout_completed", { ok: true }, {
    userId: input.userId,
    orderCount: createdOrders.length,
    totalCharged,
  });

  return {
    ok: true,
    orders: createdOrders,
    totalCharged: Math.round(totalCharged * 100) / 100,
    remainingBalance,
  };
}
