import { z } from "zod";
import { PRICING_DEFAULTS } from "@/providers/g2bulk/mapping";
import type { Json } from "@/types/database";

/**
 * Provider configuration stored in `store_settings.providers`.
 *
 * That column is never returned by the public settings RPC, so credentials live
 * beside presentation settings without being readable by a visitor. Even so, a
 * secret must not travel back to the admin's browser once saved — hence the
 * split between {@link G2BulkCredentials} (server only) and
 * {@link G2BulkStatus} (safe to render).
 */

export const g2bulkSettingsSchema = z.object({
  api_key: z.string().nullish(),
  markup_percent: z.coerce.number().optional().catch(undefined),
  enabled: z.boolean().optional().catch(undefined),
  /** Generated, never typed. Part of the callback address the supplier is given. */
  webhook_secret: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const providerSettingsSchema = z.object({
  g2bulk: g2bulkSettingsSchema.optional().catch(undefined),
});

export type G2BulkCredentials = {
  apiKey: string | null;
  markupPercent: number;
  enabled: boolean;
};

export type G2BulkStatus = {
  configured: boolean;
  /** Masked tail of the stored key, for confirming *which* key is saved. */
  keyHint: string | null;
  markupPercent: number;
  enabled: boolean;
  /** Whether a callback secret exists, and therefore whether orders carry a callback. */
  webhookConfigured: boolean;
  updatedAt: string | null;
};

/**
 * Mask a secret down to a recognisable tail.
 *
 * Four trailing characters are enough for an admin to tell two keys apart and
 * far too few to reconstruct one. Anything short enough that a tail would leak a
 * meaningful share of the value is masked completely.
 */
export function maskSecret(secret: string | null | undefined): string | null {
  const value = secret?.trim();

  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return "•".repeat(8);
  }

  return `${"•".repeat(8)}${value.slice(-4)}`;
}

function clampMarkup(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return PRICING_DEFAULTS.markupPercent;
  }

  return Math.min(
    PRICING_DEFAULTS.maxMarkupPercent,
    Math.max(PRICING_DEFAULTS.minMarkupPercent, value),
  );
}

export function readG2BulkCredentials(providers: unknown): G2BulkCredentials {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.g2bulk : undefined;
  const apiKey = settings?.api_key?.trim() || null;

  return {
    apiKey,
    markupPercent: clampMarkup(settings?.markup_percent),
    // A configured provider is enabled unless explicitly turned off.
    enabled: settings?.enabled !== false && apiKey !== null,
  };
}

/**
 * The callback secret, which is also the callback's only authentication.
 *
 * Server-side only, and never part of {@link G2BulkStatus}: unlike the API key
 * it cannot be masked and remain useful, because the secret *is* the address the
 * supplier is given.
 */
export function readG2BulkWebhookSecret(providers: unknown): string | null {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});

  return parsed.success ? parsed.data.g2bulk?.webhook_secret?.trim() || null : null;
}

export function toG2BulkStatus(providers: unknown): G2BulkStatus {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.g2bulk : undefined;
  const credentials = readG2BulkCredentials(providers);

  return {
    configured: credentials.apiKey !== null,
    keyHint: maskSecret(credentials.apiKey),
    markupPercent: credentials.markupPercent,
    enabled: credentials.enabled,
    webhookConfigured: readG2BulkWebhookSecret(providers) !== null,
    updatedAt: settings?.updated_at ?? null,
  };
}

/**
 * Merge an update into the stored provider settings.
 *
 * An omitted `apiKey` leaves the existing key untouched, so an admin can change
 * the markup without re-entering the secret. An explicit empty string clears it.
 */
export function mergeG2BulkSettings(
  providers: Json | null | undefined,
  update: { apiKey?: string; markupPercent?: number; enabled?: boolean; webhookSecret?: string },
  updatedAt: string,
): Json {
  // Other providers share this column, so an unrecognised shape is replaced
  // rather than merged into — but a valid object is preserved key by key.
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const storedFlag = parsed.success ? parsed.data.g2bulk?.enabled : undefined;
  const current = readG2BulkCredentials(providers);
  const suppliedKey = update.apiKey?.trim();
  const nextKey = update.apiKey === undefined ? current.apiKey : suppliedKey || null;

  base.g2bulk = {
    api_key: nextKey,
    markup_percent: clampMarkup(update.markupPercent ?? current.markupPercent),
    /*
     * Carried across every save. It is generated rather than typed, so it is
     * never in the form being merged here — and rebuilding this object without
     * it would silently retire the callback address the supplier already holds,
     * with no symptom until an order went unreported.
     */
    webhook_secret: update.webhookSecret ?? readG2BulkWebhookSecret(providers),
    /*
     * Saving a key enables the provider. Deriving this from the previous
     * `enabled` instead is what left the very first save disabled: with no key
     * stored yet, the computed value was false, and that false was then written
     * alongside the new key. An admin who explicitly turned the provider off
     * keeps it off while only the markup changes.
     */
    enabled: update.enabled ?? (nextKey === null ? false : suppliedKey ? true : storedFlag !== false),
    updated_at: updatedAt,
  };

  return base;
}
