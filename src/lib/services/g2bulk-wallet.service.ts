import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supplier wallet balance for the admin chrome.
 *
 * Read from the local `provider_wallet_balances` cache, never from the
 * supplier. The header renders on every admin page view, including the
 * storefront, and G2Bulk answers in one to two seconds from a Worker — so
 * asking it here put a slow third-party API on the critical path of every
 * single page an owner opened. The number a decoration shows is not worth that.
 *
 * The cache row is written whenever an admin syncs the wallet cards on the
 * overview. A missing row simply means "not synced yet", and the chrome renders
 * without a balance rather than blocking on one.
 *
 * Memoized per request so the header and footer share one read.
 */
export type G2BulkWalletSnapshot = {
  balance: number;
  username: string;
  fetchedAt: number;
};

type CachedBalance = { currency: string; amount: number };

export const getG2BulkWalletSnapshot = cache(async (): Promise<G2BulkWalletSnapshot | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("provider_wallet_balances")
      .select("label, balances, status, synced_at")
      .eq("wallet_key", "g2bulk")
      .maybeSingle();

    if (!data || data.status !== "ok") {
      return null;
    }

    const balances = Array.isArray(data.balances) ? (data.balances as CachedBalance[]) : [];
    const usd = balances.find((entry) => entry?.currency?.toUpperCase() === "USD") ?? balances[0];

    if (!usd || typeof usd.amount !== "number") {
      return null;
    }

    return {
      balance: usd.amount,
      username: data.label ?? "G2Bulk",
      fetchedAt: data.synced_at ? new Date(data.synced_at).getTime() : Date.now(),
    };
  } catch {
    // A decoration must never be able to take down the page it decorates.
    return null;
  }
});
