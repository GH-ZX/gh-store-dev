"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import type { AuthActionState } from "@/lib/auth/action-state";
import { formText } from "@/lib/forms/form-data";
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

/**
 * Where to land after signing in.
 *
 * Only a same-origin path is honoured, so a crafted `next` cannot bounce someone
 * to another site with a fresh session. `//host` is rejected explicitly: it is
 * protocol-relative and would leave the origin despite starting with a slash.
 *
 * The default is the account page, not the dashboard. Most people signing in are
 * customers, and sending them to an admin route only to be told they lack access
 * is both confusing and — because the guard redirects an unauthenticated request
 * back to sign-in — a way to bounce between the two while the session cookie
 * settles. An admin arriving from a guarded page still carries `next`.
 */
function safeRedirect(value: unknown, locale: Locale): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return `/${locale}/profile`;
}

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    locale: formText(formData, "locale"),
    redirectTo: formText(formData, "redirectTo"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);
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
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    locale: formText(formData, "locale"),
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
  const locale = resolveLocale(formText(formData, "locale"));
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect(`/${locale}`);
}
