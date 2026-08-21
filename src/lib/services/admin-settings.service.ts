import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { resetLogDestination } from "@/lib/logging/logger";
import { PAGE_SIZE, pageRange } from "@/lib/paging";
import {
  mergeAxiomSettings,
  toAxiomStatus,
  type AxiomSettingsUpdate,
  type AxiomStatus,
} from "@/lib/settings/axiom-settings";
import {
  mergeBinanceSettings,
  readBinanceCredentials,
  toBinanceStatus,
  type BinanceCredentials,
  type BinanceStatus,
} from "@/lib/settings/binance-settings";
import {
  mergeBatStoreSettings,
  readBatStoreCredentials,
  toBatStoreStatus,
  type BatStoreCredentials,
  type BatStoreStatus,
} from "@/lib/settings/batstore-settings";
import { checkCallbackUrl, type CallbackReachability } from "@/lib/settings/callback-url";
import {
  mergeMaxStoreSettings,
  readMaxStoreCredentials,
  toMaxStoreStatus,
  type MaxStoreCredentials,
  type MaxStoreStatus,
} from "@/lib/settings/maxstore-settings";
import { newCallbackSecret } from "@/lib/settings/callback-secret";
import {
  mergeG2BulkSettings,
  readG2BulkCredentials,
  readG2BulkWebhookSecret,
  toG2BulkStatus,
  type G2BulkCredentials,
  type G2BulkStatus,
} from "@/lib/settings/provider-settings";
import {
  mergeSamSettings,
  readSamCredentials,
  toSamStatus,
  type SamCredentials,
  type SamSettingsUpdate,
  type SamStatus,
} from "@/lib/settings/sam-settings";
import { g2bulkCallbackUrl, functionUrl, telegramWebhookFunction } from "@/lib/supabase/functions-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mergeTelegramSettings,
  readTelegramAlertPrefs,
  readTelegramCredentials,
  toTelegramStatus,
  type TelegramCredentials,
  type TelegramSettingsUpdate,
  type TelegramStatus,
} from "@/lib/settings/telegram-settings";
import {
  mergeRefundOnFulfillmentFailure,
  readRefundOnFulfillmentFailure,
  type FulfillmentSettings,
} from "@/lib/settings/fulfillment-settings";
import type { Json } from "@/types/database";

/**
 * Admin reads and writes of provider configuration.
 *
 * Every function here runs behind {@link requireAdmin} and uses the caller's own
 * session, so the database's admin policy is the real gate — no service-role key
 * is involved. {@link getG2BulkCredentials} returns the secret and is server
 * only; UI code must use {@link getG2BulkStatus}, which returns a masked hint.
 */

const SETTINGS_ID = "global";

async function readProviders(): Promise<Json> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading provider settings failed: ${error.message}`);
  }

  return data?.providers ?? {};
}

export async function getG2BulkStatus(): Promise<G2BulkStatus> {
  await requireAdmin();

  return toG2BulkStatus(await readProviders());
}

/** Server-only: returns the plaintext API key. Never pass the result to a client component. */
export async function getG2BulkCredentials(): Promise<G2BulkCredentials> {
  await requireAdmin();

  return readG2BulkCredentials(await readProviders());
}

/**
 * The address G2Bulk is given, as the owner needs to see it.
 *
 * The secret is the address, so this returns the whole thing — the same stance
 * the Sam panel takes, and for the same reason: a version with the token
 * stripped is not the address and cannot be checked against anything. Admin
 * only, and it should be treated like a password.
 *
 * `reachable` is what stops a local Supabase looking configured. The supplier
 * calls from its own network, and an address only this machine can resolve is
 * an order that is never reported.
 */
export type G2BulkCallback = {
  url: string;
  configured: boolean;
  reachable: CallbackReachability;
};

export async function getG2BulkCallback(): Promise<G2BulkCallback> {
  await requireAdmin();

  const providers = await readProviders();
  const secret = readG2BulkWebhookSecret(providers);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const url = supabaseUrl ? g2bulkCallbackUrl(supabaseUrl, secret) : "";

  return {
    url,
    configured: secret !== null,
    reachable: url ? checkCallbackUrl(url) : "invalid",
  };
}

/**
 * Generate the callback secret, or replace it.
 *
 * Replacing it retires the address orders already carry: an order placed before
 * the change reports to a URL whose token no longer matches, and is refused.
 * Those orders are not lost — the reconciliation sweep settles them as it did
 * before any of this existed — but it is why this is a deliberate button rather
 * than something that happens on save.
 */
export async function regenerateG2BulkCallbackSecret(): Promise<G2BulkStatus> {
  return saveG2BulkSettings({ webhookSecret: newCallbackSecret() });
}

export async function saveG2BulkSettings(update: {
  apiKey?: string;
  markupPercent?: number;
  enabled?: boolean;
  webhookSecret?: string;
}): Promise<G2BulkStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeG2BulkSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving provider settings failed: ${error.message}`);
  }

  return toG2BulkStatus(data.providers);
}

