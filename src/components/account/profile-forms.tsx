"use client";

import { useActionState } from "react";
import { AdminCard, FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AccountMessages } from "@/i18n/messages";
import {
  INITIAL_ACCOUNT_STATE,
  type AccountActionState,
} from "@/app/[locale]/profile/action-state";
import { updatePasswordAction, updateProfileAction } from "@/app/[locale]/profile/actions";

/**
 * Account self-service forms.
 *
 * The actions return message keys; the mapping to wording lives here so the
 * server never has to know the locale. An unrecognised key falls back to the
 * generic failure rather than rendering the key itself.
 */

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

export function ProfileForm({
  locale,
  messages,
  fullName,
  username,
  email,
}: {
  locale: Locale;
  messages: AccountMessages;
  fullName: string | null;
  username: string | null;
  email: string | null;
}) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(
    updateProfileAction,
    INITIAL_ACCOUNT_STATE,
  );

  return (
    <AdminCard title={messages.profile.title} description={messages.profile.description}>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={messages.profile.fullName}
            name="fullName"
            defaultValue={fullName ?? ""}
            maxLength={120}
            autoComplete="name"
          />
          <TextField
            label={messages.profile.username}
            hint={messages.profile.usernameHint}
            name="username"
            defaultValue={username ?? ""}
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            dir="ltr"
            autoComplete="username"
          />
        </div>

        <TextField
          label={messages.profile.email}
          hint={messages.profile.emailHint}
          defaultValue={email ?? ""}
          dir="ltr"
          disabled
          readOnly
        />

        <FormResult
          error={resolveError(messages, state.error)}
          notice={state.notice === "profile_saved" ? messages.profile.saved : null}
        />

        <div>
          <Button type="submit" disabled={pending}>
            {messages.profile.saveAction}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}

export function PasswordForm({
  locale,
  messages,
}: {
  locale: Locale;
  messages: AccountMessages;
}) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(
    updatePasswordAction,
    INITIAL_ACCOUNT_STATE,
  );

  return (
    <AdminCard title={messages.password.title} description={messages.password.description}>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={messages.password.newPassword}
            name="password"
            type="password"
            minLength={8}
            required
            dir="ltr"
            autoComplete="new-password"
          />
          <TextField
            label={messages.password.confirmPassword}
            name="confirmPassword"
            type="password"
            minLength={8}
            required
            dir="ltr"
            autoComplete="new-password"
          />
        </div>

        <FormResult
          error={resolveError(messages, state.error)}
          notice={state.notice === "password_saved" ? messages.password.saved : null}
        />

        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {messages.password.saveAction}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}
