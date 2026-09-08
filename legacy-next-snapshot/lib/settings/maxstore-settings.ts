import { z } from "zod";
import { maskSecret } from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

/**
 * MaxStore configuration, stored in `store_settings.providers.maxstore`.
 *
 * The same split the other providers use: {@link MaxStoreCredentials} carries
 * the token and is server-only, {@link MaxStoreStatus} carries a masked hint and
 * is safe to render. A saved secret never travels back to a browser.
 *
 * Its own module rather than another provider inside `provider-settings.ts`,
 * because that file is where the G2Bulk shape lives and a store with several
 * suppliers should not have them growing into each other. Each provider owns its
 * own key inside the column; nothing here can disturb a sibling's settings.
 */

export const maxstoreSettingsSchema = z.object({
  api_token: z.string().nullish(),
  markup_percent: z.coerce.number().optional().catch(undefined),
  enabled: z.boolean().optional().catch(undefined),
  updated_at: z.string().nullish(),
});

const providersSchema = z.object({
  maxstore: maxstoreSettingsSchema.optional().catch(undefined),
});

/** Matches the G2Bulk default, so an operator meets one pricing rule, not two. */
export const MAXSTORE_PRICING = {
  markupPercent: 15,
  minMarkupPercent: 0,
  maxMarkupPercent: 500,
} as const;

export type MaxStoreCredentials = {
  apiToken: string | null;
  markupPercent: number;
  enabled: boolean;
};

export type MaxStoreStatus = {
  configured: boolean;
  tokenHint: string | null;
  markupPercent: number;
  enabled: boolean;
  updatedAt: string | null;
};

function clampMarkup(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return MAXSTORE_PRICING.markupPercent;
  }

  return Math.min(
    MAXSTORE_PRICING.maxMarkupPercent,
    Math.max(MAXSTORE_PRICING.minMarkupPercent, value),
  );
}

export function readMaxStoreCredentials(providers: unknown): MaxStoreCredentials {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.maxstore : undefined;
  // Saved token wins; the environment variable fills the gap when nothing is
  // stored yet (deployments configured by secret).
  const apiToken = settings?.api_token?.trim() || process.env.MAXSTORE_API_TOKEN?.trim() || null;

  return {
    apiToken,
    markupPercent: clampMarkup(settings?.markup_percent),
    // A configured provider is enabled unless explicitly turned off.
    enabled: settings?.enabled !== false && apiToken !== null,
  };
}

export function toMaxStoreStatus(providers: unknown): MaxStoreStatus {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.maxstore : undefined;
  const credentials = readMaxStoreCredentials(providers);

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
 * An omitted token leaves the saved one alone, so an operator can change the
 * markup without handling the secret; an explicit empty string clears it. Every
 * other provider's key in this column is copied across untouched.
 */
export function mergeMaxStoreSettings(
  providers: Json | null | undefined,
  update: { apiToken?: string; markupPercent?: number; enabled?: boolean },
  updatedAt: string,
): Json {
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const parsed = providersSchema.safeParse(providers ?? {});
  const storedFlag = parsed.success ? parsed.data.maxstore?.enabled : undefined;
  const current = readMaxStoreCredentials(providers);
  const supplied = update.apiToken?.trim();
  const nextToken = update.apiToken === undefined ? current.apiToken : supplied || null;

  base.maxstore = {
    api_token: nextToken,
    markup_percent: clampMarkup(update.markupPercent ?? current.markupPercent),
    /*
     * Saving a token enables the provider — the same rule as G2Bulk, and for the
     * same reason: deriving this from the previous `enabled` left the very first
     * save disabled, because with no token stored yet the computed value was
     * false and that false was written alongside the new token.
     */
    enabled:
      update.enabled ?? (nextToken === null ? false : supplied ? true : storedFlag !== false),
    updated_at: updatedAt,
  };

  return base;
}
