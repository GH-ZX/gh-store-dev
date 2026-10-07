import { Form } from "react-router";
import * as UI from "./operations-shared";
import { AlertIcon, DepositIcon } from "@/components/ui/icons";
import { formatMessage, getMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import type { HeldOrderRow } from "@server/lib/services/admin-hold.service";

/**
 * The held queue.
 *
 * One card per order the owner cannot deliver yet because the supplier account
 * has no funds — the answer to "what is waiting on me?", shown on the orders
 * page rather than hidden inside each order. It carries the four things the
 * owner needs to act: who bought it, what they bought, which supplier must be
 * topped up and by how much, and how long they have been waiting.
 *
 * The amount is the one number that must not be a guess. When the offer has no
 * supplier price mapping this says so rather than showing a confident zero, and
 * it is labelled as the supplier's cost — not the customer's price, which was
 * already collected.
 *
 * It is safe to show the supplier's raw error here (and only here): the customer
 * never sees this screen, and the exact refusal is what explains the hold. Every
 * label is bilingual; the supplier's own words are passed through unedited.
 */
export function HeldOrdersPanel({
  locale,
  rows,
}: {
  locale: Locale;
  rows: HeldOrderRow[];
}) {
  const copy = getMessages(locale, "admin").orders;
  const ar = locale === "ar";
  const money = (value: number) =>
    new Intl.NumberFormat(ar ? "ar" : "en", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);

  const age = (minutes: number) =>
    minutes >= 1440
      ? formatMessage(
          copy.heldAgeDays,
          { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60) },
          locale,
        )
      : minutes >= 60
        ? formatMessage(
            copy.heldAgeHours,
            { hours: Math.floor(minutes / 60), minutes: minutes % 60 },
            locale,
          )
        : formatMessage(copy.heldAgeMinutes, { minutes }, locale);

  return (
    <section className="admin-card space-y-4" aria-labelledby="held-orders-title">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--warning-surface)] text-[var(--warning)]">
            <DepositIcon className="size-4" />
          </div>
          <div>
            <h2 id="held-orders-title" className="text-sm font-bold text-[var(--ink)]">
              {copy.heldQueueTitle}
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">{copy.heldQueueDescription}</p>
          </div>
        </div>

        <span
          className={
            rows.length > 0
              ? "admin-badge admin-badge-warning font-bold"
              : "admin-badge admin-badge-neutral"
          }
        >
          {formatMessage(copy.heldQueueCount, { count: rows.length }, locale)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--ink-muted)]">{copy.heldQueueEmpty}</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] p-3 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    className="font-mono text-xs sm:text-sm font-bold text-[var(--ink)] hover:text-[var(--accent-strong)]"
                    dir="ltr"
                    href={`/${locale}/dashboard/orders/${row.id}`}
                  >
                    #{row.orderNumber}
                  </a>
                  <UI.Badge>{row.status}</UI.Badge>
                  {row.holdReason === "insufficient_balance" ? (
                    <span className="admin-badge admin-badge-neutral">
                      {copy.heldLegacyBadge}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)]">
                  <span>
                    {copy.heldAgeLabel}:{" "}
                    <strong className="text-[var(--ink)]">{age(row.holdAgeMinutes)}</strong>
                  </span>
                  <time dateTime={row.heldAt} className="font-mono">
                    <bdi>{row.heldAt.replace("T", " ").slice(0, 16)}</bdi>
                  </time>
                </div>
              </div>

              <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5">
                  <dt className="text-[var(--ink-muted)]">{copy.heldCustomerLabel}</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--ink)]">
                    <bdi>{row.customer.name || row.customer.email || row.customer.id}</bdi>
                  </dd>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5">
                  <dt className="text-[var(--ink-muted)]">{copy.heldProductLabel}</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--ink)]">
                    <bdi>{row.productName}</bdi>
                    {row.offerName && row.offerName !== row.productName ? (
                      <span className="block text-[11px] font-normal text-[var(--ink-muted)]">
                        <bdi>{row.offerName}</bdi>
                      </span>
                    ) : null}
                  </dd>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5">
                  <dt className="text-[var(--ink-muted)]">
                    {copy.heldSupplierLabel} · {copy.heldQuantityLabel}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-[var(--ink)]">
                    <bdi>{row.supplier ?? "—"}</bdi>
                    <span className="ms-2 font-mono tabular-nums">× {row.quantity}</span>
                  </dd>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5">
                  <dt className="text-[var(--ink-muted)]">{copy.heldRequiredLabel}</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--ink)] tabular-nums">
                    {row.requiredSupplierCostUsd === null ? (
                      <span className="text-[var(--ink-muted)] font-normal">
                        {copy.heldRequiredUnknown}
                      </span>
                    ) : (
                      <bdi dir="ltr">{money(row.requiredSupplierCostUsd)}</bdi>
                    )}
                  </dd>
                </div>
              </dl>

              {row.supplierError ? (
                <div
                  role="alert"
                  className="rounded-md bg-[var(--danger-surface)] border border-[var(--danger)]/20 p-2 text-xs text-[var(--danger)]"
                >
                  <strong className="font-bold">{copy.heldErrorLabel}:</strong>{" "}
                  <span className="break-words">{row.supplierError}</span>
                </div>
              ) : null}

              <Form method="post" className="pt-1">
                <UI.Hidden name="orderId" value={row.id} />
                <UI.Submit intent="deliver-held" variant="primary">
                  <span className="flex items-center gap-1.5">
                    <AlertIcon className="size-3.5" />
                    <span>{copy.heldDeliverAction}</span>
                  </span>
                </UI.Submit>
              </Form>
            </article>
          ))}
        </div>
      )}

      {rows.some((row) => row.holdReason === "insufficient_balance") ? (
        <p className="text-[11px] leading-5 text-[var(--ink-muted)]">{copy.heldLegacyNote}</p>
      ) : null}
    </section>
  );
}
