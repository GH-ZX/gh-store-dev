import { z } from "zod";
import { maskSecret } from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

/**
 * BatStore (VenteBot Reseller) configuration, stored in
 * `store_settings.providers.batstore`.
 *
 * Same split the other providers use: {@link BatStoreCredentials} carries the
 * token and is server-only, {@link BatStoreStatus} carries a masked hint and is
 * safe to render. A saved secret never travels back to a browser.
 *
 * Its own module rather than a provider inside `provider-settings.ts`, following
 * the MaxStore precedent: each provider owns its own key inside the column and
 * nothing here can disturb a sibling's settings.
 */

export const batstoreSettingsSchema = z.object({
  api_token: z.string().nullish(),
  markup_percent: z.coerce.number().optional().catch(undefined),
  enabled: z.boolean().optional().catch(undefined),
  updated_at: z.string().nullish(),
});

const providersSchema = z.object({
  batstore: batstoreSettingsSchema.optional().catch(undefined),
});

/** Matches the other suppliers' default, so pricing is one rule across them. */
export const BATSTORE_PRICING = {
  markupPercent: 15,
  minMarkupPercent: 0,
  maxMarkupPercent: 500,
} as const;

function clampMarkup(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return BATSTORE_PRICING.markupPercent;
  }

  return Math.min(
    BATSTORE_PRICING.maxMarkupPercent,
    Math.max(BATSTORE_PRICING.minMarkupPercent, value),
  );
}

export type BatStoreCredentials = {
  apiToken: string | null;
  markupPercent: number;
  enabled: boolean;
};

export type BatStoreStatus = {
  configured: boolean;
  tokenHint: string | null;
  markupPercent: number;
  enabled: boolean;
  updatedAt: string | null;
};

export function readBatStoreCredentials(providers: unknown): BatStoreCredentials {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.batstore : undefined;
  const apiToken = settings?.api_token?.trim() || null;

  return {
    apiToken,
    markupPercent: clampMarkup(settings?.markup_percent),
    // A configured provider is enabled unless explicitly turned off.
    enabled: settings?.enabled !== false && apiToken !== null,
  };
}

export function toBatStoreStatus(providers: unknown): BatStoreStatus {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.batstore : undefined;
  const credentials = readBatStoreCredentials(providers);

  return {
    configured: credentials.apiToken !== null,
    tokenHint: maskSecret(credentials.apiToken),
    markupPercent: credentials.markupPercent,
    enabled: credentials.enabled,
    updatedAt: settings?.updated_at ?? null,
  };
}

/**
 * Merge an update into the stored provider settings.
 *
 * An omitted token leaves the saved one alone; an explicit empty string clears
 * it. Every other provider's key in this column is copied across untouched.
 */
export function mergeBatStoreSettings(
  providers: Json | null | undefined,
  update: { apiToken?: string; markupPercent?: number; enabled?: boolean },
  updatedAt: string,
): Json {
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const parsed = providersSchema.safeParse(providers ?? {});
  const storedFlag = parsed.success ? parsed.data.batstore?.enabled : undefined;
  const current = readBatStoreCredentials(providers);
  const supplied = update.apiToken?.trim();
  const nextToken = update.apiToken === undefined ? current.apiToken : supplied || null;

  base.batstore = {
    api_token: nextToken,
    markup_percent: clampMarkup(update.markupPercent ?? current.markupPercent),
    /*
     * Saving a token enables the provider — the same rule as the other
     * suppliers, so the very first save does not store a token with `enabled`
     * left false.
     */
    enabled: update.enabled ?? (nextToken === null ? false : supplied ? true : storedFlag !== false),
    updated_at: updatedAt,
  };

  return base;
}