"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { INITIAL_AUTH_STATE, type AuthActionState } from "@/lib/auth/action-state";
import { signInAction, signUpAction } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * Sign-in and sign-up form.
 *
 * One component with two modes, chosen by the URL, so the sign-up state is
 * linkable and survives a reload. Errors come back from the action as keys that
 * are looked up in the message bundle — the action never returns display copy,
 * so it stays locale-agnostic.
 */
export type AuthFormProps = {
  locale: Locale;
  messages: AdminMessages["auth"];
  mode: "sign-in" | "sign-up";
  redirectTo?: string;
  /**
   * Recovery copy lives in the `account` namespace rather than `auth`, so it is
   * handed in separately instead of being looked up here. Reaching for the
   * message barrel from a client component pinned every locale dictionary into
   * the browser bundle — roughly 239KB of JSON, on the login page of all
   * places — because a runtime `getMessages` reference keeps the whole
   * `MESSAGES` table alive through tree shaking.
   */
  forgotPasswordLabel: string;
};

type ErrorKey = keyof AdminMessages["auth"]["errors"];
type NoticeKey = keyof AdminMessages["auth"]["notices"];

function resolveError(messages: AdminMessages["auth"], key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.invalid_input;
}

function resolveNotice(messages: AdminMessages["auth"], key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.notices[key as NoticeKey] ?? null;
}

export function AuthForm({ locale, messages, mode, redirectTo, forgotPasswordLabel }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    isSignUp ? signUpAction : signInAction,
    INITIAL_AUTH_STATE,
  );

  const error = resolveError(messages, state.error);
  const notice = resolveNotice(messages, state.notice);

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      <label className="grid gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.emailLabel}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          dir="ltr"
          className="min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.passwordLabel}</span>
        <input
          type="password"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          dir="ltr"
          className="min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        />
        <span className="text-xs text-[var(--ink-faint)]">
          {isSignUp ? messages.signUpPasswordHint : messages.passwordHint}
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-4 py-3 text-sm text-[var(--success)]"
        >
          {notice}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
      >
        {isSignUp ? messages.signUpAction : messages.signInAction}
      </Button>

      <div role="separator" className="flex items-center gap-3 text-xs text-[var(--ink-faint)]">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span>{messages.orDivider}</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <GoogleSignInButton
        locale={locale}
        redirectTo={redirectTo}
        label={messages.googleSignInAction}
        errorLabel={messages.errors.oauth_failed}
      />

      <Link
        href={isSignUp ? `/${locale}/login` : `/${locale}/login?mode=sign-up`}
        className="text-sm text-[var(--ink-muted)] underline-offset-4 transition-colors duration-[var(--duration)] hover:text-[var(--ink)] hover:underline"
      >
        {isSignUp ? messages.toggleToSignIn : messages.toggleToSignUp}
      </Link>

      {/* Recovery copy lives in the account namespace, so the login page hands it in. */}
      {isSignUp ? null : (
        <Link
          href={`/${locale}/forgot-password`}
          className="text-sm text-[var(--ink-muted)] underline-offset-4 transition-colors duration-[var(--duration)] hover:text-[var(--ink)] hover:underline"
        >
          {forgotPasswordLabel}
        </Link>
      )}
    </form>
  );
}
