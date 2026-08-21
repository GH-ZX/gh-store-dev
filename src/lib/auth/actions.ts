"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import type { AuthActionState } from "@/lib/auth/action-state";
import { formText } from "@/lib/forms/form-data";
import { log } from "@/lib/logging/logger";
import { hashEmail } from "@/lib/logging/redact";
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
 * The default is the home page for the locale, the least surprising landing
 * spot after sign-in.
 */
function safeRedirect(value: unknown, locale: Locale): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return `/${locale}`;
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
    log.warn("auth", "sign_in_rejected", { reason: "invalid_input" });

    return { error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  /*
   * The address is hashed rather than written down. Ten failures against one
   * hash is someone locked out; ten failures across ten hashes is someone
   * working through a list — and both questions are answerable without Axiom
   * holding a copy of the store's customer emails. The password is never a
   * field, and `redact` would blank it by name if it ever became one.
   */
  if (error) {
    log.warn("auth", "sign_in_failed", { emailHash: hashEmail(parsed.data.email) });

    return { error: "invalid_credentials", notice: null };
  }

  // Before the redirect, always: `redirect` works by throwing, so anything after
  // it is unreachable.
  log.info("auth", "signed_in", { emailHash: hashEmail(parsed.data.email) });

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
    redirectTo: formText(formData, "redirectTo"),
  });

  if (!parsed.success) {
    log.warn("auth", "sign_up_rejected", { reason: "invalid_input" });

    return { error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    log.warn("auth", "sign_up_failed", {
      emailHash: hashEmail(parsed.data.email),
      error: error.message,
    });

    return { error: "signup_failed", notice: null };
  }

  /*
   * With email confirmation enabled Supabase returns a user but no session, and
   * the account cannot be used until the link is followed. It also reports a
   * sign-in attempt on an unconfirmed account as "invalid credentials", so the
   * only chance to explain the wait is here — afterwards the error is
   * indistinguishable from a wrong password.
   */
  if (!data.session) {
    log.info("auth", "signed_up", {
      emailHash: hashEmail(parsed.data.email),
      awaitingConfirmation: true,
    });

    return { error: null, notice: "confirm_email" };
  }

  log.info("auth", "signed_up", {
    emailHash: hashEmail(parsed.data.email),
    awaitingConfirmation: false,
  });

  /*
   * A session means the account is usable now, so carry on into it rather than
   * leaving someone on the form to sign in again with details they just typed.
   */
  revalidatePath("/", "layout");
  redirect(safeRedirect(parsed.data.redirectTo, locale));
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = resolveLocale(formText(formData, "locale"));
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  log.info("auth", "signed_out", {});

  revalidatePath("/", "layout");
  redirect(`/${locale}`);
}
