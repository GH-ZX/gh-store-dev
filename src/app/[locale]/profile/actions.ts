"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { UnauthorizedError } from "@/lib/auth/guards";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import { formText } from "@/lib/forms/form-data";
import { log } from "@/lib/logging/logger";
import { updateMyProfile, UsernameTakenError } from "@/lib/services/profile.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AccountActionState } from "@/app/[locale]/profile/action-state";

/**
 * Account self-service actions.
 *
 * Both return message keys rather than prose. Neither can change anything but
 * the caller's own presentation fields or password.
 */

const profileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/i, "Letters, numbers, and underscores only")
    .optional(),
  locale: z.string().optional(),
});

const passwordSchema = z.object({
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1).max(128),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function updateProfileAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = profileSchema.safeParse({
    fullName: formText(formData, "fullName"),
    username: formText(formData, "username"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await updateMyProfile({
      fullName: parsed.data.fullName ?? null,
      username: parsed.data.username ?? null,
    });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return { error: "username_taken", notice: null };
    }

    if (error instanceof UnauthorizedError) {
      return { error: "not_signed_in", notice: null };
    }

    return { error: "unknown", notice: null };
  }

  revalidatePath(`/${locale}/profile`);
  // The header greets the customer by name, and it renders on every page.
  revalidatePath("/", "layout");

  return { error: null, notice: "profile_saved" };
}

export async function updatePasswordAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = passwordSchema.safeParse({
    password: formText(formData, "password"),
    confirmPassword: formText(formData, "confirmPassword"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "weak_password", notice: null };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "mismatch", notice: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub) {
    return { error: "not_signed_in", notice: null };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: "unknown", notice: null };
  }

  /*
   * A password change is a statement that the old credentials may be
   * compromised, so every other session dies here — refresh tokens included,
   * which is what makes revocation real. `scope: "others"` spares the session
   * on this device; the customer keeps working, a thief with the old cookie
   * does not.
   */
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });

  if (signOutError) {
    // Non-fatal: the password itself has already changed, and the next token
    // rotation re-evaluates against the new one.
    log.warn("auth", "password_change_revoke_failed", { error: signOutError.message });
  }

  log.info("auth", "password_changed_others_revoked", {});

  return { error: null, notice: "password_saved" };
}
