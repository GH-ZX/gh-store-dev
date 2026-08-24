"use server";

import { revalidatePath } from "next/cache";
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

    // The cached rows changed server-side too; both locales' overviews are stale.
    revalidatePath("/ar/dashboard");
    revalidatePath("/en/dashboard");

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
