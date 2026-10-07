import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminId, requireUserId } from "@server/lib/auth/guards";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { recordAudit } from "@server/lib/services/admin-audit.service";

/**
 * Coupons.
 *
 * The rule this module exists to keep: **the browser's number is never what is
 * charged.** It sends a code and nothing else. Everything that decides what the
 * code is worth happens inside `place_wallet_order` / `place_gift_order`, under
 * a row lock on the coupon, against the live offer price.
 *
 * What lives here is therefore two different things wearing one name:
 *
 *  - `evaluateCoupon` — a pure port of the database's validation, used to show
 *    a preview on the checkout page and to give the admin form an honest
 *    warning before it saves a coupon that would sell below cost. It is
 *    deliberately a *port*: the same inputs must produce the same answer as
 *    `validate_coupon_for_order`, and `tests/storefront/coupons.test.ts` holds
 *    the two side by side. It is never the authority.
 *  - the admin CRUD, which reads and writes rows and audits every write.
 *
 * Codes are stored uppercase and compared uppercase. The database enforces
 * that with a unique index on `upper(code)`, so `welcome2` and `WELCOME2` are
 * one coupon in Postgres as well as in the dashboard.
 */

export type CouponType = "percent" | "fixed" | "balance";

export type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  currency: string;
  usageLimit: number | null;
  perCustomerLimit: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
  offerIds: string[];
  adminNote: string | null;
  timesUsed: number;
  createdAt: string;
};

export type CouponRefusal =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "usage_limit"
  | "already_used"
  | "below_minimum"
  | "wrong_scope"
  | "no_discount"
  | "below_cost"
  | "balance_coupon_not_for_checkout"
  | "discount_coupon_not_for_wallet";

export type CouponEvaluation =
  | { ok: true; discount: number; total: number }
  | { ok: false; reason: CouponRefusal };

/** The deterministic part of a coupon, independent of who is asking. */
export type CouponRule = {
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  productIds?: string[] | null;
  categoryIds?: string[] | null;
  offerIds?: string[] | null;
};

export type CouponWindow = {
  isActive: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  usageLimit?: number | null;
  timesUsed?: number;
  perCustomerLimit?: number;
  customerRedemptions?: number;
};

export type CouponCart = {
  offerId: string;
  productId: string | null;
  categoryId: string | null;
  /** Supplier cost per unit, in USD, when the mapping is known. */
  supplierCostUsd: number | null;
  /** True for a stored item the store already owns. */
  storedDelivery?: boolean;
};

export type CouponPreview = { discount: number; total: number };

export const MINIMUM_STORE_MARGIN_RATE = 0.02; // 2% safety margin of product price

