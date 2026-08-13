import { z } from "zod";
import type { Json } from "@/types/database";
import { maskSecret } from "@/lib/settings/provider-settings";

/**
 * Sam API configuration, stored in `store_settings.providers.sam`.
 *
 * Sam API is how a customer tops up their wallet: they send money to the store's
 * own ShamCash or Syriatel wallet through it, and the server can then ask Sam
 * whether the transfer actually arrived. That question is the whole reason this
 * provider may credit a wallet automatically while a manual bank transfer may
 * not — see {@link SamCredentials.manualReview}.
 *
 * The API key lives beside the supplier key in a column no customer can read,
 * and never travels back to the browser: the dashboard gets {@link SamStatus},
 * which carries only a masked tail.
 */

export const SAM_METHODS = ["shamcash", "syriatel"] as const;
export type SamMethod = (typeof SAM_METHODS)[number];

export const SAM_DEFAULTS = {
  invoiceCurrency: "USD",
  /** Only used when invoicing in Syrian pounds. */
  sypPerUsd: 0,
} as const;

const samSettingsSchema = z.object({
  api_key: z.string().nullish(),
  enabled: z.boolean().optional().catch(undefined),
  manual_review: z.boolean().optional().catch(undefined),
  shamcash_identifier: z.string().nullish(),
  syriatel_identifier: z.string().nullish(),
  invoice_currency: z.string().nullish(),
  syp_per_usd: z.coerce.number().optional().catch(undefined),
  webhook_secret: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const providerSettingsSchema = z.object({
  sam: samSettingsSchema.optional().catch(undefined),
});

export type SamCredentials = {
  apiKey: string | null;
  enabled: boolean;
  /**
   * When true, a payment Sam has confirmed still waits for the owner to approve
   * it. Off by default, because a confirmed payment is evidence the money
   * arrived — the owner turns this on when they want to see every top-up first.
   */
  manualReview: boolean;
  /** The store's own wallets, i.e. where a customer's money is sent. */
  shamcashIdentifier: string | null;
  syriatelIdentifier: string | null;
  invoiceCurrency: string;
  sypPerUsd: number;
};

export type SamStatus = {
  configured: boolean;
  keyHint: string | null;
  enabled: boolean;
  manualReview: boolean;
  shamcashIdentifier: string | null;
  syriatelIdentifier: string | null;
  invoiceCurrency: string;
  sypPerUsd: number;
  /** Which methods can actually be offered: enabled, keyed, and with a wallet. */
  availableMethods: SamMethod[];
  /**
   * Whether a callback secret exists.
   *
   * The secret itself never leaves the server — not even masked. What an owner
   * needs to know is that one was generated, because without it the store
   * refuses to open an invoice at all.
   */
  webhookConfigured: boolean;
  updatedAt: string | null;
};

/*
 * Sam's own identifier formats, matched so a mistyped wallet is caught in the
 * dashboard rather than as a failed payment in front of a customer.
 */
const SHAMCASH_RE = /^[0-9a-f]{32}$/i;
const SYRIATEL_RE = /^(09\d{8}|\d{8})$/;

export function isValidSamIdentifier(method: SamMethod, value: string | null | undefined): boolean {
  const identifier = value?.trim() ?? "";

  if (identifier.length === 0) {
    return false;
  }

  return method === "shamcash" ? SHAMCASH_RE.test(identifier) : SYRIATEL_RE.test(identifier);
}

function clampRate(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return SAM_DEFAULTS.sypPerUsd;
  }

  return Math.min(1_000_000, value);
}

function normalizeCurrency(value: string | null | undefined): string {
  const currency = value?.trim().toUpperCase();

  return currency === "SYP" ? "SYP" : SAM_DEFAULTS.invoiceCurrency;
}

export function readSamCredentials(providers: unknown): SamCredentials {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.sam : undefined;
  const apiKey = settings?.api_key?.trim() || null;

  return {
    apiKey,
    // A configured provider is on unless explicitly turned off; without a key
    // there is nothing to be on.
    enabled: settings?.enabled !== false && apiKey !== null,
    manualReview: settings?.manual_review === true,
    shamcashIdentifier: settings?.shamcash_identifier?.trim() || null,
    syriatelIdentifier: settings?.syriatel_identifier?.trim() || null,
    invoiceCurrency: normalizeCurrency(settings?.invoice_currency),
    sypPerUsd: clampRate(settings?.syp_per_usd),
  };
}

/**
 * Which methods may be offered to a customer.
 *
 * A method needs a wallet to send money to, so one without a valid identifier is
 * withheld rather than shown and then failing at payment time.
 */
export function readAvailableSamMethods(credentials: SamCredentials): SamMethod[] {
  if (!credentials.enabled || credentials.apiKey === null) {
    return [];
  }

  return SAM_METHODS.filter((method) =>
    isValidSamIdentifier(
      method,
      method === "shamcash" ? credentials.shamcashIdentifier : credentials.syriatelIdentifier,
    ),
  );
}

export function toSamStatus(providers: unknown): SamStatus {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.sam : undefined;
  const credentials = readSamCredentials(providers);

  return {
    configured: credentials.apiKey !== null,
    keyHint: maskSecret(credentials.apiKey),
    enabled: credentials.enabled,
    manualReview: credentials.manualReview,
    shamcashIdentifier: credentials.shamcashIdentifier,
    syriatelIdentifier: credentials.syriatelIdentifier,
    invoiceCurrency: credentials.invoiceCurrency,
    sypPerUsd: credentials.sypPerUsd,
    availableMethods: readAvailableSamMethods(credentials),
    webhookConfigured: (settings?.webhook_secret?.trim().length ?? 0) > 0,
    updatedAt: settings?.updated_at ?? null,
  };
}

export type SamSettingsUpdate = {
  apiKey?: string;
  enabled?: boolean;
  manualReview?: boolean;
  shamcashIdentifier?: string;
  syriatelIdentifier?: string;
  invoiceCurrency?: string;
  sypPerUsd?: number;
};

/**
 * Merge an update into the stored provider settings.
 *
 * An omitted `apiKey` leaves the stored key alone, so the owner can change a
 * wallet number or the review policy without re-entering the secret; an explicit
 * empty string clears it. Supplying a key switches the provider on, because
 * deriving `enabled` from a previous value that was false — as it necessarily is
 * before the first key exists — is what once left a freshly saved provider off.
 *
 * `methods` is written alongside for the customer-facing RPC, which cannot see
 * the key and so cannot work out on its own which methods are usable.
 *
 * Fields this function does not manage are carried over rather than rebuilt.
 * `webhook_secret` is the one that matters: it is generated elsewhere, and
 * dropping it here would silently rotate the callback token on every save, so
 * Sam would keep calling back with the token it was given at invoice time and be
 * turned away as unauthorized — a payment taken and never credited.
 */
export function mergeSamSettings(
  providers: Json | null | undefined,
  update: SamSettingsUpdate,
  updatedAt: string,
): Json {
  // The supplier key shares this column, so a valid object is preserved key by
  // key and only an unrecognisable shape is replaced.
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const storedFlag = parsed.success ? parsed.data.sam?.enabled : undefined;
  const current = readSamCredentials(providers);
  const suppliedKey = update.apiKey?.trim();
  const nextKey = update.apiKey === undefined ? current.apiKey : suppliedKey || null;

  const next: SamCredentials = {
    apiKey: nextKey,
    enabled: update.enabled ?? (nextKey === null ? false : suppliedKey ? true : storedFlag !== false),
    manualReview: update.manualReview ?? current.manualReview,
    shamcashIdentifier:
      update.shamcashIdentifier === undefined
        ? current.shamcashIdentifier
        : update.shamcashIdentifier.trim() || null,
    syriatelIdentifier:
      update.syriatelIdentifier === undefined
        ? current.syriatelIdentifier
        : update.syriatelIdentifier.trim() || null,
    invoiceCurrency: normalizeCurrency(update.invoiceCurrency ?? current.invoiceCurrency),
    sypPerUsd: clampRate(update.sypPerUsd ?? current.sypPerUsd),
  };

  const storedSam =
    base.sam && typeof base.sam === "object" && !Array.isArray(base.sam)
      ? (base.sam as Record<string, Json>)
      : {};

  base.sam = {
    ...storedSam,
    api_key: next.apiKey,
    enabled: next.enabled,
    manual_review: next.manualReview,
    shamcash_identifier: next.shamcashIdentifier,
    syriatel_identifier: next.syriatelIdentifier,
    invoice_currency: next.invoiceCurrency,
    syp_per_usd: next.sypPerUsd,
    methods: readAvailableSamMethods(next),
    updated_at: updatedAt,
  };

  return base;
}
