import { UsdtNetwork } from "@/components/recharge/usdt-network";
import { CopyAddress } from "@/components/recharge/copy-address";

import { useEffect } from "react";
import { useRevalidator } from "react-router";
import { useCommerceAction } from "@/components/commerce/use-commerce-action";
import { FormResult } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertIcon, CheckIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { RechargeMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { getMethodInstructions, type RechargeMethod } from "@/lib/recharge-settings";
import type { MyRechargeRequestDetail } from "@server/lib/services/recharge.service";

/**
 * The status page for one manual recharge request.
 *
 * A manual request is settled by a person, not a payment provider, so the page
 * cannot watch a third party for the outcome. Instead it asks the server to
 * re-render itself — `void revalidate()` re-runs the page and picks up the new
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
  method?: RechargeMethod | null;
  returnTo?: string | null;
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
  method,
  returnTo,
}: RechargeRequestPanelProps) {
  const { revalidate, state } = useRevalidator();
  const [paidState, , markingPaid, markPaidSubmit] = useCommerceAction<{ error: string | null }>("markRechargePaid", { error: null });
  const requestMessages = messages.request;

  useEffect(() => {
    if (!open || state !== "idle" || markingPaid) {
      return;
    }

    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void revalidate(); }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [open, revalidate, state, markingPaid]);

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

        <ButtonLink href={returnTo ?? `/${locale}/wallet`}>
          {returnTo ? messages.returnToCheckout : messages.backToWallet}
        </ButtonLink>
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
    <div className={request.paymentNetwork === "BEP20" ? "sf-usdt-request" : "grid gap-5"}>
      {request.paymentNetwork === "BEP20" ? <>
        <UsdtNetwork locale={locale} />
        <ol className="sf-usdt-progress" aria-label={locale === "ar" ? "خطوات التعبئة" : "Recharge progress"}>
          {(locale === "ar" ? ["أرسل USDT", "أضف معرّف المعاملة", "مراجعة وإضافة الرصيد"] : ["Send USDT", "Submit transaction", "Review & credit"]).map((step, index) => <li key={step} aria-current={(request.status === "pending" ? index === 0 : index === 2) ? "step" : undefined} className="rounded-xl border border-[var(--line)] p-3 aria-[current=step]:border-[var(--accent)] aria-[current=step]:bg-[var(--surface-inset)]"><span className="mb-2 block font-bold text-[var(--accent)]">{index + 1}</span>{step}</li>)}
        </ol>
      </> : null}
      <div className="sf-usdt-status rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-6 text-center sm:p-8">
        <Badge tone="warning">{request.status === "pending" ? messages.statuses.pending : requestMessages.waitingTitle}</Badge>
        <p
          className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums"
          dir="ltr"
        >
          {formatPrice(request.requestedAmount, request.currency, locale)}
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {request.status === "pending" ? requestMessages.paymentDescription : requestMessages.waitingDescription}
        </p>
      </div>

      <div className="sf-usdt-reference rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.referenceLabel}</p>
        <p
          className="mt-2 break-all font-mono text-2xl font-semibold tracking-tight text-[var(--ink)]"
          dir="ltr"
        >
          {request.reference}
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{messages.referenceHint}</p>
      </div>

      {(request.status === "pending" || request.status === "payment_sent") && (method || request.paymentDestination) ? (
        <div className="sf-usdt-instructions grid gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{messages.instructionsTitle}</h2>
          {request.paymentNetwork === "BEP20" ? <div className="rounded-xl bg-[var(--surface-inset)] p-4"><p className="text-sm text-[var(--ink-muted)]">{locale === "ar" ? "المبلغ المطلوب وصوله إلى العنوان" : "Amount to arrive at the receiving address"}</p><p dir="ltr" className="mt-2 text-2xl font-bold tabular-nums">{request.requestedAmount.toFixed(2)} USDT</p></div> : null}
          {request.paymentDestination || method?.account ? <CopyAddress value={request.paymentDestination || method?.account || ""} locale={locale} /> : null}
          {request.paymentNetwork === "BEP20" ? <p className="text-sm text-[var(--ink-muted)]">{locale === "ar" ? "أرسل USDT على BEP20 فقط. 1 USDT مستلم = 1 دولار رصيد. رسوم السحب لا تدخل في الرصيد. لا ترسل BNB أو على شبكة أخرى. تُراجع الدفعة قبل إضافة الرصيد." : "Send USDT on BEP20 only. 1 USDT received = $1 wallet credit. Withdrawal fees are not credited. Do not send BNB or use another network. Payment is reviewed before crediting."}</p> : null}
          {method && getMethodInstructions(method, locale) ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--ink-muted)]" dir="auto">{getMethodInstructions(method, locale)}</p> : null}
          {request.paymentNetwork === "BEP20" && request.paymentTxHash && /^0x[0-9a-f]{64}$/i.test(request.paymentTxHash) ? <a className="min-h-11 content-center text-sm text-[var(--accent)] underline" href={`https://bscscan.com/tx/${request.paymentTxHash}`} target="_blank" rel="noreferrer">{locale === "ar" ? "عرض المعاملة على BscScan" : "View transaction on BscScan"}</a> : null}
          <form onSubmit={markPaidSubmit} className="grid gap-3">
            {request.paymentNetwork === "BEP20" ? <label className="grid gap-2 text-sm">{locale === "ar" ? "معرّف المعاملة (TxID)" : "Transaction hash (TxID)"}<input name="txHash" dir="ltr" className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-sm" required pattern="0x[0-9a-fA-F]{64}" maxLength={66} defaultValue={request.paymentTxHash ?? ""} placeholder="0x…" autoComplete="off" spellCheck={false} autoCapitalize="none" aria-describedby="txid-help" /><span id="txid-help" className="text-xs text-[var(--ink-muted)]">{locale === "ar" ? "انسخه من سجل السحب. يمكنك تصحيحه قبل الموافقة. إرسال المعرف لا يعني تأكيد الدفع." : "Copy it from your withdrawal history. You can correct it before approval. Submitting a hash does not confirm payment."}</span></label> : null}
            {request.paymentNetwork === "BEP20" ? <label className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--line)] p-3 text-sm"><input className="mt-1 size-4 shrink-0" type="checkbox" required name="payerConfirmed" value="yes" /><span>{locale === "ar" ? "هذه معاملتي، وأرسلت USDT على شبكة BEP20 إلى العنوان أعلاه." : "This is my transfer. I sent USDT on BEP20 to the address above."}</span></label> : null}
            <FormResult error={paidState.error ? messages.errors[paidState.error as keyof typeof messages.errors] ?? messages.errors.unknown : null} />
            <Button type="submit" disabled={markingPaid} aria-busy={markingPaid}>
              {markingPaid ? requestMessages.markingPaid : request.paymentNetwork === "BEP20" ? (locale === "ar" ? "إرسال المعاملة للمراجعة" : "Submit transfer for review") : messages.markPaidAction}
            </Button>
          </form>
        </div>
      ) : request.status === "payment_sent" ? <p role="status" className="text-sm leading-6 text-[var(--ink-muted)]">{messages.markedPaid}</p> : null}

      <dl className="sf-usdt-summary grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 text-sm sm:grid-cols-2">
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

      <p className="sf-usdt-updates text-sm leading-6 text-[var(--ink-muted)]">
        {requestMessages.updatesAutomatically}
      </p>

      <Button className="sf-usdt-refresh" variant="secondary" disabled={state !== "idle" || markingPaid} aria-busy={state !== "idle"} onClick={() => void revalidate()}>
        {state !== "idle" ? requestMessages.checking : requestMessages.checkNow}
      </Button>
    </div>
  );
}
