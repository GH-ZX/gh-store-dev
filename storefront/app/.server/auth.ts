import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@server/form-data";
import {
  clearLoginFailures,
  isLoginBlockedForAccount,
  isLoginBlockedForIp,
  recordFailedLoginAttempt,
} from "@server/lib/auth/rate-limit";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";
import { strongPasswordSchema } from "@server/lib/auth/password-policy";
import { log } from "@server/lib/logging/logger";
import { hashEmail } from "@server/lib/logging/redact";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
} from "@server/session";
import type { StoreEnvVars } from "@server/env";

/*
 * Sign-in stays lenient about password shape: accounts created before the
 * policy tightened must still log in with their legacy password. The strong
 * policy lives in signUpSchema, where a new password is chosen.
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

function safeRedirect(value: unknown, locale: Locale): string {
  return safeRedirectTarget(value) ?? `/${locale}`;
}

function clientIp(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp?.trim()) return cloudflareIp.trim();
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
}

export type AuthResult =
  | { ok: true; redirect: string }
  | { ok: false; error: string; notice: string | null };

/**
 * Email/password sign-in. Failures return a message key, never whether the
 * email exists, so the form cannot become an account-enumeration oracle.
 * Rate limits burn no credential checks: blocked keys reply before Supabase.
 */
export async function signIn(
  request: Request,
  env: StoreEnvVars | undefined,
  formData: FormData,
  setCookies: (
    cookies: {
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }[],
  ) => void,
): Promise<AuthResult> {
  const parsed = signInSchema.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    locale: formText(formData, "locale"),
    redirectTo: formText(formData, "redirectTo"),
  });

  if (!parsed.success) {
    log.warn("auth", "sign_in_rejected", { reason: "invalid_input" });
    return { ok: false, error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const ip = clientIp(request);
  const emailHash = hashEmail(parsed.data.email);

  if (isLoginBlockedForIp(ip) || isLoginBlockedForAccount(emailHash)) {
    log.warn("auth", "sign_in_throttled", { emailHash });
    return { ok: false, error: "too_many_attempts", notice: null };
  }

  const { supabase, jar } = createSessionClient(request, env);
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  setCookies(jar.cookies);

  if (error) {
    log.warn("auth", "sign_in_failed", { emailHash });
    recordFailedLoginAttempt(ip, emailHash);
    return { ok: false, error: "invalid_credentials", notice: null };
  }

  clearLoginFailures(ip, emailHash);
  log.info("auth", "signed_in", { emailHash });
  return { ok: true, redirect: safeRedirect(parsed.data.redirectTo, locale) };
}

export async function signUp(
  request: Request,
  env: StoreEnvVars | undefined,
  formData: FormData,
  setCookies: (
    cookies: {
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }[],
  ) => void,
): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    locale: formText(formData, "locale"),
    redirectTo: formText(formData, "redirectTo"),
  });

  if (!parsed.success) {
    const passwordFailed = parsed.error.issues.some(
      (issue) => issue.path[0] === "password",
    );
    return {
      ok: false,
      error: passwordFailed ? "weak_password" : "invalid_input",
      notice: null,
    };
  }

  const locale = resolveLocale(parsed.data.locale);
  const { supabase, jar } = createSessionClient(request, env);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: new URL(
        `/auth/callback?locale=${locale}&next=${encodeURIComponent(safeRedirect(parsed.data.redirectTo, locale))}`,
        request.url,
      ).toString(),
    },
  });
  setCookies(jar.cookies);

  if (error) {
    log.warn("auth", "sign_up_failed", {
      emailHash: hashEmail(parsed.data.email),
      error: error.message,
    });
    return { ok: false, error: "signup_failed", notice: null };
  }

  /*
   * With confirmation enabled Supabase returns a user but no session, and a
   * later sign-in on the unconfirmed account reports "invalid credentials" —
   * this is the only chance to explain the wait.
   */
  if (!data.session) {
    log.info("auth", "signed_up", {
      emailHash: hashEmail(parsed.data.email),
      awaitingConfirmation: true,
    });
    return { ok: false, error: "", notice: "confirm_email" };
  }

  log.info("auth", "signed_up", {
    emailHash: hashEmail(parsed.data.email),
    awaitingConfirmation: false,
  });
  return { ok: true, redirect: safeRedirect(parsed.data.redirectTo, locale) };
}

export async function signOut(
  request: Request,
  env: StoreEnvVars | undefined,
  locale: Locale,
  setCookies: (
    cookies: {
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }[],
  ) => void,
): Promise<string> {
  const { supabase, jar } = createSessionClient(request, env);
  await supabase.auth.signOut();
  setCookies(jar.cookies);
  log.info("auth", "signed_out", {});
  return `/${locale}`;
}

/** Current session user id, or null for visitors. */
export async function sessionUserId(
  request: Request,
  env: StoreEnvVars | undefined,
): Promise<string | null> {
  const { supabase } = createSessionClient(request, env);
  return getSessionUserId(supabase);
}

export { redirectToLogin };
