import { z } from "zod";
import { maskSecret } from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

/**
 * Owner Telegram alerts, stored in `store_settings.telegram`.
 *
 * The Worker drains `telegram_alerts` on its cron and posts them to the owner's
 * chat; this module is the admin half — reading and writing the bot token, the
 * enabled flag, and which alert types are wanted. The token is server-only and
 * comes back masked, exactly like the provider keys.
 *
 * The webhook secret lives here too so the dashboard can register the webhook
 * with Telegram itself instead of asking the owner to run curl. The Worker
 * accepts the stored secret as a fallback when the environment secret is not
 * set.
 */

export const TELEGRAM_ALERT_TYPES = [
  "order_placed",
  "order_failed",
  "recharge_request",
  "support_message",
  "low_wallet",
  "sweep_stalled",
] as const;

export type TelegramAlertType = (typeof TELEGRAM_ALERT_TYPES)[number];

const alertPrefsSchema = z.record(z.string(), z.boolean());

const telegramSettingsSchema = z.object({
  bot_token: z.string().nullish(),
  webhook_secret: z.string().nullish(),
  chat_id: z.string().nullish(),
  /** The bot's @username, so customer pages can say which bot to contact. */
  bot_username: z.string().nullish(),
  enabled: z.boolean().optional().catch(undefined),
  alert_prefs: alertPrefsSchema.nullish(),
  linked_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type TelegramCredentials = {
  botToken: string | null;
  webhookSecret: string | null;
};

export type TelegramStatus = {
  configured: boolean;
  /** Masked tail of the stored token, for confirming *which* bot is saved. */
  keyHint: string | null;
  enabled: boolean;
  /** Whether the owner's chat has been registered through /start. */
  chatLinked: boolean;
  chatId: string | null;
  /** Whether a webhook secret exists, and therefore the bot is registered. */
  webhookConfigured: boolean;
  /**
   * The webhook secret in full. Admin-only and treated like a password, the
   * same stance the G2Bulk callback takes: it is the secret the webhook is
   * registered under, and an owner may need to compare it against the Worker
   * secret or re-enter it elsewhere.
   */
  webhookSecret: string | null;
  alertPrefs: Record<string, boolean>;
  updatedAt: string | null;
};

/** Every alert type is on unless an admin turns one off. */
export function defaultAlertPrefs(): Record<string, boolean> {
  return Object.fromEntries(TELEGRAM_ALERT_TYPES.map((type) => [type, true]));
}

/**
 * Normalize the stored `telegram` column value to the settings object.
 *
 * The app writes the column as `{ telegram: { ... } }` (wrapped) and reads it
 * back through the schema. The edge function used to write it flat
 * (`{ bot_token, ... }`) — accept both so a row written either way keeps
 * working everywhere.
 */
function unwrapTelegram(settings: unknown): unknown {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const record = settings as Record<string, unknown>;

    if (record.telegram && typeof record.telegram === "object" && !Array.isArray(record.telegram)) {
      return record.telegram;
    }
  }

  return settings;
}

export function readTelegramCredentials(settings: unknown): TelegramCredentials {
  const parsed = telegramSettingsSchema.safeParse(unwrapTelegram(settings));
  const telegram = parsed.success ? parsed.data : undefined;

  return {
    botToken: telegram?.bot_token?.trim() || null,
    webhookSecret: telegram?.webhook_secret?.trim() || null,
  };
}

export function readTelegramWebhookSecret(settings: unknown): string | null {
  return readTelegramCredentials(settings).webhookSecret;
}

export function readTelegramAlertPrefs(settings: unknown): Record<string, boolean> {
  const parsed = telegramSettingsSchema.safeParse(unwrapTelegram(settings));
  const prefs = parsed.success ? parsed.data?.alert_prefs : undefined;

  if (!prefs) {
    return defaultAlertPrefs();
  }

  // Unknown types are dropped rather than trusted: a stale pref for a type the
  // store no longer emits should not silently survive into every delivery.
  const merged: Record<string, boolean> = defaultAlertPrefs();

  for (const type of TELEGRAM_ALERT_TYPES) {
    if (typeof prefs[type] === "boolean") {
      merged[type] = prefs[type];
    }
  }

  return merged;
}

export function toTelegramStatus(settings: unknown): TelegramStatus {
  const parsed = telegramSettingsSchema.safeParse(unwrapTelegram(settings));
  const telegram = parsed.success ? parsed.data : undefined;
  const credentials = readTelegramCredentials(settings);

  return {
    configured: credentials.botToken !== null,
    keyHint: maskSecret(credentials.botToken),
    enabled: telegram?.enabled !== false && credentials.botToken !== null,
    chatLinked: Boolean(telegram?.chat_id?.trim()),
    chatId: telegram?.chat_id?.trim() ?? null,
    webhookConfigured: credentials.webhookSecret !== null,
    webhookSecret: credentials.webhookSecret,
    alertPrefs: readTelegramAlertPrefs(settings),
    updatedAt: telegram?.updated_at ?? null,
  };
}

export type TelegramSettingsUpdate = {
  botToken?: string;
  webhookSecret?: string;
  botUsername?: string;
  enabled?: boolean;
  alertPrefs?: Record<string, boolean>;
};

/** The stored bot @username, if the admin has verified the bot at least once. */
export function readTelegramBotUsername(settings: unknown): string | null {
  const parsed = telegramSettingsSchema.safeParse(unwrapTelegram(settings));
  const username = parsed.success ? parsed.data?.bot_username : undefined;

  return typeof username === "string" && username.trim() ? username.trim() : null;
}

/**
 * Merge an update into the stored `store_settings.telegram` object.
 *
 * An omitted token leaves the stored one alone (change the alert prefs without
 * re-entering the secret); an explicit empty string clears it. The webhook
 * secret is generated rather than typed, so it is carried across unless the
 * update replaces it. Unknown keys are preserved, the same rule the provider
 * settings follow.
 */
export function mergeTelegramSettings(
  settings: Json | null | undefined,
  update: TelegramSettingsUpdate,
  updatedAt: string,
): Json {
  const base: Record<string, Json | undefined> =
    unwrapTelegram(settings) && typeof unwrapTelegram(settings) === "object" && !Array.isArray(unwrapTelegram(settings))
      ? { ...(unwrapTelegram(settings) as Record<string, Json>) }
      : {};

  const parsed = telegramSettingsSchema.safeParse(unwrapTelegram(settings));
  const storedFlag = parsed.success ? parsed.data?.enabled : undefined;
  const current = readTelegramCredentials(settings);
  const suppliedToken = update.botToken?.trim();
  const nextToken = update.botToken === undefined ? current.botToken : suppliedToken || null;

  // The app writes the column as `{ telegram: { ... } }`. Always wrap so a
  // flat row (older edge function write) is normalized on the next save.
  return {
    telegram: {
      ...base,
      bot_token: nextToken,
      webhook_secret: update.webhookSecret ?? current.webhookSecret,
      bot_username: update.botUsername?.trim() || readTelegramBotUsername(settings),
      enabled: update.enabled ?? (nextToken === null ? false : suppliedToken ? true : storedFlag !== false),
      alert_prefs: update.alertPrefs ?? readTelegramAlertPrefs(settings),
      updated_at: updatedAt,
    },
  };
}
