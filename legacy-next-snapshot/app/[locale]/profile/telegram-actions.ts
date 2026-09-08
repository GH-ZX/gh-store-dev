"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { UnauthorizedError } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import { logFailure } from "@/lib/logging/logger";
import { mintTelegramLinkCode, unlinkMyTelegram } from "@/lib/services/telegram-link.service";
import { INITIAL_TELEGRAM_STATE, type TelegramActionState } from "@/app/[locale]/profile/telegram-action-state";

/**
 * Telegram link actions from the profile page.
 *
 * The code is minted server-side and returned to the form, which displays it
 * for the customer to send to the bot. Unlinking is idempotent — there is
 * nothing wrong with deleting a link that does not exist.
 */

const localeSchema = z.object({ locale: z.string().optional() });

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function mintTelegramLinkCodeAction(
  _state: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  const parsed = localeSchema.safeParse({ locale: formText(formData, "locale") });

  if (!parsed.success) {
    return { ...INITIAL_TELEGRAM_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    const { code, expiresAt } = await mintTelegramLinkCode();

    revalidatePath(`/${locale}/profile`);

    return { error: null, notice: null, code, expiresAt };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ...INITIAL_TELEGRAM_STATE, error: "not_signed_in" };
    }

    logFailure("account.telegram", "mint_code_failed", error);

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

    revalidatePath(`/${locale}/profile`);

    return { ...INITIAL_TELEGRAM_STATE, notice: "unlinked" };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ...INITIAL_TELEGRAM_STATE, error: "not_signed_in" };
    }

    logFailure("account.telegram", "unlink_failed", error);

    return { ...INITIAL_TELEGRAM_STATE, error: "unknown" };
  }
}
