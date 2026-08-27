"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { CheckoutMessages } from "@/i18n/messages";

/**
 * Fulfilment state, and the codes it delivered.
 *
 * This is the one client island on the order page: reading a redeem code off the
 * screen and typing it into a game is where a copy button earns its keep. The
 * state itself is decided by the server — nothing here infers progress, it only
 * words what the fulfilment rows already say.
 *
 * The keys are derived from the message dictionary rather than imported from the
 * service, so a status the copy does not cover fails typechecking instead of
 * rendering a blank pill.
 */
export type OrderStatusKey = keyof CheckoutMessages["statuses"];
export type FulfillmentStateKey = keyof CheckoutMessages["fulfillmentStates"];

export type OrderStatusPanelProps = {
  messages: CheckoutMessages;
  status: OrderStatusKey;
  fulfillmentState: FulfillmentStateKey | null;
  /** True when the payment was returned to the wallet. */
  isRefunded: boolean;
  failureMessage: string | null;
  codes: string[];
  supportHref: string;
  walletHref: string;
};

type Presentation = { tone: BadgeTone; title: string; description: string };

function presentation({
  messages,
  status,
  fulfillmentState,
  isRefunded,
}: Pick<
  OrderStatusPanelProps,
  "messages" | "status" | "fulfillmentState" | "isRefunded"
>): Presentation {
  const detail = messages.orderDetail;

  // A refund is the plainest thing that can be said, so it is said first: the
  // customer's money is back, whatever the supplier did.
  if (isRefunded || status === "refunded" || fulfillmentState === "refunded") {
    return {
      tone: "warning",
      title: detail.refundedTitle,
      description: detail.refundedDescription,
    };
  }

  if (status === "failed" || status === "cancelled" || fulfillmentState === "failed") {
    return {
      tone: "danger",
      title: detail.failedTitle,
      description: detail.failedNotRefundedDescription,
    };
  }

  if (status === "completed" || fulfillmentState === "completed") {
    return {
      tone: "success",
      title: detail.completedTitle,
      description: detail.completedDescription,
    };
  }

  if (
    status === "processing" ||
    status === "fulfilling" ||
    fulfillmentState === "processing" ||
    fulfillmentState === "reconcile"
  ) {
    return {
      tone: "accent",
      title: detail.processingTitle,
      description: detail.processingDescription,
    };
  }

  return { tone: "neutral", title: detail.pendingTitle, description: detail.pendingDescription };
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function OrderStatusPanel({
  messages,
  status,
  fulfillmentState,
  isRefunded,
  failureMessage,
  codes,
  supportHref,
  walletHref,
}: OrderStatusPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const detail = messages.orderDetail;
  const state = presentation({ messages, status, fulfillmentState, isRefunded });
  const failed = state.tone === "danger" || state.tone === "warning";

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      // A blocked clipboard is not an error worth interrupting for: the code is
      // on screen and can be selected by hand.
    }
  }

  async function copyAllCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setAllCopied(true);
    } catch {
      // The individual codes remain visible and selectable.
    }
  }

  return (
    <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--ink)]">{detail.fulfillmentTitle}</h2>
        {fulfillmentState ? (
          <Badge tone={state.tone}>{messages.fulfillmentStates[fulfillmentState]}</Badge>
        ) : (
          <Badge tone={state.tone}>{messages.statuses[status]}</Badge>
        )}
      </div>

      <p className="mt-4 text-sm font-semibold text-[var(--ink)]">{state.title}</p>
      <p className="mt-1.5 text-sm leading-6 text-[var(--ink-muted)]">{state.description}</p>

      {failed ? (
        <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
          <span className="text-[var(--ink-faint)]">{detail.reasonLabel}: </span>
          {failureMessage ?? detail.failedDescription}
        </p>
      ) : null}

      {codes.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{detail.codesTitle}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{detail.codesDescription}</p>
            </div>
            {codes.length > 1 ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyAllCodes()}>
                {allCopied ? detail.copiedLabel : detail.copyAction}
              </Button>
            ) : null}
          </div>

          <ul className="mt-4 grid gap-2">
            {codes.map((code) => (
              <li
                key={code}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
              >
                {isUrl(code) ? (
                  <a
                    href={code}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate font-mono text-sm text-[var(--accent-foreground)] underline decoration-[var(--accent-foreground)]/30 underline-offset-2 hover:decoration-[var(--accent-foreground)]"
                    dir="ltr"
                  >
                    {code}
                  </a>
                ) : (
                  <code
                    className="min-w-0 font-mono text-sm break-all text-[var(--ink)] select-all"
                    dir="ltr"
                  >
                    {code}
                  </code>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyCode(code)}
                  leadingIcon={copied === code ? <CheckIcon /> : undefined}
                >
                  {copied === code ? detail.copiedLabel : detail.copyAction}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href={walletHref} variant="secondary" size="sm">
            {detail.walletAction}
          </ButtonLink>
          <ButtonLink href={supportHref} variant="ghost" size="sm">
            {detail.supportAction}
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}
