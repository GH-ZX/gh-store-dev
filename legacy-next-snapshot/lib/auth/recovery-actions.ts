"use server";

import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import type { RecoveryActionState } from "@/lib/auth/recovery-action-state";
import { formText } from "@/lib/forms/form-data";
import { buildAbsoluteUrl } from "@/lib/seo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Password recovery request.
 *
 * Only the request half lives on the server. Setting the new password runs in
 * the browser: Supabase delivers a recovery link as a URL *fragment*, which the
 * server never receives, so the recovery session exists on the client only.
 */

const requestSchema = z.object({
  email: z.string().trim().min(3).max(320).pipe(z.email()),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function requestPasswordResetAction(
  _state: RecoveryActionState,
  formData: FormData,
): Promise<RecoveryActionState> {
  const parsed = requestSchema.safeParse({
    email: formText(formData, "email"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const supabase = await createSupabaseServerClient();

  /*
   * The result is deliberately ignored, and the answer below is the same for a
   * registered address, an unknown one, and a rate-limited send. Reporting the
   * difference would turn this form into an account-enumeration oracle.
   */
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildAbsoluteUrl(locale, "/reset-password"),
  });

  return { error: null, notice: "request_sent" };
}
