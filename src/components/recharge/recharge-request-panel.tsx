"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertIcon, CheckIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { RechargeMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import type { MyRechargeRequestDetail } from "@/lib/services/recharge.service";

/**
 * The status page for one manual recharge request.
 *
 * A manual request is settled by a person, not a payment provider, so the page
 * cannot watch a third party for the outcome. Instead it asks the server to
 * re-render itself — `router.refresh()` re-runs the page and picks up the new
 * status and balance — until the request reaches a final state, at which point
 * the timer stops and the outcome (credited with the full balance, or rejected
 * with the admin note) is shown as-is.
 */
export type RechargeRequestPanelProps = {
  locale: Locale;
  messages: RechargeMessages;
  request: MyRechargeRequestDetail;
  /** Whether the request can still change — the waiting screen while true. */
  open: boolean;
  approved: boolean;
  /** The customer's current wallet balance, shown once credited. */
  balance: number;
  currency: string;
  methodLabel: string;
};

/** Manual review is human-paced; five seconds is calm but responsive. */
const POLL_MS = 5_000;

export function RechargeRequestPanel({
  locale,
  messages,
  request,
  open,
  approved,
  balance,
  currency,
  methodLabel,
}: RechargeRequestPanelProps) {
  const router = useRouter();
  const requestMessages = messages.request;

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setInterval(() => router.refresh(), POLL_MS);

    return () => window.clearInterval(timer);
  }, [open, router]);

  if (approved) {
    return (
      <div className="grid gap-5">
        <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-6 text-center sm:p-8">
          <Badge tone="success" icon={<CheckIcon />}>
            {requestMessages.creditedTitle}
          </Badge>
          <p
            className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums"
            dir="ltr"
          >
            {formatPrice(
              request.creditedAmount ?? request.requestedAmount,
              request.currency,
              locale,
            )}
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
            {requestMessages.creditedDescription}
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="flex items-center gap-2 text-xs font-medium text-[var(--ink-faint)]">
            <WalletIcon className="size-4" />
            {requestMessages.balanceNowLabel}
          </p>
          <p
            className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)] tabular-nums"
            dir="ltr"
          >
            {formatPrice(balance, currency, locale)}
          </p>
        </div>

        <ButtonLink href={`/${locale}/recharge/${request.id}/invoice`} variant="secondary">
          {requestMessages.viewInvoice}
        </ButtonLink>
      </div>
    );
  }

  if (request.status === "rejected") {
    return (
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-6">
        <Badge tone="danger" icon={<AlertIcon />}>
          {requestMessages.rejectedTitle}
        </Badge>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {requestMessages.rejectedDescription}
        </p>
        {request.adminNote ? (
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
            {messages.noteLabel}: {request.adminNote}
          </p>
        ) : null}
      </div>
    );
  }

  if (!open) {
    // A final state other than approved or rejected — expired or cancelled.
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6">
        <Badge tone="neutral">{messages.statuses[request.status]}</Badge>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {requestMessages.closedDescription}
        </p>
        {request.adminNote ? (
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
            {messages.noteLabel}: {request.adminNote}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-6 text-center sm:p-8">
        <Badge tone="warning">{requestMessages.waitingTitle}</Badge>
        <p
          className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums"
          dir="ltr"
        >
          {formatPrice(request.requestedAmount, request.currency, locale)}
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {requestMessages.waitingDescription}
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.referenceLabel}</p>
        <p
          className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[var(--ink)]"
          dir="ltr"
        >
          {request.reference}
        </p>
      </div>

      <dl className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-[var(--ink-faint)]">{messages.amountLabel}</dt>
          <dd className="mt-1 font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
            {formatPrice(request.requestedAmount, request.currency, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--ink-faint)]">{messages.methodLabel}</dt>
          <dd className="mt-1 font-semibold text-[var(--ink)]">{methodLabel}</dd>
        </div>
      </dl>

      <p className="text-sm leading-6 text-[var(--ink-muted)]">
        {requestMessages.updatesAutomatically}
      </p>

      <Button variant="secondary" onClick={() => router.refresh()}>
        {requestMessages.checkNow}
      </Button>
    </div>
  );
}