/** The store's markup is applied to cost, but a discount must preserve at least a 2% safety margin of the product price. */
export function discountCeiling(
  unitPrice: number,
  quantity: number,
  supplierCostUsd: number | null,
  storedDelivery = false,
): number {
  const units = Math.max(Math.trunc(quantity) || 1, 1);
  const amount = Number.isFinite(unitPrice) ? unitPrice : 0;

  // An unknown cost is not a licence to discount: refuse rather than guess.
  if (storedDelivery) {
    return round2(amount * units);
  }

  if (supplierCostUsd === null || !Number.isFinite(supplierCostUsd)) {
    return 0;
  }

  // Safety margin: preserve at least 2% of the product price
  const minRequiredMargin = round2(amount * MINIMUM_STORE_MARGIN_RATE);
  return round2(Math.max(amount - supplierCostUsd - minRequiredMargin, 0) * units);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The discount a coupon is worth on this cart, or why it is refused.
 *
 * Order matters, and it matches the database: a code that does not exist is a
 * different answer from a code that exists and expired, and an unknown cost is
 * a refusal rather than a zero discount.
 */
export function evaluateCoupon(
  rule: CouponRule,
  window: CouponWindow,
  cart: CouponCart,
  quantity: number,
  subtotal: number,
  now: Date = new Date(),
): CouponEvaluation {
  if (!window.isActive) {
    return { ok: false, reason: "inactive" };
  }

  if (rule.type === "balance") {
    return { ok: false, reason: "balance_coupon_not_for_checkout" };
  }
  const from = window.validFrom ? Date.parse(window.validFrom) : null;
  const until = window.validUntil ? Date.parse(window.validUntil) : null;
  const at = now.getTime();

  if (from !== null && Number.isFinite(from) && at < from) {
    return { ok: false, reason: "not_started" };
  }

  if (until !== null && Number.isFinite(until) && at >= until) {
    return { ok: false, reason: "expired" };
  }

  const usageLimit = window.usageLimit ?? null;

  if (usageLimit !== null && (window.timesUsed ?? 0) >= usageLimit) {
    return { ok: false, reason: "usage_limit" };
  }

  const perCustomer = window.perCustomerLimit ?? 1;

  if ((window.customerRedemptions ?? 0) >= perCustomer) {
    return { ok: false, reason: "already_used" };
  }

  if (subtotal < rule.minSubtotal) {
    return { ok: false, reason: "below_minimum" };
  }

  const categories = rule.categoryIds ?? [];
  const products = rule.productIds ?? [];
  const offers = rule.offerIds ?? [];

  if (categories.length > 0 && (!cart.categoryId || !categories.includes(cart.categoryId))) {
    return { ok: false, reason: "wrong_scope" };
  }

  if (products.length > 0 && (!cart.productId || !products.includes(cart.productId))) {
    return { ok: false, reason: "wrong_scope" };
  }

  if (offers.length > 0 && !offers.includes(cart.offerId)) {
    return { ok: false, reason: "wrong_scope" };
  }

  const raw = rule.type === "percent" ? round2((subtotal * rule.value) / 100) : Math.min(rule.value, subtotal);

  const capped = rule.maxDiscount === null ? raw : Math.min(raw, rule.maxDiscount);
  const discount = round2(Math.max(Math.min(capped, subtotal), 0));

  if (discount <= 0) {
    return { ok: false, reason: "no_discount" };
  }

  const ceiling = discountCeiling(
    quantity > 0 ? subtotal / quantity : subtotal,
    quantity,
    cart.supplierCostUsd,
    cart.storedDelivery,
  );

  if (discount > ceiling) {
    return { ok: false, reason: "below_cost" };
  }

  return { ok: true, discount, total: round2(subtotal - discount) };
}

/** The refusal keys the checkout page turns into copy. */
export const COUPON_REFUSAL_KEYS: Record<CouponRefusal, string> = {
  not_found: "coupon_not_found",
  inactive: "coupon_inactive",
  not_started: "coupon_not_started",
  expired: "coupon_expired",
  usage_limit: "coupon_usage_limit",
  already_used: "coupon_already_used",
  below_minimum: "coupon_below_minimum",
  wrong_scope: "coupon_wrong_scope",
  no_discount: "coupon_no_discount",
  below_cost: "coupon_below_cost",
  balance_coupon_not_for_checkout: "coupon_balance_not_for_checkout",
  discount_coupon_not_for_wallet: "coupon_discount_not_for_wallet",
};

/** Map a raised database message onto the same vocabulary as the pure port. */
export function refusalFromDatabase(message: string): CouponRefusal {
  const text = message.toLowerCase();

  if (text.includes("not found")) return "not_found";
  if (text.includes("not active")) return "inactive";
  if (text.includes("not valid yet")) return "not_started";
  if (text.includes("expired")) return "expired";
  if (text.includes("usage limit")) return "usage_limit";
  if (text.includes("already used")) return "already_used";
  if (text.includes("balance coupon")) return "balance_coupon_not_for_checkout";
  if (text.includes("discount coupon")) return "discount_coupon_not_for_wallet";
  if (text.includes("below the coupon minimum")) return "below_minimum";
  if (text.includes("does not apply")) return "wrong_scope";
  if (text.includes("no discount")) return "no_discount";
  if (text.includes("below supplier cost")) return "below_cost";

  return "not_found";
}

// ─── Reads ─────────────────────────────────────────────────────────────────

type CouponRow = {
  id: string;
  code: string;
  type: string;
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  currency: string;
  usage_limit: number | null;
  per_customer_limit: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  product_ids: string[] | null;
  category_ids: string[] | null;
  offer_ids: string[] | null;
  admin_note: string | null;
  times_used: number;
  created_at: string;
};

const COUPON_COLUMNS =
  "id, code, type, value, min_subtotal, max_discount, currency, usage_limit, per_customer_limit, valid_from, valid_until, is_active, product_ids, category_ids, offer_ids, admin_note, times_used, created_at";

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type === "percent" ? "percent" : "fixed",
    value: row.value,
    minSubtotal: row.min_subtotal,
    maxDiscount: row.max_discount,
    currency: row.currency,
    usageLimit: row.usage_limit,
    perCustomerLimit: row.per_customer_limit,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    isActive: row.is_active,
    productIds: row.product_ids ?? [],
    categoryIds: row.category_ids ?? [],
    offerIds: row.offer_ids ?? [],
    adminNote: row.admin_note,
    timesUsed: row.times_used,
    createdAt: row.created_at,
  };
}

