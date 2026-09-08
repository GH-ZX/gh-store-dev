"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AccountMessages, AdminMessages } from "@/i18n/messages";
import {
  INITIAL_RECOVERY_STATE,
  type RecoveryActionState,
} from "@/lib/auth/recovery-action-state";
import { requestPasswordResetAction } from "@/lib/auth/recovery-actions";

/**
 * Request a password reset link.
 *
 * The action returns message keys, so the wording is resolved here and the
 * server stays locale-agnostic. The success notice is shown for every submitted
 * address — see the action for why.
 */
export type ForgotPasswordFormProps = {
  locale: Locale;
  messages: AccountMessages;
  authMessages: AdminMessages["auth"];
};

const FIELD_CLASSES =
  "min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]";

type ErrorKey = keyof AccountMessages["errors"];

function resolveError(messages: AccountMessages, key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.unknown;
}

export function ForgotPasswordForm({ locale, messages, authMessages }: ForgotPasswordFormProps) {
  const [state, formAction, pending] = useActionState<RecoveryActionState, FormData>(
    requestPasswordResetAction,
    INITIAL_RECOVERY_STATE,
  );

  const error = resolveError(messages, state.error);
  const sent = state.notice === "request_sent";

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />

      <label className="grid gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">{authMessages.emailLabel}</span>
        <input type="email" name="email" required autoComplete="email" dir="ltr" className={FIELD_CLASSES} />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      {sent ? (
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-4 py-3 text-sm text-[var(--success)]"
        >
          {messages.recovery.requestSent}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
      >
        {messages.recovery.requestAction}
      </Button>

      <Link
        href={`/${locale}/login`}
        className="text-sm text-[var(--ink-muted)] underline-offset-4 transition-colors duration-[var(--duration)] hover:text-[var(--ink)] hover:underline"
      >
        {authMessages.toggleToSignIn}
      </Link>
    </form>
  );
}
