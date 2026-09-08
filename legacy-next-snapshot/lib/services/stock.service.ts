/**
 * Stock management for stored products.
 *
 * Admin operations use the service-role client. The `claim_stock_item` RPC
 * handles atomic decrement so two concurrent orders cannot claim the same item.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type StockItem = {
  id: string;
  offerId: string;
  content: string;
  status: "available" | "sold";
  soldToOrderId: string | null;
  createdAt: string;
};

type DbStockItem = {
  id: string;
  offer_id: string;
  content: string;
  status: string;
  sold_to_order_id: string | null;
  created_at: string;
};

function toStockItem(row: DbStockItem): StockItem {
  return {
    id: row.id,
    offerId: row.offer_id,
    content: row.content,
    status: row.status as StockItem["status"],
    soldToOrderId: row.sold_to_order_id,
    createdAt: row.created_at,
  };
}

export type StockSummary = {
  offerId: string;
  available: number;
  sold: number;
  total: number;
};

/**
 * List available stock items for an offer.
 */
export async function listStockItems(
  supabase: SupabaseClient,
  offerId: string,
): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, offer_id, content, status, sold_to_order_id, created_at")
    .eq("offer_id", offerId)
    .eq("status", "available")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toStockItem);
}

/**
 * Get stock counts for multiple offers at once.
 */
export async function getStockSummaries(
  supabase: SupabaseClient,
  offerIds: string[],
): Promise<Map<string, StockSummary>> {
  if (offerIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("stock_items")
    .select("offer_id, status")
    .in("offer_id", offerIds);

  if (error) throw error;

  const summaries = new Map<string, StockSummary>();
  for (const id of offerIds) {
    summaries.set(id, { offerId: id, available: 0, sold: 0, total: 0 });
  }

  for (const row of data ?? []) {
    const summary = summaries.get(row.offer_id);
    if (!summary) continue;
    summary.total += 1;
    if (row.status === "available") summary.available += 1;
    else if (row.status === "sold") summary.sold += 1;
  }

  return summaries;
}

/**
 * Add a single stock item.
 */
export async function addStockItem(
  supabase: SupabaseClient,
  offerId: string,
  content: string,
): Promise<StockItem> {
  const { data, error } = await supabase
    .from("stock_items")
    .insert({ offer_id: offerId, content, status: "available" })
    .select("id, offer_id, content, status, sold_to_order_id, created_at")
    .single();

  if (error) throw error;
  return toStockItem(data);
}

/**
 * Bulk-add stock items. Returns the count of items added.
 */
export async function bulkAddStockItems(
  supabase: SupabaseClient,
  offerId: string,
  contents: string[],
): Promise<number> {
  if (contents.length === 0) return 0;

  const rows = contents
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map((content) => ({ offer_id: offerId, content, status: "available" as const }));

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("stock_items").insert(rows);
  if (error) throw error;
  return rows.length;
}

/**
 * Delete an available stock item. Only unsold items can be deleted.
 */
export async function deleteStockItem(
  supabase: SupabaseClient,
  stockItemId: string,
): Promise<boolean> {
  const { error, count } = await supabase
    .from("stock_items")
    .delete()
    .eq("id", stockItemId)
    .eq("status", "available");

  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Claim all stock items for an order atomically.
 * Returns the claimed contents, or throws without consuming partial stock.
 */
export async function claimStockItems(
  supabase: SupabaseClient,
  offerId: string,
  orderId: string,
  quantity: number,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("claim_stock_items", {
    p_offer_id: offerId,
    p_order_id: orderId,
    p_quantity: quantity,
  });

  if (error) throw error;

  const items = (data ?? []) as DbStockItem[];
  if (items.length !== quantity) throw new Error("Not enough stock available");
  return items.map((item) => item.content);
}
