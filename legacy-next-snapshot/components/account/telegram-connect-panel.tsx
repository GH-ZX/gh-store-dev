"use client";

import { useActionState, useState } from "react";
import { FormResult } from "@/components/admin/admin-form";
import { TelegramIcon } from "@/components/ui/brand-icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AccountMessages } from "@/i18n/messages";
import { INITIAL_TELEGRAM_STATE, type TelegramActionState } from "@/app/[locale]/profile/telegram-action-state";
import {
  mintTelegramConnectCodeAction,
  unlinkTelegramAction,
} from "@/app/[locale]/telegram-connect/actions";

/**
 * Connect the Telegram bot from the store, the flow the bot's Sign-in button
 * points at.
 *
 * The customer is already signed in on this page. Tapping the button mints a
 * 6-digit code they type back in the chat — no copy-paste, no password. Once
 * the bot accepts it, the chat is linked to this account and the page flips to
 * the connected state.
 */
export function TelegramConnectPanel({
  locale,
  messages,
  linked,
  chatLabel,
  linkedAt,
  botUsername,
}: {
  locale: Locale;
  messages: AccountMessages;
  linked: boolean;
  chatLabel: string | null;
  linkedAt: string | null;
  botUsername: string | null;
}) {
  const [state, formAction, pending] = useActionState<TelegramActionState, FormData>(
    mintTelegramConnectCodeAction,
    INITIAL_TELEGRAM_STATE,
  );
  const [unlinkState, unlinkAction, unlinkPending] = useActionState<TelegramActionState, FormData>(
    unlinkTelegramAction,
    INITIAL_TELEGRAM_STATE,
  );
  const [copied, setCopied] = useState(false);

  const code = state.code ?? null;
  const bot = botUsername ? `@${botUsername.replace(/^@/, "")}` : null;
  // Only a configured bot gets an affordance — an internal page dressed up as
  // "Open the bot" in a new tab would be a lie about where the click leads.
  const botLink = bot ? `https://t.me/${bot.slice(1)}` : null;

  return (
    <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
      <div className="flex items-start gap-3">
        <p className="flex items-center gap-2 text-xs font-medium text-[var(--ink-faint)]">
          <TelegramIcon className="size-4 text-[var(--accent)]" />
          {messages.telegramConnect.title}
        </p>
      </div>

      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
        {linked
          ? messages.telegramConnect.linkedDescription
          : messages.telegramConnect.unlinkedDescription}
      </p>

      {linked ? (
        <div className="mt-5 grid gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--ink)]">{chatLabel}</span>
            <span className="text-xs text-[var(--ink-faint)]" dir="ltr">
              {linkedAt ? formatExpiry(linkedAt, locale) : ""}
            </span>
          </div>

          {botLink ? (
            <div>
              <ButtonLink href={botLink} target="_blank" rel="noopener noreferrer" variant="secondary">
                {messages.telegramConnect.openBotAction}
              </ButtonLink>
            </div>
          ) : null}

          <form action={unlinkAction} className="grid gap-4">
            <input type="hidden" name="locale" value={locale} />
            <FormResult
              error={resolveError(messages, unlinkState.error)}
              notice={unlinkState.notice === "unlinked" ? messages.telegramConnect.unlinked : null}
            />
            <div>
              <Button type="submit" variant="secondary" disabled={unlinkPending}>
                {messages.telegramConnect.unlinkAction}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <form action={formAction} className="mt-5 grid gap-4">
          <input type="hidden" name="locale" value={locale} />

          {code ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3">
              <p className="text-xs text-[var(--ink-faint)]">
                {messages.telegramConnect.codeHint}
                {bot ? (
                  <>
                    {" "}
                    <span dir="ltr" className="font-medium text-[var(--ink-soft)]">
                      {bot}
                    </span>
                  </>
                ) : null}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-2xl font-semibold tracking-[0.3em] text-[var(--accent)]" dir="ltr">
                  {code}
                </p>
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
                  {copied ? messages.telegramConnect.codeCopied : messages.telegramConnect.codeCopy}
                </Button>
              </div>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">
                {messages.telegramConnect.codeExpiry} {formatExpiry(state.expiresAt, locale)}
              </p>
            </div>
          ) : null}

          {botLink ? (
            <p className="text-xs leading-5 text-[var(--ink-muted)]">
              {messages.telegramConnect.openBotHint}{" "}
              <a
                href={botLink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                dir="ltr"
              >
                {bot}
              </a>
            </p>
          ) : null}

          <FormResult
            error={resolveError(messages, state.error)}
            notice={state.notice === "linked" ? messages.telegramConnect.linked : null}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {code ? messages.telegramConnect.newCodeAction : messages.telegramConnect.getCodeAction}
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
