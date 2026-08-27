import "server-only";

import { cache } from "react";

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
  mergeIgdbSettings,
  readIgdbCredentials,
  toIgdbStatus,
  type IgdbCredentials,
  type IgdbStatus,
} from "@/lib/settings/igdb-settings";
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

/**
 * The providers blob, straight from the row.
 *
 * Writers use this one directly: a save merges its update onto whatever it
 * reads, and merging onto a remembered copy is how one save quietly undoes
 * another.
 */
async function readProvidersFresh(): Promise<Json> {
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

/**
 * The same blob, read once per request.
 *
 * Every getter below wants that one `store_settings` row, and a dashboard
 * render asks four of them at once while building the supplier wallet cards —
 * four identical queries to a database half a second away, for a row that
 * cannot change between them. React's `cache()` collapses them into one.
 */
const readProviders = cache(readProvidersFresh);

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
  const providers = await readProvidersFresh();
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
  const providers = await readProvidersFresh();
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
  const next = mergeAxiomSettings(await readProvidersFresh(), update, new Date().toISOString());

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

export async function getIgdbStatus(): Promise<IgdbStatus> {
  await requireAdmin();

  return toIgdbStatus(await readProviders());
}

/** Server-only: returns the plaintext IGDB secret. Never pass this to a client component. */
export async function getIgdbCredentials(): Promise<IgdbCredentials> {
  await requireAdmin();

  return readIgdbCredentials(await readProviders());
}

export async function saveIgdbSettings(update: {
  clientId?: string;
  clientSecret?: string;
}): Promise<IgdbStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProvidersFresh();
  const next = mergeIgdbSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving provider settings failed: ${error.message}`);
  }

  return toIgdbStatus(data.providers);
}

export async function saveMaxStoreSettings(update: {
  apiToken?: string;
  markupPercent?: number;
  enabled?: boolean;
}): Promise<MaxStoreStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProvidersFresh();
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
  const providers = await readProvidersFresh();
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
  const providers = await readProvidersFresh();
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
 * The public Telegram webhook address.
 *
 * Telegram carries the shared secret in its native
 * `X-Telegram-Bot-Api-Secret-Token` header, so the secret never appears in the
 * callback URL or intermediary access logs.
 */
export function telegramWebhookUrl(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";

  if (!supabaseUrl) {
    return null;
  }

  return functionUrl(supabaseUrl, telegramWebhookFunction);
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
/**
 * The bot's command menu, shown by Telegram in private chats.
 *
 * Linking and unlinking are deliberately not commands: they are buttons on the
 * menu keyboard (🔗 Sign in / 🔓 Unlink), which is where customers look for
 * them. These are the store commands every chat sees.
 */
const TELEGRAM_COMMANDS = [
  { command: "start", description: "Menu" },
  { command: "catalog", description: "Browse the catalog" },
  { command: "orders", description: "My orders" },
  { command: "wallet", description: "My balance" },
  { command: "deals", description: "Deals and featured" },
  { command: "search", description: "Search games and packages" },
  { command: "support", description: "Contact support" },
  { command: "language", description: "Switch language" },
  { command: "login", description: "Open my account signed in" },
  { command: "help", description: "Help" },
];

/**
 * The owner's chat gets the store commands plus the operations ones.
 *
 * A chat-scoped command list replaces the default in that chat, so the owner's
 * set must include the customer commands too — the admin menu is a superset,
 * not a different list.
 */
const TELEGRAM_OWNER_COMMANDS = [
  { command: "stats", description: "Store totals and balances" },
  { command: "pending", description: "Recharges waiting for review" },
  { command: "alerts", description: "Alert type guidance" },
  ...TELEGRAM_COMMANDS,
];

async function telegramPost(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; kind: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!response.ok || payload?.ok !== true) {
      const description = payload?.description ?? "";

      return { ok: false, kind: /could not find|unauthorized/i.test(description) ? "auth" : "unknown" };
    }

    return { ok: true, kind: "ok" };
  } catch {
    return { ok: false, kind: "network" };
  }
}

/**
 * Install the bot's command menus (the ☰ button in Telegram).
 *
 * Two menus, so the button is useful to both audiences:
 *
 * - **Default scope** — the store commands every chat sees.
 * - **Owner chat scope** — when the owner chat is registered, it replaces the
 *   default with the operations + store commands, so the owner's ☰ shows
 *   /stats, /pending and the store.
 *
 * A leftover `all_private_chats` scope would shadow the default, so it is
 * cleared first. Webhook registration installs the menus too; this standalone
 * call exists so an owner can re-install them without rotating the webhook
 * secret.
 */
export async function registerTelegramCommands(token: string, ownerChatId: string | null): Promise<{ ok: boolean; kind: string }> {
  // Clear any previously scoped commands first: a leftover `all_private_chats`
  // scope takes precedence over the default and would keep the menu button
  // missing. Then install the default-scope list that shows everywhere.
  await telegramPost(token, "setMyCommands", {
    commands: [],
    scope: { type: "all_private_chats" },
  });

  const results = [
    await telegramPost(token, "setMyCommands", {
      commands: TELEGRAM_COMMANDS,
    }),
  ];

  if (ownerChatId) {
    // The owner's own menu: admin commands first, then the store commands.
    results.push(
      await telegramPost(token, "setMyCommands", {
        commands: TELEGRAM_OWNER_COMMANDS,
        scope: { type: "chat", chat_id: ownerChatId },
      }),
    );

    // Make the square button explicitly the command menu in the owner chat, so
    // a client that has cached an empty list re-reads it.
    await telegramPost(token, "setChatMenuButton", {
      chat_id: ownerChatId,
      menu_button: { type: "commands" },
    });
  }

  return results.every((result) => result.ok) ? { ok: true, kind: "ok" } : results.find((result) => !result.ok) ?? { ok: true, kind: "ok" };
}

export async function registerTelegramWebhook(token: string, secret: string, ownerChatId: string | null): Promise<{
  ok: boolean;
  kind: string;
}> {
  const url = telegramWebhookUrl();

  if (!url) {
    return { ok: false, kind: "invalid_url" };
  }

  try {
    // The command list is part of the same setup: register it with the webhook
    // so Telegram shows a menu button. It is best-effort — a failure here must
    // not fail the registration.
    await registerTelegramCommands(token, ownerChatId);

    const webhookResult = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      }),
    });

    const payload = (await webhookResult.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!webhookResult.ok || payload?.ok !== true) {
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
