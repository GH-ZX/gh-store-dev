import "server-only";

import { getG2BulkCredentials } from "@/lib/services/admin-settings.service";
import { G2BulkClient } from "@/providers/g2bulk/client";

/**
 * Supplier wallet balance for the admin chrome.
 *
 * Cached in memory for a minute. The header renders on every admin page view,
 * and the provider rate-limits per key — asking it for a balance on each render
 * would be both slow and rude.
 *
 * Any failure returns the last good snapshot if one exists, otherwise null. A
 * flaky provider must never replace a real balance with a misleading zero, and
 * must never break the page it is decorating.
 */
export type G2BulkWalletSnapshot = {
  balance: number;
  username: string;
  fetchedAt: number;
};

const CACHE_TTL_MS = 60_000;

let cached: G2BulkWalletSnapshot | null = null;
let inFlight: Promise<G2BulkWalletSnapshot | null> | null = null;

async function fetchSnapshot(): Promise<G2BulkWalletSnapshot | null> {
  try {
    const { apiKey, enabled } = await getG2BulkCredentials();

    if (!apiKey || !enabled) {
      return null;
    }

    const account = await new G2BulkClient({ apiKey }).getAccount();

    cached = {
      balance: account.balance,
      username: account.username ?? account.first_name ?? String(account.user_id),
      fetchedAt: Date.now(),
    };

    return cached;
  } catch {
    return cached;
  }
}

export async function getG2BulkWalletSnapshot(): Promise<G2BulkWalletSnapshot | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Collapse concurrent renders onto one provider call.
  inFlight ??= fetchSnapshot().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
