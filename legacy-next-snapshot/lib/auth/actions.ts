"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import type { AuthActionState } from "@/lib/auth/action-state";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import {
  clearLoginFailures,
  isLoginBlockedForAccount,
  isLoginBlockedForIp,
  recordFailedLoginAttempt,
} from "@/lib/auth/rate-limit";
import { safeRedirectTarget } from "@/lib/auth/redirect-target";
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

/*
 * Sign-in stays lenient about password shape: accounts created before the
 * policy tightened must still be able to log in with their legacy password.
 * The strong policy lives in signUpSchema, where a new password is chosen.
 */
const signInSchema = z.object({
  email: z.string().trim().min(3).max(320).pipe(z.email()),
  password: z.string().min(1).max(128),
  locale: z.string().optional(),
  redirectTo: z.string().optional(),
});

const signUpSchema = z.object({
  email: z.string().trim().min(3).max(320).pipe(z.email()),
  password: strongPasswordSchema,
  locale: z.string().optional(),
  redirectTo: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Where to land after signing in.
 *
 * Delegates to `safeRedirectTarget`, which canonicalizes the value with the
 * WHATWG URL parser and refuses anything that is not a same-origin path —
 * including the backslash trick (`/\host`), which browsers normalize into a
 * protocol-relative URL and which plain prefix checks wave straight through.
 *
 * The default is the home page for the locale, the least surprising landing
 * spot after sign-in.
 */
function safeRedirect(value: unknown, locale: Locale): string {
  return safeRedirectTarget(value) ?? `/${locale}`;
}

/**
 * Best-effort client address for throttling. Cloudflare sets
 * `cf-connecting-ip`; the forwarded list is the fallback elsewhere, taking
 * the leftmost hop. An absent address degrades gracefully: the limiter
 * simply never matches that empty key.
 */
async function requestIp(): Promise<string> {
  const headerList = await headers();
  const cloudflareIp = headerList.get("cf-connecting-ip");

  if (cloudflareIp?.trim()) {
    return cloudflareIp.trim();
  }

  return (headerList.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
}

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
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
  const ip = await requestIp();
  const emailHash = hashEmail(parsed.data.email);

  /*
   * Checked before touching Supabase so a blocked key burns no credential
   * checks at all. The reply says only "too many attempts": it admits someone
   * is being throttled, never that an account exists.
   */
  if (isLoginBlockedForIp(ip) || isLoginBlockedForAccount(emailHash)) {
    log.warn("auth", "sign_in_throttled", { emailHash });

    return { error: "too_many_attempts", notice: null };
  }

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
    log.warn("auth", "sign_in_failed", { emailHash });
    recordFailedLoginAttempt(ip, emailHash);

    return { error: "invalid_credentials", notice: null };
  }

  clearLoginFailures(ip, emailHash);

  // Before the redirect, always: `redirect` works by throwing, so anything after
  // it is unreachable.
  log.info("auth", "signed_in", { emailHash });

  revalidatePath("/", "layout");
  redirect(safeRedirect(parsed.data.redirectTo, locale));
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    locale: formText(formData, "locale"),
    redirectTo: formText(formData, "redirectTo"),
  });

  if (!parsed.success) {
    log.warn("auth", "sign_up_rejected", { reason: "invalid_input" });

    /*
     * A password that fails the policy is reported as such, so the customer
     * learns the rule instead of a generic rejection; anything else (a bad
     * email, mostly) stays generic.
     */
    const passwordFailed = parsed.error.issues.some((issue) => issue.path[0] === "password");

    return { error: passwordFailed ? "weak_password" : "invalid_input", notice: null };
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
