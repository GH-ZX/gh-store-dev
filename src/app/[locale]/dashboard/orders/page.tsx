import type { Metadata } from "next";
import Link from "next/link";
import { FulfillmentBadge, OrderStatusBadge } from "@/components/admin/order-badges";
import { ReconcilePanel } from "@/components/admin/reconcile-panel";
import { EmptyState } from "@/components/shared/states";
import { ArrowIcon, SearchIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import {
  ADMIN_ORDER_STATUSES,
  ATTENTION_FILTER,
  MANUAL_FILTER,
  getOrders,
} from "@/lib/services/admin-orders.service";
import { getLastReconcileRun } from "@/lib/services/reconciliation.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OrdersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/orders">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").orders;
  const checkout = getMessages(locale, "checkout");
  const query = await searchParams;
  const term = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";
  const [orders, lastRun] = await Promise.all([
    getOrders({ search: term, status }),
    getLastReconcileRun(),
  ]);
  const filtered = Boolean(term || status);

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <ReconcilePanel locale={locale} messages={messages} lastRun={lastRun} />

      {/* A real GET form, so a filtered view is a shareable URL and needs no JavaScript. */}
      <form method="get" className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4">
          <SearchIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
          <span className="sr-only">{messages.searchLabel}</span>
          <input
            type="search"
            name="q"
            defaultValue={term}
            placeholder={messages.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>

        <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] ps-4 pe-2">
          <span className="sr-only">{messages.filterLabel}</span>
          <select
            name="status"
            defaultValue={status}
            className="min-h-11 bg-transparent text-sm text-[var(--ink)] outline-none"
          >
            <option value="">{messages.filterAll}</option>
            <option value={ATTENTION_FILTER}>{messages.filterAttention}</option>
            <option value={MANUAL_FILTER}>{messages.filterManual}</option>
            {ADMIN_ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {checkout.statuses[value]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
        >
          {messages.searchLabel}
        </button>
      </form>

      {orders.length === 0 ? (
        <EmptyState
          title={filtered ? messages.emptyFilteredTitle : messages.emptyTitle}
          description={filtered ? messages.emptyFilteredDescription : messages.emptyDescription}
        />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.countLabel, { count: orders.length }, locale)}
          </p>

          <ul className="grid gap-2">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/${locale}/dashboard/orders/${order.id}`}
                  className="group flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[var(--ink)]" dir="ltr">
                        {order.orderNumber}
                      </span>
                      <OrderStatusBadge messages={checkout} status={order.status} />
                      {/*
                        * The delivery state only earns a second pill when it says
                        * something the order status does not — a "paid" order whose
                        * delivery failed is the case this list exists to surface.
                        */}
                      {order.fulfillmentState && order.fulfillmentState !== order.status ? (
                        <FulfillmentBadge messages={checkout} state={order.fulfillmentState} />
                      ) : null}
                    </div>

                    <p className="mt-1 truncate text-xs text-[var(--ink-muted)]">
                      {order.customer.name || order.customer.email || order.customer.id}
                    </p>

                    {order.itemNames.length > 0 ? (
                      <p className="mt-0.5 truncate text-xs text-[var(--ink-faint)]">
                        {order.itemNames.join(" · ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-end">
                      <p className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                        {formatPrice(order.total, order.currency, locale)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
                        {order.createdAt.slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                      aria-hidden="true"
                    >
                      <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
