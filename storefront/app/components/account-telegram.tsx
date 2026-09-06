import { useState } from "react";
import { Form, useNavigation } from "react-router";
import type { AccountMessages } from "@/i18n/messages";
import type { TelegramLinkStatus } from "@server/lib/services/telegram-link.service";
import {
  AccountCard,
  accountButton,
  accountSecondary,
} from "@/components/account-ui";
export function AccountTelegram({
  messages,
  link,
  code,
  expiresAt,
  connect = false,
  botUrl,
}: {
  messages: AccountMessages;
  link: TelegramLinkStatus;
  code?: string | null;
  expiresAt?: string | null;
  connect?: boolean;
  botUrl?: string | null;
}) {
  const copy = connect ? messages.telegramConnect : messages.telegram;
  const [copied, setCopied] = useState(false);
  const busy = useNavigation().state !== "idle";
  return (
    <AccountCard
      title={copy.title}
      description={
        link.linked ? copy.linkedDescription : copy.unlinkedDescription
      }
    >
      {link.linked ? (
        <div className="grid gap-4">
          <p className="text-sm text-[var(--success)]">
            {copy.linked}{" "}
            {link.chatLabel ? <bdi dir="ltr">{link.chatLabel}</bdi> : null}
          </p>
          <Form method="post">
            <button
              className={accountSecondary}
              name="intent"
              value="telegram-unlink"
              disabled={busy}
            >
              {copy.unlinkAction}
            </button>
          </Form>
        </div>
      ) : (
        <div className="grid gap-4">
          {code ? (
            <div className="grid gap-3">
              <p className="text-sm text-[var(--ink-muted)]">{copy.codeHint}</p>
              <code
                dir="ltr"
                className="block rounded-xl bg-[var(--surface)] p-4 text-center text-2xl font-bold tracking-widest"
              >
                {code}
              </code>
              <button
                className={accountSecondary}
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? copy.codeCopied : copy.codeCopy}
              </button>
              {expiresAt ? (
                <p className="text-xs text-[var(--ink-muted)]">
                  {copy.codeExpiry}:{" "}
                  <bdi dir="ltr">{expiresAt.slice(11, 16)} UTC</bdi>
                </p>
              ) : null}
            </div>
          ) : null}
          <Form method="post">
            <button
              className={accountButton}
              name="intent"
              value={connect ? "telegram-connect" : "telegram-link"}
              disabled={busy}
            >
              {code
                ? copy.newCodeAction
                : connect
                  ? messages.telegramConnect.getCodeAction
                  : messages.telegram.linkAction}
            </button>
          </Form>
          {connect && botUrl ? (
            <a
              className={accountSecondary}
              href={botUrl}
              target="_blank"
              rel="noreferrer"
            >
              {messages.telegramConnect.openBotAction}
            </a>
          ) : null}
        </div>
      )}
    </AccountCard>
  );
}