export async function getSamStatus(): Promise<SamStatus> {
  await requireAdmin();

  return toSamStatus(await readProviders());
}

/** Server-only: returns the plaintext Sam API key. Never pass the result to a client component. */
export async function getSamCredentials(): Promise<SamCredentials> {
  await requireAdmin();

  return readSamCredentials(await readProviders());
}

export async function saveSamSettings(update: SamSettingsUpdate): Promise<SamStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeSamSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving Sam API settings failed: ${error.message}`);
  }

  return toSamStatus(data.providers);
}

export async function getAxiomStatus(): Promise<AxiomStatus> {
  await requireAdmin();

  return toAxiomStatus(await readProviders());
}

/**
 * Save the logging destination.
 *
 * The cached destination is dropped afterwards so a corrected token takes effect
 * on the next event rather than up to a minute later, which is the difference
 * between "I fixed it and nothing happened" and "I fixed it".
 */
export async function saveAxiomSettings(update: AxiomSettingsUpdate): Promise<AxiomStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const next = mergeAxiomSettings(await readProviders(), update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving the logging settings failed: ${error.message}`);
  }

  resetLogDestination();

  return toAxiomStatus(data.providers);
}

export type ProviderSyncLogEntry = {
  id: string;
  kind: string;
  status: string;
  requestedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

/**
 * Provider runs, a page at a time.
 *
 * The result says whether the read worked rather than handing back a list,
 * because a failed query and a provider that has never run produce the same
 * empty array and mean opposite things. This used to return `[]` on error, so a
 * broken read rendered as "no runs yet" — the reassuring answer, and the wrong
 * one. The Logs page already draws that distinction for Axiom events; it holds
 * here for the same reason.
 */
export type ProviderSyncLogsResult =
  | { ok: true; runs: ProviderSyncLogEntry[]; total: number }
  | { ok: false };

export async function getRecentSyncLogs(
  providerName: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<ProviderSyncLogsResult> {
  await requireAdmin();

  const { from, to } = pageRange(options.page ?? 1, options.pageSize ?? PAGE_SIZE);

  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("provider_sync_logs")
    .select(
      "id, kind, status, requested_count, created_count, updated_count, failed_count, started_at, finished_at, error_message",
      { count: "exact" },
    )
    .eq("provider_name", providerName)
    .order("started_at", { ascending: false })
    .range(from, to);

  if (error) {
    return { ok: false };
  }

  const runs = data.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    requestedCount: row.requested_count,
    createdCount: row.created_count,
    updatedCount: row.updated_count,
    failedCount: row.failed_count,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  }));

  return { ok: true, runs, total: count ?? runs.length };
}

export async function getMaxStoreStatus(): Promise<MaxStoreStatus> {
  await requireAdmin();

  return toMaxStoreStatus(await readProviders());
}

/** Server-only: returns the plaintext MaxStore token. Never pass this to a client component. */
export async function getMaxStoreCredentials(): Promise<MaxStoreCredentials> {
  await requireAdmin();

  return readMaxStoreCredentials(await readProviders());
}

export async function saveMaxStoreSettings(update: {
  apiToken?: string;
  markupPercent?: number;
  enabled?: boolean;
}): Promise<MaxStoreStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeMaxStoreSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving provider settings failed: ${error.message}`);
  }

  return toMaxStoreStatus(data.providers);
}

export async function getBatStoreStatus(): Promise<BatStoreStatus> {
  await requireAdmin();

  return toBatStoreStatus(await readProviders());
}

/** Server-only: returns the plaintext BatStore key. Never pass this to a client component. */
export async function getBatStoreCredentials(): Promise<BatStoreCredentials> {
  await requireAdmin();

  return readBatStoreCredentials(await readProviders());
}

export async function saveBatStoreSettings(update: {
  apiToken?: string;
  markupPercent?: number;
  enabled?: boolean;
}): Promise<BatStoreStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeBatStoreSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving provider settings failed: ${error.message}`);
  }

  return toBatStoreStatus(data.providers);
}

export async function getBinanceStatus(): Promise<BinanceStatus> {
  await requireAdmin();

  return toBinanceStatus(await readProviders());
}

/** Server-only: returns the plaintext merchant credentials. Never hand these to a component. */
export async function getBinanceCredentials(): Promise<BinanceCredentials> {
  await requireAdmin();

  return readBinanceCredentials(await readProviders());
}

export async function saveBinanceSettings(update: {
  apiKey?: string;
  apiSecret?: string;
  currency?: string;
  enabled?: boolean;
}): Promise<BinanceStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeBinanceSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving Binance Pay settings failed: ${error.message}`);
  }

  return toBinanceStatus(data.providers);
}

export async function getFulfillmentSettings(): Promise<FulfillmentSettings> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("payments")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading fulfilment settings failed: ${error.message}`);
  }

  return { refundOnFailure: readRefundOnFulfillmentFailure(data?.payments ?? {}) };
}