export async function listCoupons(supabase: SupabaseClient): Promise<Coupon[]> {
  await requireAdminId(supabase);
  const { data, error } = await supabase
    .from("coupons")
    .select(COUPON_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return [];
  }

  return (data as unknown as CouponRow[]).map(toCoupon);
}

export async function getCoupon(supabase: SupabaseClient, id: string): Promise<Coupon | null> {
  await requireAdminId(supabase);
  const { data, error } = await supabase
    .from("coupons")
    .select(COUPON_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toCoupon(data as unknown as CouponRow);
}

export type CouponRedemption = {
  id: string;
  code: string;
  amount: number;
  currency: string;
  createdAt: string;
  userId: string;
  orderId: string;
  customerName: string | null;
  customerEmail: string | null;
};

export async function listRedemptions(
  supabase: SupabaseClient,
  couponId: string,
  limit = 100,
): Promise<CouponRedemption[]> {
  await requireAdminId(supabase);
  const { data, error } = await supabase
    .from("coupon_redemptions")
    .select(
      "id, code, amount, currency, created_at, user_id, order_id, profiles!coupon_redemptions_user_id_fkey (full_name, email)",
    )
    .eq("coupon_id", couponId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  type Profile = { full_name: string | null; email: string | null };
  type RawRedemption = {
    id: string;
    code: string;
    amount: number;
    currency: string;
    created_at: string;
    user_id: string;
    order_id: string;
    profiles: Profile | Profile[] | null;
  };

  return (data as unknown as RawRedemption[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      id: row.id,
      code: row.code,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.created_at,
      userId: row.user_id,
      orderId: row.order_id,
      customerName: profile?.full_name ?? null,
      customerEmail: profile?.email ?? null,
    };
  });
}

/**
 * The coupon a signed-in customer is looking at, for the checkout preview.
 *
 * Read through the customer's own session, so RLS decides what is visible: an
 * inactive code simply is not there.
 */
export async function findCouponByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<Coupon | null> {
  const normalized = normalizeCouponCode(code);

  if (!normalized) {
    return null;
  }

  const { data, error } = await supabase
    .from("coupons")
    .select(COUPON_COLUMNS)
    .eq("code", normalized)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toCoupon(data as unknown as CouponRow);
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

// ─── The preview ───────────────────────────────────────────────────────────

export type CouponPreviewInput = {
  code: string;
  offerId: string;
  productId: string | null;
  quantity: number;
  unitPrice: number;
};

export type CouponPreviewResult =
  | { ok: true; code: string; discount: number; total: number }
  | { ok: false; reason: CouponRefusal };

/**
 * What this code would be worth, computed server-side.
 *
 * Used by the checkout preview. It reads the coupon through the caller's own
 * session and the supplier cost through the service client — a customer must
 * not be able to read the cost column, and the preview is the one place the
 * discount needs it.
 */
export async function previewCoupon(
  supabase: SupabaseClient,
  userId: string,
  input: CouponPreviewInput,
): Promise<CouponPreviewResult> {
  const code = normalizeCouponCode(input.code);

  if (!code) {
    return { ok: false, reason: "not_found" };
  }

  const coupon = await findCouponByCode(supabase, code);

  if (!coupon) {
    return { ok: false, reason: "not_found" };
  }

  const quantity = Math.max(Math.trunc(input.quantity) || 1, 1);
  const subtotal = round2(input.unitPrice * quantity);

  const [cost, redemptions, scope] = await Promise.all([
    readSupplierCost(input.offerId),
    countMyRedemptions(userId, coupon.id),
    readOfferScope(input.offerId),
  ]);

  const evaluation = evaluateCoupon(
    {
      type: coupon.type,
      value: coupon.value,
      minSubtotal: coupon.minSubtotal,
      maxDiscount: coupon.maxDiscount,
      productIds: coupon.productIds,
      categoryIds: coupon.categoryIds,
      offerIds: coupon.offerIds,
    },
    {
      isActive: coupon.isActive,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      usageLimit: coupon.usageLimit,
      timesUsed: coupon.timesUsed,
      perCustomerLimit: coupon.perCustomerLimit,
      customerRedemptions: redemptions,
    },
    {
      offerId: input.offerId,
      productId: input.productId ?? scope.productId,
      categoryId: scope.categoryId,
      supplierCostUsd: cost,
      storedDelivery: scope.storedDelivery,
    },
    quantity,
    subtotal,
  );

  if (!evaluation.ok) {
    return evaluation;
  }

  return { ok: true, code: coupon.code, discount: evaluation.discount, total: evaluation.total };
}
async function countMyRedemptions(
  userId: string,
  couponId: string,
): Promise<number> {
  /*
   * Read with service authority, scoped by `user_id` here. `coupon_redemptions`
   * is not readable by a customer session — the store's redemption ledger is
   * not a customer-facing table — so a session read would silently answer
   * "zero" and the checkout preview would miss the per-customer limit.
   */
  const { count } = await createSupabaseServiceClient()
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId)
    .eq("user_id", userId);

  return count ?? 0;
}

/**
 * The supplier cost of an offer, read with service authority.
 *
 * Cost is never public: a customer who could read it would know the store's
 * margin on every item, and the checkout page needs it only to run the same
 * margin guard the database runs.
 */
export async function readSupplierCost(offerId: string): Promise<number | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("provider_offer_mappings")
    .select("supplier_cost_usd")
    .eq("offer_id", offerId)
    .not("supplier_cost_usd", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const value = data?.supplier_cost_usd;

  return typeof value === "number" ? value : null;
}

export async function readOfferScope(
  offerId: string,
): Promise<{ productId: string | null; categoryId: string | null; storedDelivery: boolean }> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("offers")
    .select("product_id, delivery_kind, products (category_id)")
    .eq("id", offerId)
    .maybeSingle();

  const row = data as unknown as
    | {
        product_id: string | null;
        delivery_kind: string | null;
        products: { category_id: string | null } | { category_id: string | null }[] | null;
      }
    | null;
  const products = row?.products;
  const product = Array.isArray(products) ? products[0] : products;

  return {
    productId: row?.product_id ?? null,
    categoryId: product?.category_id ?? null,
    storedDelivery: row?.delivery_kind === "stored",
  };
}

