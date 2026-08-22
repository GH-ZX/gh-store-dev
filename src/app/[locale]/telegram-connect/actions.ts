"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { UnauthorizedError } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import { logFailure } from "@/lib/logging/logger";
import { mintTelegramConnectCode, unlinkMyTelegram } from "@/lib/services/telegram-link.service";
import { INITIAL_TELEGRAM_STATE, type TelegramActionState } from "@/app/[locale]/profile/telegram-action-state";

/**
 * Telegram connect actions from the connect page.
 *
 * Same contract as the profile page's link actions, but the code is 6 digits
 * and typed rather than copied: the bot's Sign-in button sends the customer
 * here, the page shows the code, and the customer types it back in the chat.
 */

const localeSchema = z.object({ locale: z.string().optional() });

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function mintTelegramConnectCodeAction(
  _state: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  const parsed = localeSchema.safeParse({ locale: formText(formData, "locale") });

  if (!parsed.success) {
    return { ...INITIAL_TELEGRAM_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    const { code, expiresAt } = await mintTelegramConnectCode();

    revalidatePath(`/${locale}/telegram-connect`);

    return { error: null, notice: null, code, expiresAt };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ...INITIAL_TELEGRAM_STATE, error: "not_signed_in" };
    }

    logFailure("account.telegram", "mint_connect_code_failed", error);

    return { ...INITIAL_TELEGRAM_STATE, error: "unknown" };
  }
}

export async function unlinkTelegramAction(
  _state: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  const parsed = localeSchema.safeParse({ locale: formText(formData, "locale") });

  if (!parsed.success) {
    return { ...INITIAL_TELEGRAM_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await unlinkMyTelegram();

    revalidatePath(`/${locale}/telegram-connect`);

    return { ...INITIAL_TELEGRAM_STATE, notice: "unlinked" };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ...INITIAL_TELEGRAM_STATE, error: "not_signed_in" };
    }

    logFailure("account.telegram", "unlink_failed", error);

    return { ...INITIAL_TELEGRAM_STATE, error: "unknown" };
  }
}
