"use client";

import { useActionState } from "react";
import { FormResult } from "@/components/admin/admin-form";
import { SecretField } from "@/components/admin/secret-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type AdminMessages } from "@/i18n/messages";
import { TELEGRAM_ALERT_TYPES, type TelegramStatus } from "@/lib/settings/telegram-settings";
import {
  INITIAL_TELEGRAM_STATE,
  type TelegramActionState,
} from "@/app/[locale]/dashboard/providers/telegram-action-state";
import {
  registerTelegramWebhookAction,
  saveTelegramSettingsAction,
  verifyTelegramBotAction,
} from "@/app/[locale]/dashboard/providers/telegram-actions";

type Messages = AdminMessages["providers"]["telegram"];

function resolveError(messages: Messages, key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as keyof Messages["errors"]] ?? messages.errors.unknown;
}

/**
 * The owner Telegram bot.
 *
 * The token behaves like the provider keys: typed once, stored server-side,
 * afterwards represented only by a masked tail. The switch and the per-type
 * toggles are what the dashboard is for — an owner picks which events reach
 * Telegram. The webhook is registered from here too, so the manual `setWebhook`
 * curl is no longer part of setup.
 */
export function TelegramSettingsForm({
  locale,
  messages,
  status,
  secrets,
}: {
  locale: Locale;
  messages: Messages;
  status: TelegramStatus;
  secrets: AdminMessages["providers"]["secrets"];
}) {
  const [saveState, saveAction, saving] = useActionState<TelegramActionState, FormData>(
    saveTelegramSettingsAction,
    INITIAL_TELEGRAM_STATE,
  );
  const [verifyState, verifyAction, verifying] = useActionState<TelegramActionState, FormData>(
    verifyTelegramBotAction,
    INITIAL_TELEGRAM_STATE,
  );
  const [webhookState, webhookAction, registering] = useActionState<TelegramActionState, FormData>(
    registerTelegramWebhookAction,
    INITIAL_TELEGRAM_STATE,
  );

  const error = resolveError(messages, saveState.error ?? verifyState.error ?? webhookState.error);
  const notice =
    saveState.notice === "saved" ? messages.saved : webhookState.notice === "webhook_ready" ? messages.webhookReady : null;
  const verifiedBot = verifyState.bot ?? (verifyState.notice === "verified" ? { username: null } : null);
  const verifiedWebhook = verifyState.webhook;

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />

        <SecretField
          label={messages.botTokenLabel}
          name="botToken"
          placeholder={messages.botTokenPlaceholder}
          hint={messages.botTokenHelp}
          keepHint={messages.botTokenKeepHelp}
          lockedHint={secrets.lockedHint}
          editLabel={secrets.editAction}
          cancelLabel={secrets.cancelAction}
          configured={status.configured}
        />

        <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={status.enabled}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--ink)]">{messages.enabledLabel}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">{messages.enabledHelp}</span>
          </span>
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-xs font-medium text-[var(--ink-soft)]">{messages.alertTypesLabel}</legend>
          <p className="text-xs leading-5 text-[var(--ink-faint)]">{messages.alertTypesHelp}</p>

          {TELEGRAM_ALERT_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-3 py-2.5"
            >
              <input
                type="checkbox"
                name={`alert_${type}`}
                defaultChecked={status.alertPrefs[type] !== false}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--ink)]">{messages.alertTypes[type]}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {messages.saveAction}
          </Button>
          {saveState.notice === "saved" ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.saved}
            </Badge>
          ) : null}
        </div>
      </form>

      <form action={verifyAction} className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary" disabled={verifying || !status.configured}>
          {messages.testAction}
        </Button>

        {verifiedBot ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.verified}
            </Badge>
            {verifiedBot.username ? (
              <span className="text-[var(--ink-muted)]">
                {messages.accountLabel}: <span dir="ltr">@{verifiedBot.username}</span>
              </span>
            ) : null}
            {status.chatLinked ? (
              <Badge tone="accent">{messages.chatLinked}</Badge>
            ) : (
              <span className="text-xs leading-5 text-[var(--warning)]">{messages.chatNotLinked}</span>
            )}
          </div>
        ) : null}
      </form>

      <div className="grid gap-3 border-t border-[var(--line)] pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.webhookTitle}</h3>
          <Badge tone={status.webhookConfigured ? "success" : "neutral"}>
            {status.webhookConfigured ? messages.webhookOn : messages.webhookOff}
          </Badge>
        </div>
        <p className="text-xs leading-5 text-[var(--ink-muted)]">{messages.webhookHelp}</p>

        {verifiedWebhook?.url ? (
          <div className="grid gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-4 py-3 text-xs leading-5">
            <span className="text-[var(--ink-faint)]">{messages.webhookRegisteredUrl}</span>
            <code dir="ltr" className="break-all font-mono text-[var(--ink-soft)]">
              {verifiedWebhook.url}
            </code>
            {verifiedWebhook.pendingUpdateCount > 0 ? (
              <span className="text-[var(--warning)]">
                {formatMessage(messages.webhookPendingCount, { count: verifiedWebhook.pendingUpdateCount }, locale)}
              </span>
            ) : null}
            {verifiedWebhook.lastError ? (
              <span className="text-[var(--danger)]">
                {messages.webhookLastError}: {verifiedWebhook.lastError}
              </span>
            ) : null}
          </div>
        ) : null}

        <form action={webhookAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary" size="sm" disabled={registering || !status.configured}>
            {status.webhookConfigured ? messages.webhookRegenerate : messages.webhookRegister}
          </Button>
          {status.webhookConfigured ? (
            <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.webhookRegenerateHelp}</span>
          ) : null}
          {webhookState.notice === "webhook_ready" ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.webhookReady}
            </Badge>
          ) : null}
        </form>
      </div>

      <FormResult error={error} notice={notice} />
    </div>
  );
}
