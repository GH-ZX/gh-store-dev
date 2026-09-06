import { useEffect } from "react";
import { Link, useRevalidator } from "react-router";
import type { Locale } from "@/i18n/config";
import { formatPrice } from "@/lib/format-money";
import type { MyRechargeRequestDetail } from "@server/lib/services/recharge.service";

export type RechargeRequestPanelProps = {
  locale: Locale;
  messages: Record<string, any>;
  request: MyRechargeRequestDetail;
  open: boolean;
  approved: boolean;
  balance: number;
  currency: string;
  methodLabel: string;
};

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
  const revalidator = useRevalidator();
  const requestMessages = messages.request;

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setInterval(() => revalidator.revalidate(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, revalidator]);

  if (approved) {
    return (
      <div className="grid gap-5">
        <div className="rounded-lg border p-6 text-center">
          <p className="font-bold">{requestMessages.creditedTitle}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums" dir="ltr">
            {formatPrice(request.creditedAmount ?? request.requestedAmount, request.currency, locale)}
          </p>
          <p className="mt-3 text-sm opacity-70">{requestMessages.creditedDescription}</p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-medium opacity-70">{requestMessages.balanceNowLabel}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums" dir="ltr">
            {formatPrice(balance, currency, locale)}
          </p>
        </div>
        <Link
          to={`/${locale}/recharge/${request.id}/invoice`}
          className="rounded border px-4 py-2 text-center"
        >
          {requestMessages.viewInvoice}
        </Link>
      </div>
    );
  }

  if (request.status === "rejected") {
    return (
      <div className="rounded-lg border p-6">
        <p className="font-bold">{requestMessages.rejectedTitle}</p>
        <p className="mt-3 text-sm opacity-70">{requestMessages.rejectedDescription}</p>
        {request.adminNote ? (
          <p className="mt-3 text-sm">
            {messages.noteLabel}: {request.adminNote}
          </p>
        ) : null}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-lg border p-6">
        <p className="font-bold">{messages.statuses[request.status]}</p>
        <p className="mt-3 text-sm opacity-70">{requestMessages.closedDescription}</p>
        {request.adminNote ? (
          <p className="mt-3 text-sm">
            {messages.noteLabel}: {request.adminNote}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-lg border p-6 text-center">
        <p className="font-bold">{requestMessages.waitingTitle}</p>
        <p className="mt-4 text-3xl font-semibold tabular-nums" dir="ltr">
          {formatPrice(request.requestedAmount, request.currency, locale)}
        </p>
        <p className="mt-3 text-sm opacity-70">{requestMessages.waitingDescription}</p>
      </div>
      <div className="rounded-lg border p-5">
        <p className="text-xs font-medium opacity-70">{messages.referenceLabel}</p>
        <p className="mt-2 font-mono text-2xl font-semibold" dir="ltr">
          {request.reference}
        </p>
      </div>
      <dl className="grid gap-3 rounded-lg border p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium opacity-70">{messages.amountLabel}</dt>
          <dd className="mt-1 font-semibold tabular-nums" dir="ltr">
            {formatPrice(request.requestedAmount, request.currency, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium opacity-70">{messages.methodLabel}</dt>
          <dd className="mt-1 font-semibold">{methodLabel}</dd>
        </div>
      </dl>
      <p className="text-sm opacity-70">{requestMessages.updatesAutomatically}</p>
      <button
        type="button"
        onClick={() => revalidator.revalidate()}
        className="rounded border px-4 py-2"
      >
        {requestMessages.checkNow}
      </button>
    </div>
  );
}