// ─── Admin writes ──────────────────────────────────────────────────────────

export type CouponInput = {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  currency: string;
  usageLimit: number | null;
  perCustomerLimit: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
  offerIds: string[];
  adminNote: string | null;
};

export type CouponWriteResult = { ok: true; id: string } | { ok: false; reason: string };

function toRow(input: CouponInput) {
  return {
    code: normalizeCouponCode(input.code),
    type: input.type,
    value: input.value,
    min_subtotal: input.minSubtotal,
    max_discount: input.maxDiscount,
    currency: input.currency,
    usage_limit: input.usageLimit,
    per_customer_limit: input.perCustomerLimit,
    valid_from: input.validFrom,
    valid_until: input.validUntil,
    is_active: input.isActive,
    product_ids: input.productIds,
    category_ids: input.categoryIds,
    offer_ids: input.offerIds,
    admin_note: input.adminNote,
  };
}

/**
 * The margin warning the admin form shows.
 *
 * The cheapest mapped offer in scope is the one that decides whether this
 * discount is safe: a percentage is only below cost on the item with the
 * thinnest markup, and refusing a coupon because a *different* item has a wide
 * margin would be the wrong answer.
 */
export async function cheapestMappedOffer(
  offerIds: string[],
  productIds: string[],
): Promise<{ offerId: string; price: number; cost: number; ceiling: number } | null> {
  const service = createSupabaseServiceClient();
  let query = service
    .from("offers")
    .select("id, price, product_id, provider_offer_mappings (supplier_cost_usd)")
    .eq("is_active", true)
    .limit(500);

  if (offerIds.length > 0) {
    query = query.in("id", offerIds);
  } else if (productIds.length > 0) {
    query = query.in("product_id", productIds);
  }

  const { data } = await query;

  if (!data) {
    return null;
  }

  let cheapest: { offerId: string; price: number; cost: number; ceiling: number } | null = null;

  for (const raw of data as unknown as {
    id: string;
    price: number;
    provider_offer_mappings: { supplier_cost_usd: number | null } | { supplier_cost_usd: number | null }[] | null;
  }[]) {
    const mappings = Array.isArray(raw.provider_offer_mappings)
      ? raw.provider_offer_mappings
      : raw.provider_offer_mappings
        ? [raw.provider_offer_mappings]
        : [];
    const costs = mappings
      .map((mapping) => mapping.supplier_cost_usd)
      .filter((value): value is number => typeof value === "number");

    if (costs.length === 0) {
      continue;
    }

    const cost = Math.min(...costs);
    const ceiling = round2(Math.max(raw.price - cost, 0));

    if (!cheapest || ceiling < cheapest.ceiling) {
      cheapest = { offerId: raw.id, price: raw.price, cost, ceiling };
    }
  }

  return cheapest;
}

