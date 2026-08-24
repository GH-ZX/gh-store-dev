"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AccountMessages, AdminMessages } from "@/i18n/messages";
import { MIN_PASSWORD_LENGTH, strongPasswordSchema } from "@/lib/auth/password-policy";
import { formText } from "@/lib/forms/form-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Set a new password from a recovery link.
 *
 * Supabase delivers recovery as a URL *fragment* (`#access_token=…`), which the
 * browser never sends to the server — so both halves of this screen have to run
 * on the client: detecting the recovery session, and the `updateUser` call that
 * spends it. A server action would simply have no session to act on.
 *
 * Until the session is confirmed the form is not rendered at all: offering a
 * password field that cannot possibly save is worse than saying the link died.
 */
export type ResetPasswordFormProps = {
  locale: Locale;
  messages: AccountMessages;
  authMessages: AdminMessages["auth"];
  /** `common.states.loading`, shown while the recovery session is being checked. */
  loadingLabel: string;
};

type Status = "checking" | "ready" | "expired" | "done";

const FIELD_CLASSES =
  "min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]";

type ErrorKey = keyof AccountMessages["errors"];

function resolveError(messages: AccountMessages, key: string | null): string | null {
  if (!key) {
    return null;
  }

  if (key === "mismatch") {
    return messages.password.mismatch;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.unknown;
}

export function ResetPasswordForm({
  locale,
  messages,
  authMessages,
  loadingLabel,
}: ResetPasswordFormProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    /*
     * Both paths are needed: `onAuthStateChange` catches the PASSWORD_RECOVERY
     * event the client emits after it parses the fragment, and `getSession`
     * covers the case where that already happened before this effect ran.
     */
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) {
        return;
      }

      // Never walk back over a finished reset: USER_UPDATED fires after saving.
      setStatus((current) => (current === "done" ? current : "ready"));
    });

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!active) {
        return;
      }

      setStatus((current) => {
        if (current !== "checking") {
          return current;
        }

        return sessionData.session ? "ready" : "expired";
      });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = formText(formData, "password") ?? "";
    const confirmPassword = formText(formData, "confirmPassword") ?? "";

    if (!strongPasswordSchema.safeParse(password).success) {
      setErrorKey("weak_password");
      return;
    }

    if (password !== confirmPassword) {
      setErrorKey("mismatch");
      return;
    }

    setErrorKey(null);
    setPending(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    /*
     * Same rule as the profile page: a reset is a statement that the old
     * credentials leaked, so every other session dies. The recovery session
     * on this device survives.
     */
    if (!error) {
      await supabase.auth.signOut({ scope: "others" });
    }

    setPending(false);

    if (error) {
      setErrorKey("unknown");
      return;
    }

    form.reset();
    setStatus("done");
  }

  if (status === "checking") {
    return (
      <p role="status" className="text-sm text-[var(--ink-muted)]">
        {loadingLabel}
      </p>
    );
  }

  if (status === "expired") {
    return (
      <div className="grid gap-5">
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {messages.recovery.linkExpired}
        </p>

        <ButtonLink
          href={`/${locale}/forgot-password`}
          variant="secondary"
          size="lg"
          trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
        >
          {messages.recovery.requestTitle}
        </ButtonLink>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="grid gap-5">
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-4 py-3 text-sm text-[var(--success)]"
        >
          {messages.recovery.resetDone}
        </p>

        <ButtonLink
          href={`/${locale}/login`}
          size="lg"
          trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
        >
          {authMessages.signInAction}
        </ButtonLink>
      </div>
    );
  }

  const error = resolveError(messages, errorKey);

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="grid gap-5"
    >
      <label className="grid gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">
          {messages.password.newPassword}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          dir="ltr"
          className={FIELD_CLASSES}
        />
        <span className="text-xs text-[var(--ink-faint)]">{messages.password.hint}</span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">
          {messages.password.confirmPassword}
        </span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          dir="ltr"
          className={FIELD_CLASSES}
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
      >
        {messages.recovery.resetAction}
      </Button>
    </form>
  );
}
