"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import type { AuthActionState } from "@/lib/auth/action-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Authentication actions.
 *
 * Deliberately minimal: enough for an administrator to reach the dashboard. The
 * full customer account experience — profile, wallet, recovery, notifications —
 * is a later stage.
 *
 * Failures return a message rather than throwing, so the form can render it. The
 * message never says whether an email exists, which would turn the sign-in form
 * into an account-enumeration oracle.
 */

const credentialsSchema = z.object({
  email: z.string().trim().min(3).max(320).pipe(z.email()),
  password: z.string().min(8).max(128),
  locale: z.string().optional(),
  redirectTo: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Only same-origin paths may be used as a post-login destination. */
function safeRedirect(value: unknown, locale: Locale): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return `/${locale}/dashboard`;
}

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    locale: formData.get("locale"),
    redirectTo: formData.get("redirectTo"),
  });

  const locale = resolveLocale(formData.get("locale"));

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "invalid_credentials", notice: null };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirect(parsed.data.redirectTo, locale));
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "signup_failed", notice: null };
  }

  // With email confirmation enabled Supabase returns a user but no session, so
  // the account is not usable until the link is followed.
  if (!data.session) {
    return { error: null, notice: "confirm_email" };
  }

  revalidatePath("/", "layout");

  return { error: null, notice: "signed_up" };
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect(`/${locale}`);
}
