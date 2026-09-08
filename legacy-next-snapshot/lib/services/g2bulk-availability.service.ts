import "server-only";

import { BATSTORE_PROVIDER_NAME } from "@/providers/batstore/mapping";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { MAXSTORE_PROVIDER_NAME } from "@/providers/maxstore/mapping";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { readG2BulkCredentials } from "@/lib/settings/provider-settings";
import { enqueueTelegramAlert } from "@/lib/services/telegram-alerts.service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

/**
 * A short-lived supplier-wallet guard for wallet checkout.
 *
 * The customer wallet is debited before fulfillment talks to G2Bulk. Checking
 * only after that debit creates avoidable failed orders when the supplier wallet
 * cannot cover the package. This guard is deliberately server-only and is only a
 * preflight: the final provider response and the configured refund policy still
 * decide what happens if the supplier changes between the check and purchase.
 */

const CACHE_TTL_MS = 30_000;
const BALANCE_EPSILON = 0.001;

type WalletSnapshot = {
  balance: number;
  expiresAt: number;
};

let cached: WalletSnapshot | null = null;
let cachedApiKey: string | null = null;
let inFlight: Promise<number | null> | null = null;
let inFlightApiKey: string | null = null;

async function readG2BulkWalletBalance(apiKey: string): Promise<number | null> {
  if (
    cached &&
    cachedApiKey === apiKey &&
    Date.now() < cached.expiresAt
  ) {
    return cached.balance;
  }

  if (inFlight && inFlightApiKey === apiKey) {
    return inFlight;
  }

  inFlightApiKey = apiKey;
  inFlight = (async () => {
    try {
      const account = await new G2BulkClient({ apiKey }).getAccount();

      if (!Number.isFinite(account.balance) || account.balance < 0) {
        return null;
      }

      cached = { balance: account.balance, expiresAt: Date.now() + CACHE_TTL_MS };
      cachedApiKey = apiKey;

      return account.balance;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlight = null;
    inFlightApiKey = null;
  });

  return inFlight;
}

type Availability = { affordable: boolean; insufficient: boolean };

async function checkG2BulkOfferAffordable(
  offerId: string,
  quantity: number,
): Promise<Availability> {
  const supabase = createSupabaseServiceClient();
  const { data: mappings, error: mappingError } = await supabase
    .from("provider_offer_mappings")
    .select("provider_name, supplier_cost_usd")
    .eq("offer_id", offerId);

  if (mappingError) {
    // Fail closed: an unreadable mapping must not allow a charge that cannot be
    // checked against the supplier wallet.
    return { affordable: false, insufficient: false };
  }

  const g2BulkMapping = mappings?.find(
    (mapping) => mapping.provider_name === G2BULK_PROVIDER_NAME,
  );

  if (!g2BulkMapping) {
    // Provider-owned MaxStore/BatStore offers use their own fulfillment guards.
    // An unknown or unmapped offer is refused because fulfillment defaults to no
    // provider rather than silently charging a customer for an undeliverable item.
    return {
      affordable:
        mappings?.length === 1 &&
        (mappings[0].provider_name === MAXSTORE_PROVIDER_NAME ||
          mappings[0].provider_name === BATSTORE_PROVIDER_NAME),
      insufficient: false,
    };
  }

  const supplierCost = Number(g2BulkMapping.supplier_cost_usd);

  if (!Number.isFinite(supplierCost) || supplierCost <= 0) {
    return { affordable: false, insufficient: false };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  if (settingsError) {
    return { affordable: false, insufficient: false };
  }

  const { apiKey, enabled } = readG2BulkCredentials((settings?.providers ?? {}) as Json);

  if (!apiKey || !enabled) {
    return { affordable: false, insufficient: false };
  }

  const balance = await readG2BulkWalletBalance(apiKey);

  if (balance === null) {
    return { affordable: false, insufficient: false };
  }

  const requestedQuantity = Math.max(1, Math.min(10, Math.floor(quantity)));
  const sufficient = balance + BALANCE_EPSILON >= supplierCost * requestedQuantity;

  if (!sufficient) {
    await enqueueTelegramAlert({
      type: "low_wallet",
      payload: {
        provider: G2BULK_PROVIDER_NAME,
        balance,
        required: supplierCost * requestedQuantity,
      },
      // Repeated checkouts must not flood the owner with the same message, but
      // the wallet can drain again after a top-up, so the key is a six-hour
      // bucket rather than a permanent one.
      dedupKey: `low_wallet:g2bulk:${Math.floor(Date.now() / (6 * 60 * 60 * 1000))}`,
    });
  }

  return { affordable: sufficient, insufficient: !sufficient };
}

/**
 * Public wrapper used by checkout. Provider outages fail closed so a customer
 * never gets charged while the store cannot verify that fulfillment is fundable.
 */
export async function isG2BulkOfferAffordable(
  offerId: string,
  quantity: number,
): Promise<boolean> {
  try {
    return (await checkG2BulkOfferAffordable(offerId, quantity)).affordable;
  } catch {
    return false;
  }
}
