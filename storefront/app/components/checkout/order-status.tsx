
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { CheckoutMessages } from "@/i18n/messages";

/**
 * Status pills for the order page.
 *
 * This is the one client island on the order page: reading a redeem code off the
 * screen and typing it into a game is where a copy button earns its keep. The
 * state itself is decided by the server — nothing here infers progress, it only
 * words what the fulfilment rows already say.
 *
 * The message keys are derived from the dictionary rather than imported from the
 * service, so a status the copy does not cover fails typechecking instead of
 * rendering a blank pill. `string` is allowed alongside them because the value
 * arrives from the database as free text with a check constraint: the one state
 * a customer can see beyond the dictionary is handled explicitly
 * ({@link heldLabel}), and anything genuinely unknown falls through to the
 * pending wording rather than throwing on a page a paying customer is looking at.
 */
export type OrderStatusMessageKey = keyof CheckoutMessages["statuses"];
export type OrderStatusKey = OrderStatusMessageKey | (string & {});
export type FulfillmentStateKey = keyof CheckoutMessages["fulfillmentStates"];

/**
 * The customer-facing wording for a held order.
 *
 * `held` is storage vocabulary: it means "the store has not bought this from the
 * supplier yet", which is not a thing a shopper should ever read. The order is
 * paid and queued, so the label says exactly that — no supplier, no balance, no
 * promise about when.
 */
export function heldLabel(messages: CheckoutMessages): string {
  return messages.orderDetail.queuedLabel;
}

function isHeld(status: string, heldLike: boolean): boolean {
  return heldLike || status === "held";
}

export type OrderStatusPanelProps = {
  messages: CheckoutMessages;
  status: OrderStatusKey;
  fulfillmentState: FulfillmentStateKey | null;
  /**
   * The order is waiting on a supplier wallet the owner controls. Comes from the
   * service rather than being inferred here, so a `held` order and one of the
   * three legacy `processing`/`insufficient_balance` orders read identically.
   */
  heldLike: boolean;
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
  heldLike,
  isRefunded,
}: Pick<
  OrderStatusPanelProps,
  "messages" | "status" | "fulfillmentState" | "heldLike" | "isRefunded"
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

  /*
   * Held. The supplier has not delivered yet because the store's own supplier
   * wallet is empty — the customer's money is taken and their order is queued,
   * and nothing about that is theirs to fix or to know. So this reads as
   * "queued and being prepared", and the only reassurance it offers is the one
   * that is certain: no action needed, support is there. No supplier, no
   * balance, no promised time.
   *
   * Checked before the processing branch, which would otherwise absorb it and
   * claim the supplier is working on it.
   */
  if (isHeld(status, heldLike)) {
    return {
      tone: "accent",
      title: detail.queuedTitle,
      description: detail.queuedDescription,
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
  heldLike,
  isRefunded,
  failureMessage,
  codes,
  supportHref,
  walletHref,
}: OrderStatusPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const detail = messages.orderDetail;
  const state = presentation({ messages, status, fulfillmentState, heldLike, isRefunded });
  const failed = state.tone === "danger" || state.tone === "warning";
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${status}:${fulfillmentState}:${heldLike}:${isRefunded}`;
    if (notifiedRef.current === key) return;
    notifiedRef.current = key;

    if (state.tone === "success") {
      toast.success(state.title, { description: state.description });
    } else if (failed) {
      toast.error(state.title, { description: failureMessage ?? state.description });
    }
  }, [state, failed, failureMessage, status, fulfillmentState, heldLike, isRefunded]);


  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      toast.success(detail.copiedLabel || "Code copied to clipboard!");
    } catch {
      // A blocked clipboard is not an error worth interrupting for: the code is
      // on screen and can be selected by hand.
    }
  }

  async function copyAllCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setAllCopied(true);
      toast.success("All codes copied to clipboard!");
    } catch {
      // The individual codes remain visible and selectable.
    }
  }

  return (
    <section className="sf-commerce-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--ink)]">{detail.fulfillmentTitle}</h2>
        {/*
          * A held order's attempt row reads `failed`/`insufficient_balance` —
          * supplier vocabulary that must never reach the customer. The hold
          * wording wins over both maps.
          */}
        {isHeld(status, heldLike) ? (
          <Badge tone={state.tone}>{heldLabel(messages)}</Badge>
        ) : fulfillmentState ? (
          <Badge tone={state.tone}>{messages.fulfillmentStates[fulfillmentState]}</Badge>
        ) : (
          <Badge tone={state.tone}>{messages.statuses[status as OrderStatusMessageKey] ?? status}</Badge>
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