export async function createCoupon(
  supabase: SupabaseClient,
  input: CouponInput,
): Promise<CouponWriteResult> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();
  const row = toRow(input);

  if (!row.code) {
    return { ok: false, reason: "invalid_code" };
  }

  const { data, error } = await service
    .from("coupons")
    .insert({ ...row, created_by: actor.id })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: error?.code === "23505" ? "duplicate_code" : "unknown" };
  }

  await recordAudit({
    actorId: actor.id,
    action: "coupon_created",
    entityType: "coupon",
    entityId: data.id,
    values: { ...row },
  });

  return { ok: true, id: data.id };
}

export async function updateCoupon(
  supabase: SupabaseClient,
  id: string,
  input: CouponInput,
): Promise<CouponWriteResult> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();
  const row = toRow(input);

  if (!row.code) {
    return { ok: false, reason: "invalid_code" };
  }

  const { data: before } = await service
    .from("coupons")
    .select(COUPON_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await service
    .from("coupons")
    .update(row)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: error?.code === "23505" ? "duplicate_code" : "unknown" };
  }

  await recordAudit({
    actorId: actor.id,
    action: "coupon_updated",
    entityType: "coupon",
    entityId: id,
    values: {
      before: (before ?? null) as unknown as Record<string, unknown>,
      after: row as unknown as Record<string, unknown>,
    },
  });

  return { ok: true, id: data.id };
}

/** Deactivation is a flag, never a delete: the redemptions must survive. */
export async function setCouponActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean,
): Promise<boolean> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const { error } = await service.from("coupons").update({ is_active: isActive }).eq("id", id);

  if (error) {
    return false;
  }

  await recordAudit({
    actorId: actor.id,
    action: isActive ? "coupon_activated" : "coupon_deactivated",
    entityType: "coupon",
    entityId: id,
    values: { is_active: isActive },
  });

  return true;
}

export async function deleteCoupon(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  // Delete redemptions if any to avoid foreign key restrict errors
  await service.from("coupon_redemptions").delete().eq("coupon_id", id);
  const { error } = await service.from("coupons").delete().eq("id", id);

  if (error) {
    return { ok: false, reason: error.message };
  }

  await recordAudit({
    actorId: actor.id,
    action: "coupon_deleted",
    entityType: "coupon",
    entityId: id,
    values: {},
  });

  return { ok: true };
}

/** How many times the signed-in customer has already used a code. */
export async function countCustomerRedemptions(
  supabase: SupabaseClient,
  couponId: string,
): Promise<number> {
  const user = await requireUserId(supabase);

  return countMyRedemptions(user.id, couponId);
}

export type RedeemCouponResult =
  | { ok: true; amount: number; balanceAfter: number; code: string }
  | { ok: false; reason: string };

/**
 * Redeem a 'balance' coupon directly into the authenticated customer's wallet.
 * Uses atomic Postgres RPC under a row-lock to verify, deposit, update balance,
 * and mark single-use coupons as inactive.
 */
export async function redeemCouponToWallet(
  supabase: SupabaseClient,
  code: string,
): Promise<RedeemCouponResult> {
  const cleanCode = normalizeCouponCode(code);
  if (!cleanCode || cleanCode.length < 2) {
    return { ok: false, reason: "invalid_code" };
  }

  const { data, error } = await supabase.rpc("redeem_coupon_to_wallet", {
    p_code: cleanCode,
  });

  if (error) {
    return { ok: false, reason: error.message || "failed" };
  }

  const res = data as {
    ok?: boolean;
    error?: string;
    amount?: number;
    balance_after?: number;
    code?: string;
  } | null;

  if (!res || !res.ok) {
    return { ok: false, reason: res?.error || "failed" };
  }

  return {
    ok: true,
    amount: Number(res.amount ?? 0),
    balanceAfter: Number(res.balance_after ?? 0),
    code: String(res.code || cleanCode),
  };
}

