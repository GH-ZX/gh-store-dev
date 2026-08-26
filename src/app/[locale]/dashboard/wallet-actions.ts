"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { logFailure } from "@/lib/logging/logger";
import { syncWalletCard } from "@/lib/services/admin-overview.service";

/**
 * Wallet refresh for the overview's supplier cards.
 *
 * One press, one supplier: the APIs behind these cards answer at different
 * speeds, and a bulk refresh would hold every balance hostage to the slowest.
 * The fresh balance is written to the cache table here and returned so the
 * card can swap it in without a reload.
 */

export type SyncWalletResult =
  | { ok: true; balances: { currency: string; amount: number }[]; syncedAt: string }
  | { ok: false; errorKind: string };

export async function syncWalletAction(key: string): Promise<SyncWalletResult> {
  await requireAdmin();

  const trimmed = typeof key === "string" ? key.trim().slice(0, 160) : "";

  if (!trimmed) {
    return { ok: false, errorKind: "unknown_wallet" };
  }

  try {
    const result = await syncWalletCard(trimmed);

    if (!result.ok) {
      return { ok: false, errorKind: result.errorKind };
    }

    /*
     * Deliberately no `revalidatePath` here.
     *
     * The fresh balance is returned to the caller, which swaps it into the card
     * directly — the screen is already correct without a re-render. Revalidating
     * instead asked the Worker to re-render the overview, the single heaviest
     * page in the app, once per locale per wallet. With several wallets
     * refreshing at once that turned one page view into a dozen self-inflicted
     * renders competing with real traffic on the same Worker, which is what
     * used to take the whole site down. The cache table is written server-side
     * either way, so the next natural navigation reads the new value.
     */
    return {
      ok: true,
      balances: result.card.balances,
      syncedAt: result.card.syncedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    logFailure("admin.overview", "wallet_sync_failed", error, { key: trimmed });

    return { ok: false, errorKind: "unreachable" };
  }
}
