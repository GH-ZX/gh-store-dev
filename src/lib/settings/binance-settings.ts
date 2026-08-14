import { z } from "zod";
import { maskSecret } from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

/**
 * Binance Pay configuration, stored in `store_settings.providers.binance`.
 *
 * The roadmap's condition for this integration is that it exists "only behind
 * explicit configuration", and that is what `enabled` means here: it defaults to
 * off and stays off until an owner turns it on, even once credentials are saved.
 * Both other providers enable themselves the moment a key lands, which is right
 * for a supplier the store is already committed to and wrong for a payment
 * method a customer would suddenly be offered.
 *
 * Two secrets rather than one — the API key travels in a header and the secret
 * signs — and neither ever returns to a browser.
 */

export const binanceSettingsSchema = z.object({
  api_key: z.string().nullish(),
  api_secret: z.string().nullish(),
  enabled: z.boolean().optional().catch(undefined),
  /** Crypto the invoice is denominated in. USDT unless an owner says otherwise. */
  currency: z.string().optional().catch(undefined),
  updated_at: z.string().nullish(),
});

const providersSchema = z.object({
  binance: binanceSettingsSchema.optional().catch(undefined),
});

/** The store prices in USD, so a dollar-pegged coin is the sane default. */
export const BINANCE_DEFAULT_CURRENCY = "USDT";

/** What Binance documents as accepted order currencies, kept short on purpose. */
export const BINANCE_CURRENCIES = ["USDT", "USDC", "BNB", "BTC"] as const;

export type BinanceCredentials = {
  apiKey: string | null;
  apiSecret: string | null;
  currency: string;
  enabled: boolean;
};

export type BinanceStatus = {
  configured: boolean;
  keyHint: string | null;
  currency: string;
  /** Whether customers are actually offered it. Configured and enabled are not the same. */
  enabled: boolean;
  updatedAt: string | null;
};

function readCurrency(value: string | undefined): string {
  const upper = value?.trim().toUpperCase();

  return upper && (BINANCE_CURRENCIES as readonly string[]).includes(upper)
    ? upper
    : BINANCE_DEFAULT_CURRENCY;
}

export function readBinanceCredentials(providers: unknown): BinanceCredentials {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.binance : undefined;
  const apiKey = settings?.api_key?.trim() || null;
  const apiSecret = settings?.api_secret?.trim() || null;

  return {
    apiKey,
    apiSecret,
    currency: readCurrency(settings?.currency),
    /*
     * Both halves and an explicit yes. A signed request needs the pair, and a
     * payment method that appeared at checkout because a key was pasted would be
     * exactly the surprise the roadmap's wording is guarding against.
     */
    enabled: settings?.enabled === true && apiKey !== null && apiSecret !== null,
  };
}

export function toBinanceStatus(providers: unknown): BinanceStatus {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.binance : undefined;
  const credentials = readBinanceCredentials(providers);

  return {
    configured: credentials.apiKey !== null && credentials.apiSecret !== null,
    keyHint: maskSecret(credentials.apiKey),
    currency: credentials.currency,
    enabled: credentials.enabled,
    updatedAt: settings?.updated_at ?? null,
  };
}

/**
 * Merge an update into the stored provider settings.
 *
 * An omitted secret keeps the stored one, so an owner can change the currency or
 * switch the method off without re-entering credentials; an explicit empty
 * string clears it. Turning it off never clears the keys — a payment method
 * paused for the evening should not have to be set up again in the morning.
 */
export function mergeBinanceSettings(
  providers: Json | null | undefined,
  update: { apiKey?: string; apiSecret?: string; currency?: string; enabled?: boolean },
  updatedAt: string,
): Json {
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const current = readBinanceCredentials(providers);
  const nextKey =
    update.apiKey === undefined ? current.apiKey : update.apiKey.trim() || null;
  const nextSecret =
    update.apiSecret === undefined ? current.apiSecret : update.apiSecret.trim() || null;
  const hasBoth = nextKey !== null && nextSecret !== null;

  base.binance = {
    api_key: nextKey,
    api_secret: nextSecret,
    currency: readCurrency(update.currency ?? current.currency),
    // Cannot be on without both halves, whatever was asked for.
    enabled: hasBoth && (update.enabled ?? current.enabled),
    updated_at: updatedAt,
  };

  return base;
}
