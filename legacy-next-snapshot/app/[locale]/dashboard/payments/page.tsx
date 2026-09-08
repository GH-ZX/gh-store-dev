import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import type { PaymentReconciliation } from "@/lib/payments/reconciliation-state";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getPayments } from "@/lib/services/admin-payments.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const TONES: Record<PaymentReconciliation, BadgeTone> = {
  settled: "success",
  awaiting_review: "accent",
  open: "neutral",
  closed: "neutral",
  not_credited: "danger",
  unbacked: "danger",
  short_paid: "warning",
};

export default async function PaymentsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/payments">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").payments;
  const query = await searchParams;
  const attentionOnly = query.view !== "all";
  const { rows, totals } = await getPayments({ attentionOnly });

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      {/*
        * Two views, not a status filter. The question an operator has is "is
        * anything wrong", and a status dropdown cannot express it — a payment
        * that arrived and never credited is a disagreement between two
        * statuses, not a status of its own.
        */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/${locale}/dashboard/payments`}
          aria-current={attentionOnly ? "page" : undefined}
          className={
            attentionOnly
              ? "inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface-strong)] px-4 text-sm font-semibold text-[var(--ink)]"
              : "inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
          }
        >
          {formatMessage(messages.viewAttention, { count: totals.attention }, locale)}
        </Link>
        <Link
          href={`/${locale}/dashboard/payments?view=all`}
          aria-current={attentionOnly ? undefined : "page"}
          className={
            attentionOnly
              ? "inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
              : "inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface-strong)] px-4 text-sm font-semibold text-[var(--ink)]"
          }
        >
          {formatMessage(messages.viewAll, { count: totals.total }, locale)}
        </Link>

        <span className="text-xs text-[var(--ink-faint)] tabular-nums">
          {formatMessage(
            messages.summary,
            { settled: totals.settled, awaiting: totals.awaitingReview },
            locale,
          )}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={attentionOnly ? messages.allClearTitle : messages.emptyTitle}
          description={attentionOnly ? messages.allClearDescription : messages.emptyDescription}
        />
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-[var(--ink)]" dir="ltr">
                      {row.reference}
                    </span>
                    <Badge tone={TONES[row.state]}>{messages.states[row.state]}</Badge>
                    <span className="text-xs text-[var(--ink-faint)]">{row.paymentMethod}</span>
                  </div>

                  <Link
                    href={`/${locale}/dashboard/customers/${row.customer.id}`}
                    className="mt-1 block truncate text-xs text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
                  >
                    {row.customer.name || row.customer.email || row.customer.id}
                  </Link>

                  <p className="mt-0.5 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
                    {row.createdAt.slice(0, 16).replace("T", " ")}
                  </p>
                </div>

                {/*
                  * Requested against credited, side by side. The reference store
                  * shows one figure or the other depending on what exists, so a
                  * payment of two dollars against a ten-dollar request reads as
                  * an ordinary completed row.
                  */}
                <dl className="grid gap-0.5 text-end text-xs" dir="ltr">
                  <div className="flex items-baseline justify-end gap-2">
                    <dt className="text-[var(--ink-faint)]">{messages.requestedLabel}</dt>
                    <dd className="text-sm font-semibold text-[var(--ink)] tabular-nums">
                      {formatPrice(row.amount, row.currency, locale)}
                    </dd>
                  </div>

                  {row.paidAmount !== null ? (
                    <div className="flex items-baseline justify-end gap-2">
                      <dt className="text-[var(--ink-faint)]">{messages.paidLabel}</dt>
                      <dd className="tabular-nums text-[var(--ink-soft)]">
                        {formatPrice(row.paidAmount, row.currency, locale)}
                      </dd>
                    </div>
                  ) : null}

                  <div className="flex items-baseline justify-end gap-2">
                    <dt className="text-[var(--ink-faint)]">{messages.creditedLabel}</dt>
                    <dd
                      className={
                        row.creditedAmount === null
                          ? "tabular-nums text-[var(--danger)]"
                          : "tabular-nums text-[var(--success)]"
                      }
                    >
                      {row.creditedAmount === null
                        ? messages.notCredited
                        : formatPrice(row.creditedAmount, row.currency, locale)}
                    </dd>
                  </div>
                </dl>
              </div>

              {row.needsAttention ? (
                <p className="mt-3 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs leading-5 text-[var(--ink-soft)]">
                  {messages.explain[row.state as keyof typeof messages.explain]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