export async function saveFulfillmentSettings(refundOnFailure: boolean): Promise<FulfillmentSettings> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from("store_settings")
    .select("payments")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (readError) {
    throw new Error(`Reading fulfilment settings failed: ${readError.message}`);
  }

  const payments = mergeRefundOnFulfillmentFailure(current?.payments, refundOnFailure);
  const { error } = await supabase
    .from("store_settings")
    .update({ payments })
    .eq("id", SETTINGS_ID);

  if (error) {
    throw new Error(`Saving fulfilment settings failed: ${error.message}`);
  }

  return { refundOnFailure };
}

// ─── Owner Telegram alerts ───────────────────────────────────────────────────

async function readTelegram(): Promise<Json> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("telegram")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading Telegram settings failed: ${error.message}`);
  }

  return data?.telegram ?? {};
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  await requireAdmin();

  return toTelegramStatus(await readTelegram());
}

/** Server-only: returns the plaintext bot token and webhook secret. Never hand these to a component. */
export async function getTelegramCredentials(): Promise<TelegramCredentials> {
  await requireAdmin();

  return readTelegramCredentials(await readTelegram());
}

export async function saveTelegramSettings(update: TelegramSettingsUpdate): Promise<TelegramStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const current = await readTelegram();
  const next = mergeTelegramSettings(current, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ telegram: next })
    .eq("id", SETTINGS_ID)
    .select("telegram")
    .single();

  if (error) {
    throw new Error(`Saving Telegram settings failed: ${error.message}`);
  }

  return toTelegramStatus(data.telegram);
}

/**
 * The address the Telegram webhook is registered at.
 *
 * A Supabase Edge Function, like the G2Bulk and Sam callbacks: this address is
 * public however and wherever the store is deployed, and it does not depend on
 * the Cloudflare Worker's environment. The secret is part of the address.
 */
export function telegramWebhookUrl(secret?: string | null): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";

  if (!supabaseUrl) {
    return null;
  }

  const base = functionUrl(supabaseUrl, telegramWebhookFunction);

  return secret ? `${base}?token=${encodeURIComponent(secret)}` : base;
}

/**
 * Prove the bot token and read who it belongs to.
 *
 * `getMe` is Telegram's cheapest call and returns the bot's own username, which
 * is the number an owner actually wants to see — the same role the G2Bulk
 * `getAccount` call plays. A webhook check is deliberately separate: a token
 * can be valid while the webhook is unregistered, and the two should not look
 * like the same failure.
 */
export async function verifyTelegramBotToken(token: string): Promise<{
  ok: boolean;
  username: string | null;
  kind: string;
}> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { username?: string | null; first_name?: string | null };
      description?: string;
    } | null;

    if (!response.ok || payload?.ok !== true) {
      const description = payload?.description ?? "";

      // 404 means the token is not a bot token at all; 401 means it is wrong.
      return { ok: false, username: null, kind: /could not find|unauthorized/i.test(description) ? "auth" : "unknown" };
    }

    return {
      ok: true,
      username: payload.result?.username ?? payload.result?.first_name ?? null,
      kind: "ok",
    };
  } catch {
    return { ok: false, username: null, kind: "network" };
  }
}

/**
 * What Telegram reports about the registered webhook.
 *
 * A registered webhook answers with our URL; anything else is either nothing
 * (never registered) or a stale address pointing somewhere else. The last error
 * is shown when present so an owner sees why deliveries stopped.
 */
export async function readTelegramWebhookState(token: string): Promise<{
  ok: boolean;
  url: string | null;
  pendingUpdateCount: number;
  lastError: string | null;
}> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: {
        url?: string | null;
        pending_update_count?: number;
        last_error_message?: string | null;
      };
    } | null;

    if (!response.ok || payload?.ok !== true) {
      return { ok: false, url: null, pendingUpdateCount: 0, lastError: null };
    }

    return {
      ok: true,
      url: payload.result?.url || null,
      pendingUpdateCount: payload.result?.pending_update_count ?? 0,
      lastError: payload.result?.last_error_message || null,
    };
  } catch {
    return { ok: false, url: null, pendingUpdateCount: 0, lastError: null };
  }
}

/**
 * Register (or re-register) the bot's webhook with Telegram.
 *
 * The dashboard performs the curl itself: it saves a fresh webhook secret, then
 * tells Telegram to call the Supabase Edge Function with that secret as part of
 * the address. One action replaces the manual setWebhook step, mirroring how
 * the G2Bulk callback is generated rather than typed.
 *
 * Returns a message key the page can localize; `null` means success.
 */
export async function registerTelegramWebhook(token: string, secret: string): Promise<{
  ok: boolean;
  kind: string;
}> {
  // The token lives in the URL itself, exactly like the G2Bulk callback.
  const url = telegramWebhookUrl(secret);

  if (!url) {
    return { ok: false, kind: "invalid_url" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, allowed_updates: ["message", "callback_query"] }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!response.ok || payload?.ok !== true) {
      const description = payload?.description ?? "";

      return {
        ok: false,
        kind: /could not find|unauthorized/i.test(description) ? "auth" : "unknown",
      };
    }

    return { ok: true, kind: "ok" };
  } catch {
    return { ok: false, kind: "network" };
  }
}
