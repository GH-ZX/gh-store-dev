import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { WalletCards } from "@/components/admin/wallet-cards";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon, CheckIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format/money";
import {
  getAdminOverviewStats,
  getAttentionCounts,
  getDailySeries,
  getEarnings,
  getLatestOrders,
  getSalesKpis,
  getWalletCards,
  type EarningsWindow,
} from "@/lib/services/admin-overview.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The owner's morning page.
 *
 * Ordered as a morning is worked: what needs me first, then how the store is
 * doing, then what it earned, then who bought last. Every number degrades to a
 * dash rather than a lying zero, and every attention chip deep-links into its
 * filtered view so acting on it costs one press.
 */
export default async function DashboardOverviewPage({ params }: PageProps<"/[locale]/dashboard">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");
  const o = messages.overview;

  const [stats, attention, kpis, earnings, series, latest, wallets] = await Promise.all([
    getAdminOverviewStats(),
    getAttentionCounts(),
    getSalesKpis(),
    getEarnings(),
    getDailySeries(14),
    getLatestOrders(5),
    getWalletCards(),
  ]);

  const catalogIsEmpty = (stats.games ?? 0) === 0;
  const money = (value: number | null | undefined) =>
    typeof value === "number" ? formatPrice(value, "USD", locale) : "—";

  const attentionItems: {
    key: string;
    href: string;
    label: string;
    count: number | null;
  }[] = [
    { key: "stuck", count: attention.stuckOrders, href: `/${locale}/dashboard/orders?status=attention`, label: o.attention.stuck },
    { key: "recharges", count: attention.pendingRecharges, href: `/${locale}/dashboard/recharges`, label: o.attention.recharges },
    { key: "payments", count: attention.paymentIssues, href: `/${locale}/dashboard/payments`, label: o.attention.payments },
    { key: "support", count: attention.openSupportThreads, href: `/${locale}/dashboard/support`, label: o.attention.support },
    { key: "reviews", count: attention.pendingReviews, href: `/${locale}/dashboard/reviews`, label: o.attention.reviews },
  ];
  const attentionTotal = attentionItems.reduce(
    (sum, item) => sum + (item.count === null ? 0 : item.count),
    0,
  );

  const weekDelta =
    kpis.revenue7 !== null && kpis.revenuePrev7 !== null && kpis.revenuePrev7 > 0
      ? Math.round(((kpis.revenue7 - kpis.revenuePrev7) / kpis.revenuePrev7) * 100)
      : null;

  const maxOrders = Math.max(1, ...(series ?? []).map((point) => point.orders));
  const lifetimeLine = [
    `${messages.overview.stats.games}: ${stats.games ?? "—"}`,
    `${messages.overview.stats.activeGames}: ${stats.activeGames ?? "—"}`,
    `${messages.overview.stats.offers}: ${stats.offers ?? "—"}`,
    `${messages.overview.stats.activeOffers}: ${stats.activeOffers ?? "—"}`,
    `${messages.overview.stats.customers}: ${stats.customers ?? "—"}`,
  ].join(" · ");

  return (
    <div className="grid gap-8">
      <SectionHeader as="h1" title={o.title} subtitle={o.description} />

      {/* Supplier wallets first: cash-in-hand is the first thing an owner checks. */}
      <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{o.wallets.title}</h2>
          <ButtonLink
            href={`/${locale}/dashboard/providers`}
            variant="ghost"
            size="sm"
          >
            {o.wallets.manage}
          </ButtonLink>
        </div>

        {wallets.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-muted)]">{o.wallets.none}</p>
        ) : (
          <div className="mt-4">
            <WalletCards
              cards={wallets}
              locale={locale}
              labels={{
                syncAll: o.wallets.syncAll,
                syncingAll: o.wallets.syncingAll,
                update: o.wallets.update,
                updating: o.wallets.updating,
                lastSynced: o.wallets.lastSynced,
                neverSynced: o.wallets.neverSynced,
                failed: o.wallets.unreachable,
              }}
            />
          </div>
        )}
      </section>

      {/* Needs attention — the chips that justify opening this page. */}
      <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{o.attention.title}</h2>
          {attentionTotal === 0 ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {o.attention.allClear}
            </Badge>
          ) : (
            <span className="text-xs text-[var(--warning)]">
              {formatMessage(o.attention.totalHint, { count: attentionTotal }, locale)}
            </span>
          )}
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {attentionItems.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex min-h-16 items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)]"
              >
                <span className="text-xs leading-4 text-[var(--ink-muted)]">{item.label}</span>
                <span
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    item.count === null
                      ? "text-[var(--ink-faint)]"
                      : item.count > 0
                        ? "text-[var(--warning)]"
                        : "text-[var(--success)]",
                  )}
                >
                  {item.count === null ? "—" : item.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* KPI row. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={o.kpis.revenueToday} value={money(kpis.revenueToday)} />
        <KpiCard
          label={o.kpis.revenue7}
          value={money(kpis.revenue7)}
          delta={
            weekDelta === null ? undefined : formatMessage(o.kpis.vsPrev, { percent: weekDelta }, locale)
          }
          deltaTone={weekDelta !== null && weekDelta < 0 ? "down" : "up"}
        />
        <KpiCard
          label={o.kpis.newCustomers}
          value={kpis.newCustomers7 === null ? "—" : String(kpis.newCustomers7)}
        />
        <KpiCard label={o.kpis.avgOrder} value={money(kpis.avgOrder7)} />
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.6fr_1fr]">
        {/* Fourteen-day sales. */}
        <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">{o.chart.title}</h2>
            <span className="text-xs text-[var(--ink-faint)]">{o.chart.hint}</span>
          </div>

          {!series ? (
            <p className="mt-6 text-sm text-[var(--ink-muted)]">{o.chart.unavailable}</p>
          ) : (
            <>
              <div className="mt-6 flex h-36 items-end gap-1.5" role="img" aria-label={o.chart.title}>
                {series.map((point) => (
                  <div key={point.date} className="group relative flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px] bg-[color-mix(in_srgb,var(--accent)_65%,transparent)] transition-colors duration-[var(--duration)] group-hover:bg-[var(--accent)]"
                      style={{ height: `${Math.max(2, Math.round((point.orders / maxOrders) * 100))}%` }}
                    />
                    <span className="pointer-events-none absolute -top-8 start-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--canvas-raised)] px-2 py-1 text-[10px] text-[var(--ink)] opacity-0 shadow-[var(--elevation-2)] transition-opacity group-hover:opacity-100 rtl:translate-x-1/2">
                      {point.label} · {point.orders}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[var(--ink-faint)] tabular-nums">
                <span>{series[0]?.label}</span>
                <span>{series[series.length - 1]?.label}</span>
              </div>
            </>
          )}
        </section>

        {/* Earnings — revenue against supplier cost. */}
        <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{o.earnings.title}</h2>

          {!earnings ? (
            <p className="mt-6 text-sm text-[var(--ink-muted)]">{o.earnings.unavailable}</p>
          ) : (
            <div className="mt-4 grid gap-3">
              <EarningsRow
                window={earnings.week}
                title={o.earnings.last7}
                money={money}
                labels={{ revenue: o.earnings.revenue, cost: o.earnings.cost, profit: o.earnings.profit }}
                unknownNote={o.earnings.unknownCost}
              />
              <EarningsRow
                window={earnings.month}
                title={o.earnings.last30}
                money={money}
                labels={{ revenue: o.earnings.revenue, cost: o.earnings.cost, profit: o.earnings.profit }}
                unknownNote={o.earnings.unknownCost}
              />
            </div>
          )}
        </section>
      </div>

      {/* Latest orders. */}
      <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{o.latest.title}</h2>
          <ButtonLink href={`/${locale}/dashboard/orders`} variant="ghost" size="sm">
            {o.latest.viewAll}
          </ButtonLink>
        </div>

          {!latest || latest.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">{o.latest.empty}</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {latest.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/${locale}/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-3 transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--ink)]">
                        {order.itemName ?? order.orderNumber}
                      </span>
                      <span className="block font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
                        {order.orderNumber}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                        {formatPrice(order.total, order.currency, locale)}
                      </span>
                      <OrderStatusBadge messages={getMessages(locale, "checkout")} status={order.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

      {/* Quick actions, then the lifetime counters as a quiet line. */}
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          href={`/${locale}/dashboard/catalog/new`}
          trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
        >
          {o.actions.addGame}
        </ButtonLink>
        <ButtonLink href={`/${locale}/dashboard/providers/g2bulk/import`} variant="secondary">
          {o.actions.importG2B}
        </ButtonLink>
        <ButtonLink href={`/${locale}/dashboard/recharges`} variant="secondary">
          {o.actions.recharges}
        </ButtonLink>
        <ButtonLink href={`/${locale}/dashboard/appearance`} variant="ghost">
          {o.actions.appearance}
        </ButtonLink>
        <ButtonLink href={`/${locale}`} variant="ghost" target="_blank">
          {o.actions.viewStore}
        </ButtonLink>
      </div>

      <p className="text-xs text-[var(--ink-faint)] tabular-nums">{lifetimeLine}</p>

      {catalogIsEmpty ? (
        <EmptyState
          title={o.emptyCatalogTitle}
          description={o.emptyCatalogDescription}
          action={{
            href: `/${locale}/dashboard/providers`,
            label: o.goToProviders,
          }}
        />
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaTone = "up",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down";
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-xs font-medium text-[var(--ink-faint)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)] tabular-nums">{value}</p>
      {delta ? (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            deltaTone === "down" ? "text-[var(--danger)]" : "text-[var(--success)]",
          )}
        >
          {delta}
        </p>
      ) : null}
    </div>
  );
}

function EarningsRow({
  window,
  title,
  money,
  labels,
  unknownNote,
}: {
  window: EarningsWindow;
  title: string;
  money: (value: number | null | undefined) => string;
  labels: { revenue: string; cost: string; profit: string };
  unknownNote: string;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] p-4">
      <p className="text-xs font-semibold text-[var(--ink-soft)]">{title}</p>
      <dl className="mt-2 grid gap-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-muted)]">{labels.revenue}</dt>
          <dd className="font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
            {money(window.revenue)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-muted)]">{labels.cost}</dt>
          <dd className="tabular-nums text-[var(--ink)]" dir="ltr">
            {window.cost === null ? unknownNote : money(window.cost)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-1.5">
          <dt className="font-medium text-[var(--ink-soft)]">{labels.profit}</dt>
          <dd className="font-bold text-[var(--accent-strong)] tabular-nums" dir="ltr">
            {window.profit === null ? unknownNote : money(window.profit)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
