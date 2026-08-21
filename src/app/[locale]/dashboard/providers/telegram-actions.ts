"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText } from "@/lib/forms/form-data";
import { logFailure } from "@/lib/logging/logger";
import { newCallbackSecret } from "@/lib/settings/callback-secret";
import { TELEGRAM_ALERT_TYPES } from "@/lib/settings/telegram-settings";
import {
  getTelegramCredentials,
  readTelegramWebhookState,
  registerTelegramCommands,
  registerTelegramWebhook,
  saveTelegramSettings,
  verifyTelegramBotToken,
} from "@/lib/services/admin-settings.service";
import {
  INITIAL_TELEGRAM_STATE,
  type TelegramActionState,
} from "@/app/[locale]/dashboard/providers/telegram-action-state";

const settingsSchema = z.object({
  botToken: z.string().max(400).optional(),
  enabled: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

function readAlertPrefs(formData: FormData): Record<string, boolean> {
  const prefs: Record<string, boolean> = {};

  for (const type of TELEGRAM_ALERT_TYPES) {
    prefs[type] = formFlag(formData, `alert_${type}`);
  }

  return prefs;
}

export async function saveTelegramSettingsAction(
  _state: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    botToken: formText(formData, "botToken"),
    enabled: formFlag(formData, "enabled"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_TELEGRAM_STATE, error: "invalid_input" };
  }

  try {
    await saveTelegramSettings({
      // An empty field means "keep the saved token", so it is not forwarded.
      botToken: parsed.data.botToken?.trim() ? parsed.data.botToken : undefined,
      enabled: parsed.data.enabled,
      alertPrefs: readAlertPrefs(formData),
    });
  } catch (error) {
    logFailure("admin.providers", "telegram_settings_save_failed", error);

    return { ...INITIAL_TELEGRAM_STATE, error: "unknown" };
  }

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/dashboard/providers`);

  return { ...INITIAL_TELEGRAM_STATE, notice: "saved" };
}

/**
 * Prove the token and read who it belongs to.
 *
 * The equivalent of the G2Bulk "Verify key" button: `getMe` is Telegram's
 * cheapest call and returns the bot's own username, which is the number an
 * owner actually wants to see. The webhook state is read alongside so one
 * button tells them both whether the token works and whether deliveries have a
 * registered address.
 */
export async function verifyTelegramBotAction(
  _state: TelegramActionState,
  _formData: FormData,
): Promise<TelegramActionState> {
  await requireAdmin();

  const { botToken } = await getTelegramCredentials();

  if (!botToken) {
    return { ...INITIAL_TELEGRAM_STATE, error: "missing_key" };
  }

  const bot = await verifyTelegramBotToken(botToken);

  if (!bot.ok) {
    return { ...INITIAL_TELEGRAM_STATE, error: bot.kind };
  }

  const webhook = await readTelegramWebhookState(botToken);

  return {
    error: null,
    notice: "verified",
    bot: { username: bot.username },
    webhook: webhook.ok ? webhook : null,
    generatedSecret: null,
  };
}

/**
 * Register the bot's webhook with Telegram from the dashboard.
 *
 * The manual `setWebhook` curl is replaced by this button: a fresh webhook
 * secret is always generated and saved, then Telegram is told to call the
 * Supabase Edge Function with it (the token is part of the address, exactly
 * like the G2Bulk callback). A fresh token every time is what makes the button
 * a real regenerate — re-running it rotates the secret, which is the point
 * when the current one may have leaked.
 */
export async function registerTelegramWebhookAction(
  _state: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  await requireAdmin();

  const { botToken } = await getTelegramCredentials();

  if (!botToken) {
    return { ...INITIAL_TELEGRAM_STATE, error: "missing_key" };
  }

  const secret = newCallbackSecret();

  // Save first so the Edge Function accepts the secret from the moment Telegram
  // starts calling with it. If Telegram registration then fails, the stored
  // secret has rotated but the function refuses the old address — the dashboard
  // button stays usable and the owner is told what happened.
  try {
    await saveTelegramSettings({ webhookSecret: secret });
  } catch (error) {
    logFailure("admin.providers", "telegram_webhook_secret_failed", error);

    return { ...INITIAL_TELEGRAM_STATE, error: "unknown" };
  }

  const result = await registerTelegramWebhook(botToken, secret);

  if (!result.ok) {
    return { ...INITIAL_TELEGRAM_STATE, error: result.kind };
  }

  revalidatePath(`/${resolveLocale(formText(formData, "locale"))}/dashboard/providers`);

  return { ...INITIAL_TELEGRAM_STATE, notice: "webhook_ready", generatedSecret: secret };
}

/**
 * Install the bot's command menu (the ☰ button in Telegram) on its own.
 *
 * Webhook registration already installs the menu, but it also rotates the
 * webhook secret — not something to do just to refresh a menu. This action
 * only calls setMyCommands, so it is safe to run whenever the commands change.
 */
export async function setTelegramCommandsAction(
  _state: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  await requireAdmin();

  const { botToken } = await getTelegramCredentials();

  if (!botToken) {
    return { ...INITIAL_TELEGRAM_STATE, error: "missing_key" };
  }

  const result = await registerTelegramCommands(botToken);

  if (!result.ok) {
    return { ...INITIAL_TELEGRAM_STATE, error: result.kind };
  }

  return { ...INITIAL_TELEGRAM_STATE, notice: "commands_ready" };
}
