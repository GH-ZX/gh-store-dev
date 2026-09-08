import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminCard } from "@/components/admin/admin-form";
import { FulfillmentBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-badges";
import { OrderOps } from "@/components/admin/order-ops";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { isSettledOrderStatus } from "@/lib/orders/order-status";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getOrderDetail } from "@/lib/services/admin-orders.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One provider payload, collapsed.
 *
 * Shown raw and unedited: when a delivery fails, the exact request and response
 * are the only things that explain why. Collapsed by default because on a
 * healthy order nobody needs to read them, and open in one click because on a
 * broken one they are the first thing to read.
 */
function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return null;
  }

  return (
    <details className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)]">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-[var(--ink-soft)]">
        {label}
      </summary>
      <pre
        className="overflow-x-auto border-t border-[var(--line)] px-3 py-2 font-mono text-[0.6875rem] leading-5 text-[var(--ink-muted)]"
        dir="ltr"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function hasKeys(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && Object.keys(value as object).length > 0;
}

export default async function OrderDetailPage({
  params,
}: PageProps<"/[locale]/dashboard/orders/[orderId]">) {
  const locale = await resolveLocaleParam(params);
  const { orderId } = await params;
  const messages = getMessages(locale, "admin").orders;
  const checkout = getMessages(locale, "checkout");
  const account = getMessages(locale, "account");
  const order = await getOrderDetail(orderId);

  if (!order) {
    notFound();
  }

  const walletTypes: Record<string, string> = account.wallet.types;

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={`/${locale}/dashboard/orders`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToOrders}
        </Link>

        <SectionHeader as="h1" eyebrow={messages.eyebrow} title={order.orderNumber} className="mt-5" />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <OrderStatusBadge messages={checkout} status={order.status} />
          <PaymentStatusBadge messages={checkout} status={order.paymentStatus} />
          <span className="text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
            {messages.placedLabel}: {order.createdAt.slice(0, 16).replace("T", " ")}
          </span>
          {order.completedAt ? (
            <span className="text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
              {messages.deliveredLabel}: {order.completedAt.slice(0, 16).replace("T", " ")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-6">
          <AdminCard title={messages.itemsTitle} description={messages.snapshotNote}>
            <ul className="grid gap-4">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-[var(--ink)]">{item.name}</p>
                    <p className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                      {formatPrice(item.totalPrice, order.currency, locale)}
                    </p>
                  </div>

                  <p className="mt-1 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
                    {messages.quantityLabel}: {item.quantity} · {messages.unitPriceLabel}:{" "}
                    {formatPrice(item.unitPrice, order.currency, locale)}
                  </p>

                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <h3 className="text-xs font-semibold text-[var(--ink-soft)]">
                      {messages.accountFieldsTitle}
                    </h3>

                    {item.dynamicFields.length === 0 ? (
                      <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                        {messages.noAccountFields}
                      </p>
                    ) : (
                      <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {item.dynamicFields.map((field) => (
                          <div
                            key={field.key}
                            className="flex items-baseline justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--shell)] px-3 py-1.5"
                          >
                            <dt className="text-xs text-[var(--ink-faint)]">{field.key}</dt>
                            <dd
                              className="min-w-0 truncate font-mono text-xs text-[var(--ink)] select-all"
                              dir="ltr"
                            >
                              {field.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <h3 className="text-xs font-semibold text-[var(--ink-soft)]">
                      {messages.attemptsTitle}
                    </h3>

                    {item.attempts.length === 0 ? (
                      <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{messages.noAttempts}</p>
                    ) : (
                      <ul className="mt-3 grid gap-3">
                        {item.attempts.map((attempt) => (
                          <li
                            key={attempt.id}
                            className="rounded-[var(--radius-control)] border border-[var(--line)] p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="neutral">
                                {formatMessage(
                                  messages.attemptLabel,
                                  { number: attempt.attemptNumber },
                                  locale,
                                )}
                              </Badge>
                              <FulfillmentBadge messages={checkout} state={attempt.status} />
                              <span className="text-xs text-[var(--ink-faint)]" dir="ltr">
                                {messages.providerLabel}: {attempt.provider}
                              </span>
                              <span
                                className="text-xs text-[var(--ink-faint)] tabular-nums"
                                dir="ltr"
                              >
                                {attempt.createdAt.slice(0, 16).replace("T", " ")}
                              </span>
                            </div>

                            {attempt.externalOrderId ? (
                              <p className="mt-2 font-mono text-xs text-[var(--ink-muted)]" dir="ltr">
                                {messages.externalIdLabel}: {attempt.externalOrderId}
                              </p>
                            ) : null}

                            {attempt.errorMessage || attempt.errorCode ? (
                              <p className="mt-2 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-3 py-2 text-xs leading-5 text-[var(--danger)]">
                                {messages.errorLabel}:{" "}
                                {[attempt.errorCode, attempt.errorMessage]
                                  .filter(Boolean)
                                  .join(" — ")}
                              </p>
                            ) : null}

                            <div className="mt-2 grid gap-2">
                              <Payload label={messages.requestLabel} value={attempt.request} />
                              <Payload label={messages.responseLabel} value={attempt.response} />
                              <Payload
                                label={messages.deliveredDataLabel}
                                value={attempt.delivered}
                              />
                              <p className="text-[0.6875rem] text-[var(--ink-faint)]">
                                {messages.rawHint}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </AdminCard>

          <OrderOps
            locale={locale}
            messages={messages}
            orderId={order.id}
            settled={isSettledOrderStatus(order.status)}
            delivered={order.status === "completed"}
          />
        </div>

        <div className="grid gap-6">
          <AdminCard title={messages.customerTitle}>
            <p className="text-sm font-semibold text-[var(--ink)]">
              {order.customer.name || order.customer.email || order.customer.id}
            </p>
            {order.customer.email ? (
              <p className="mt-1 truncate text-xs text-[var(--ink-muted)]" dir="ltr">
                {order.customer.email}
              </p>
            ) : null}
            <Link
              href={`/${locale}/dashboard/customers/${order.customer.id}`}
              className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
            >
              {messages.viewCustomerAction}
              <ChevronIcon direction="end" className="size-4 rtl:rotate-180" />
            </Link>
          </AdminCard>

          <AdminCard title={messages.moneyTitle}>
            <dl className="grid gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">{messages.subtotalLabel}</dt>
                <dd className="text-[var(--ink)] tabular-nums" dir="ltr">
                  {formatPrice(order.subtotal, order.currency, locale)}
                </dd>
              </div>

              {order.discount > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--ink-muted)]">{messages.discountLabel}</dt>
                  <dd className="text-[var(--ink)] tabular-nums" dir="ltr">
                    −{formatPrice(order.discount, order.currency, locale)}
                  </dd>
                </div>
              ) : null}

              <div className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] pt-2">
                <dt className="font-semibold text-[var(--ink)]">{messages.totalLabel}</dt>
                <dd className="font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                  {formatPrice(order.total, order.currency, locale)}
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">{messages.paymentMethodLabel}</dt>
                <dd className="text-[var(--ink)]">
                  {order.paymentMethod === "wallet"
                    ? messages.paymentMethodWallet
                    : order.paymentMethod === "gift"
                      ? messages.paymentMethodGift
                      : (order.paymentMethod ?? "—")}
                </dd>
              </div>
            </dl>

            {order.customerNote ? (
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <h3 className="text-xs font-semibold text-[var(--ink-soft)]">
                  {messages.noteLabel}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--ink-muted)]">
                  {order.customerNote}
                </p>
              </div>
            ) : null}

            {hasKeys(order.metadata) ? (
              <div className="mt-4">
                <Payload label={messages.metadataLabel} value={order.metadata} />
              </div>
            ) : null}
          </AdminCard>

          <AdminCard title={messages.transactionsTitle}>
            {order.transactions.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">{messages.noTransactions}</p>
            ) : (
              <ul className="grid gap-2">
                {order.transactions.map((transaction) => {
                  const isCredit = transaction.amount > 0;

                  return (
                    <li
                      key={transaction.id}
                      className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={isCredit ? "success" : "neutral"}>
                          {walletTypes[transaction.type] ?? transaction.type}
                        </Badge>
                        <span
                          className={
                            isCredit
                              ? "text-sm font-semibold text-[var(--success)] tabular-nums"
                              : "text-sm font-semibold text-[var(--ink)] tabular-nums"
                          }
                          dir="ltr"
                        >
                          {isCredit ? "+" : "−"}
                          {formatPrice(Math.abs(transaction.amount), order.currency, locale)}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
                        {transaction.createdAt.slice(0, 16).replace("T", " ")}
                      </p>

                      {transaction.description ? (
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
                          {transaction.description}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
