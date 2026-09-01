import "server-only";

import { cache } from "react";
import { getSamCredentials } from "@/lib/services/admin-settings.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * ShamCash wallet balance for the admin chrome.
 *
 * Read from the local `provider_wallet_balances` cache, never from the
 * supplier. The header renders on every admin page view, including the
 * storefront, and SAM answers over its own slow path - so asking it here put a
 * third-party API on the critical path of every single page an owner opened.
 * The number a decoration shows is not worth that.
 *
 * The cache row is written whenever an admin syncs the wallet cards on the
 * overview. A missing row simply means "not synced yet", and the chrome
 * renders without a balance rather than blocking on one.
 *
 * Memoized per request so the header and footer share one read.
 */
export type ShamCashWalletSnapshot = {
  balance: number;
  currency: string;
  username: string;
  fetchedAt: number;
};

type CachedBalance = { currency: string; amount: number };

export const getShamCashWalletSnapshot = cache(
  async (): Promise<ShamCashWalletSnapshot | null> => {
    try {
      const [supabase, sam] = await Promise.all([
        createSupabaseServerClient(),
        getSamCredentials(),
      ]);

      if (!sam.apiKey || !sam.enabled || !sam.shamcashIdentifier) {
        return null;
      }

      const { data } = await supabase
        .from("provider_wallet_balances")
        .select("label, balances, status, synced_at")
        .eq("wallet_key", `sam:shamcash:${sam.shamcashIdentifier}`)
        .maybeSingle();

      if (!data || data.status !== "ok") {
        return null;
      }

      const balances = Array.isArray(data.balances) ? (data.balances as CachedBalance[]) : [];
      const entry = balances[0];

      if (!entry || typeof entry.amount !== "number" || typeof entry.currency !== "string") {
        return null;
      }

      return {
        balance: entry.amount,
        currency: entry.currency.toUpperCase(),
        username: data.label ?? "ShamCash",
        fetchedAt: data.synced_at ? new Date(data.synced_at).getTime() : Date.now(),
      };
    } catch {
      // A decoration must never be able to take down the page it decorates.
      return null;
    }
  },
);
