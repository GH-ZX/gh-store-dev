import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminId } from "@server/lib/auth/guards";
export type GiftPrefillResult =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; reason: "not_found" | "not_eligible" | "unknown" };

/**
 * Pull the account fields a recipient used the last time they bought this same
 * offer, so a gift to a returning customer does not ask for them again.
 *
 * Admin-only: an ordinary customer has no reason to fill someone else's order.
 * Only completed orders count — a paid-but-failed delivery would auto-fill a
 * wrong player id and hand the error straight to the supplier.
 */
export async function prefillGiftFieldsAction(
  supabase: SupabaseClient,
  recipientEmail: string,
  gameSlug: string,
  offerSlug: string,
): Promise<GiftPrefillResult> {
  try {
    await requireAdminId(supabase);
  } catch {
    return { ok: false, reason: "unknown" };
  }

  const parsed = z.object({ email: z.string().trim().max(320).pipe(z.email()) }).safeParse({
    email: recipientEmail,
  });

  if (!parsed.success) {
    return { ok: false, reason: "not_found" };
  }


  const { data: offer } = await supabase
    .from("offers")
    .select("id, products!inner (slug)")
    .eq("slug", offerSlug)
    .eq("is_active", true)
    .eq("products.slug", gameSlug)
    .eq("products.is_active", true)
    .maybeSingle();

  if (!offer) {
    return { ok: false, reason: "unknown" };
  }

  const { data: recipient } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", parsed.data.email.toLowerCase())
    .eq("role", "customer")
    .maybeSingle();

  if (!recipient) {
    return { ok: false, reason: "not_found" };
  }

  // A customer's last completed order of this exact offer. Queried from `orders`
  // (which carries `created_at`) with the matching item embedded, because
  // PostgREST cannot order by a column of a *to-one* embedded resource.
  const { data: order } = await supabase
    .from("orders")
    .select("order_items!inner (dynamic_fields)")
    .eq("user_id", recipient.id)
    .eq("status", "completed")
    .eq("order_items.offer_id", offer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const item = order && Array.isArray(order.order_items) ? order.order_items[0] : undefined;

  if (!item || !item.dynamic_fields || typeof item.dynamic_fields !== "object") {
    return { ok: false, reason: "not_eligible" };
  }

  const fields: Record<string, string> = {};

  for (const [key, value] of Object.entries(item.dynamic_fields)) {
    if (typeof value === "string" && value.length > 0) {
      fields[key] = value;
    }
  }

  return Object.keys(fields).length > 0
    ? { ok: true, fields }
    : { ok: false, reason: "not_eligible" };
}
