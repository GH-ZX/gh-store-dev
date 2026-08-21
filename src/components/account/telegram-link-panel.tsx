"use client";

import { useActionState, useState } from "react";
import { FormResult } from "@/components/admin/admin-form";
import { TelegramIcon } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AccountMessages } from "@/i18n/messages";
import { INITIAL_TELEGRAM_STATE, type TelegramActionState } from "@/app/[locale]/profile/telegram-action-state";
import { mintTelegramLinkCodeAction, unlinkTelegramAction } from "@/app/[locale]/profile/telegram-actions";

/**
 * Link the Telegram bot to the store account.
 *
 * The bot never sees a password: this panel mints a short-lived code, and the
 * customer sends it to the bot to prove they own the account. The code is shown
 * in full — the customer has to type it — and expires server-side in ten
 * minutes. Re-minting retires the previous code, so an old one cannot be raced.
 */
export function TelegramLinkPanel({
  locale,
  messages,
  linked,
  chatLabel,
  linkedAt,
}: {
  locale: Locale;
  messages: AccountMessages;
  linked: boolean;
  chatLabel: string | null;
  linkedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState<TelegramActionState, FormData>(
    mintTelegramLinkCodeAction,
    INITIAL_TELEGRAM_STATE,
  );
  const [unlinkState, unlinkAction, unlinkPending] = useActionState<TelegramActionState, FormData>(
    unlinkTelegramAction,
    INITIAL_TELEGRAM_STATE,
  );
  const [copied, setCopied] = useState(false);

  const code = state.code ?? null;

  return (
    <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
      <div className="flex items-start gap-3">
        <p className="flex items-center gap-2 text-xs font-medium text-[var(--ink-faint)]">
          <TelegramIcon className="size-4 text-[var(--accent)]" />
          {messages.telegram.title}
        </p>
      </div>

      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
        {linked
          ? messages.telegram.linkedDescription
          : messages.telegram.unlinkedDescription}
      </p>

      {linked ? (
        <div className="mt-5 grid gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--ink)]">{chatLabel}</span>
            <span className="text-xs text-[var(--ink-faint)]" dir="ltr">
              {linkedAt ? formatExpiry(linkedAt, locale) : ""}
            </span>
          </div>

          <form action={unlinkAction} className="grid gap-4">
            <input type="hidden" name="locale" value={locale} />
            <FormResult
              error={resolveError(messages, unlinkState.error)}
              notice={unlinkState.notice === "unlinked" ? messages.telegram.unlinked : null}
            />
            <div>
              <Button type="submit" variant="secondary" disabled={unlinkPending}>
                {messages.telegram.unlinkAction}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <form action={formAction} className="mt-5 grid gap-4">
          <input type="hidden" name="locale" value={locale} />

          {code ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--ink-faint)]">{messages.telegram.codeHint}</p>
                  <p className="mt-1 text-lg font-semibold tracking-widest text-[var(--accent)]" dir="ltr">
                    {code}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={copied ? <CheckIcon /> : undefined}
                  onClick={() => {
                    void navigator.clipboard.writeText(code).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                >
                  {copied ? messages.telegram.codeCopied : messages.telegram.codeCopy}
                </Button>
              </div>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">
                {messages.telegram.codeExpiry} {formatExpiry(state.expiresAt, locale)}
              </p>
            </div>
          ) : null}

          <FormResult
            error={resolveError(messages, state.error)}
            notice={state.notice === "linked" ? messages.telegram.linked : null}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {code ? messages.telegram.newCodeAction : messages.telegram.linkAction}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

type ErrorKey = keyof AccountMessages["errors"];

function resolveError(messages: AccountMessages, key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.unknown;
}

function formatExpiry(iso: string | null, locale: Locale): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  const dateTime = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return dateTime.format(date);
}
