import { Link } from "react-router";
import type { ReactNode } from "react";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { WalletCards } from "@/components/admin/wallet-cards";
import { OverviewAttention } from "@/components/admin/overview-attention";
import { OverviewReadiness } from "@/components/admin/overview-readiness";
import { EmptyState } from "@/components/shared/states";
import { ArrowIcon, DepositIcon, PlusIcon, ReceiptIcon, SparkIcon, SyncIcon, UserIcon, WalletIcon } from "@/components/ui/icons";
import { formatMessage, getMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format/money";
import type { AdminOverviewStats, AttentionCounts, DayPoint, Earnings, EarningsWindow, LatestOrder, SalesKpis, WalletCard } from "@server/lib/services/admin-overview.service";
import type { CatalogReadiness } from "@server/lib/services/admin-readiness.service";

export type DashboardOverviewData = {
  locale: Locale;
  stats: AdminOverviewStats;
  attention: AttentionCounts;
  kpis: SalesKpis;
  earnings: Earnings | null;
  series: DayPoint[] | null;
  latest: LatestOrder[] | null;
  wallets: WalletCard[] | null;
  readiness: CatalogReadiness | null;
  updatedAt: string;
};

const secondaryAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-strong)] disabled:cursor-wait disabled:opacity-60";
const textAction = "inline-flex min-h-11 items-center justify-center gap-1.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-strong)]";

export function DashboardOverview({ data, refreshing, onRefresh }: { data: DashboardOverviewData; refreshing: boolean; onRefresh: () => void }) {
  const { locale, stats, attention, kpis, earnings, series, latest, wallets, readiness, updatedAt } = data;
  const o = getMessages(locale, "admin").overview;
  const base = "/" + locale + "/dashboard";
  const number = new Intl.NumberFormat(locale);
  const money = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? formatPrice(value, "USD", locale) : "—";
  const dateLabel = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(date.slice(0, 10) + "T00:00:00Z"));
  const checkedAt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(updatedAt));
  const weekDelta =
    kpis.revenue7 !== null && kpis.revenuePrev7 !== null && kpis.revenuePrev7 > 0
      ? Math.round(((kpis.revenue7 - kpis.revenuePrev7) / kpis.revenuePrev7) * 100)
      : null;
  const maxOrders = Math.max(1, ...(series ?? []).map((point) => point.orders));
  const lifetimeCounts = [
    { label: o.stats.games, value: stats.products },
    { label: o.stats.activeGames, value: stats.activeProducts },
    { label: o.stats.offers, value: stats.offers },
    { label: o.stats.activeOffers, value: stats.activeOffers },
    { label: o.stats.customers, value: stats.customers },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">{o.title}</h1>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{o.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <Link to={base + "/catalog/new"} style={{ color: "var(--accent-ink)" }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-[var(--accent-strong)]">
              <PlusIcon className="size-4" /><span>{o.actions.addGame}</span>
            </Link>
            <Link to={base + "/providers/g2bulk/import"} className={secondaryAction}>
              <SyncIcon className="size-4 text-[var(--ink-muted)]" /><span>{o.actions.importG2B}</span>
            </Link>
            <Link to={base + "/recharges"} className={secondaryAction}>
              <DepositIcon className="size-4 text-[var(--ink-muted)]" /><span>{o.actions.recharges}</span>
            </Link>
            <button type="button" className={secondaryAction} disabled={refreshing} onClick={onRefresh}>
              <SyncIcon className={cn("size-4 text-[var(--ink-muted)]", refreshing && "motion-safe:animate-spin")} />
              <span>{refreshing ? o.refreshing : o.refresh}</span>
            </button>
          </div>
        </div>
        <p role="status" aria-live="polite" className="text-xs text-[var(--ink-muted)]">
          {refreshing ? o.refreshingHint : <>{o.checkedAt} <time dateTime={updatedAt}><bdi dir="ltr">{checkedAt} UTC</bdi></time></>}
        </p>
      </div>

      <OverviewAttention locale={locale} attention={attention} />
      <OverviewReadiness locale={locale} readiness={readiness} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={o.kpis.revenueToday} value={money(kpis.revenueToday)} icon={<WalletIcon />} iconTone="success" />
        <KpiCard
          label={o.kpis.revenue7}
          value={money(kpis.revenue7)}
          icon={<SparkIcon />}
          iconTone="accent"
          delta={weekDelta === null ? undefined : formatMessage(o.kpis.vsPrev, { percent: weekDelta }, locale)}
          deltaTone={weekDelta === null || weekDelta === 0 ? "flat" : weekDelta < 0 ? "down" : "up"}
        />
        <KpiCard label={o.kpis.newCustomers} value={kpis.newCustomers7 === null ? "—" : number.format(kpis.newCustomers7)} icon={<UserIcon />} />
        <KpiCard label={o.kpis.avgOrder} value={money(kpis.avgOrder7)} icon={<ReceiptIcon />} detail={kpis.orders7 === 0 ? o.kpis.noOrders : undefined} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="admin-card">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">{o.chart.title}</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{o.chart.hint}</p>
            </div>
            <span className="admin-badge admin-badge-neutral"><bdi>UTC</bdi></span>
          </div>
          {series === null ? (
            <p role="status" className="py-10 text-center text-sm text-[var(--ink-muted)]">{o.chart.unavailable}</p>
          ) : series.length === 0 || series.every((point) => point.orders === 0) ? (
            <p className="mt-6 rounded-[var(--radius-control)] border border-dashed border-[var(--line)] p-5 text-sm leading-6 text-[var(--ink-muted)]">{o.chart.empty}</p>
          ) : (
            <div className="pt-6">
              <div className="flex h-44 items-end gap-1.5 px-1 sm:gap-2" aria-hidden="true">
                {series.map((point) => (
                  <div key={point.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <div
                      className="w-full rounded-t-md bg-[color-mix(in_srgb,var(--accent)_70%,transparent)] transition-colors duration-150 group-hover:bg-[var(--accent)]"
                      style={{ height: Math.round((point.orders / maxOrders) * 100) + "%" }}
                    />
                    <span className="pointer-events-none absolute -top-9 z-20 whitespace-nowrap rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                      {dateLabel(point.date)} · {number.format(point.orders)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-2 text-[11px] font-medium text-[var(--ink-muted)] tabular-nums">
                <span>{dateLabel(series[0].date)}</span>
                <span className="text-center font-semibold text-[var(--ink-soft)]"><bdi>{number.format(series.reduce((sum, point) => sum + point.orders, 0))}</bdi> {o.chart.orders}</span>
                <span>{dateLabel(series[series.length - 1].date)}</span>
              </div>
            </div>
          )}
          {series && series.length > 0 ? (
            <details className="mt-4 border-t border-[var(--line)] pt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-[var(--accent)]">{o.chart.viewData}</summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-start text-sm tabular-nums">
                  <caption className="sr-only">{o.chart.title} · <bdi>UTC</bdi></caption>
                  <thead>
                    <tr className="border-b border-[var(--line)] text-start text-xs text-[var(--ink-muted)]">
                      <th scope="col" className="py-2 pe-3 text-start">{o.chart.date}</th>
                      <th scope="col" className="px-3 py-2 text-end">{o.chart.orders}</th>
                      <th scope="col" className="py-2 ps-3 text-end">{o.chart.revenue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((point) => (
                      <tr key={point.date} className="border-b border-[var(--line)] last:border-0">
                        <th scope="row" className="py-2 pe-3 text-start font-normal"><time dateTime={point.date}>{dateLabel(point.date)}</time></th>
                        <td className="px-3 py-2 text-end"><bdi>{number.format(point.orders)}</bdi></td>
                        <td className="py-2 ps-3 text-end"><bdi>{money(point.revenue)}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </section>

        <section className="admin-card">
          <div className="border-b border-[var(--line)] pb-4">
            <h2 className="text-base font-bold text-[var(--ink)]">{o.earnings.title}</h2>
          </div>
          {earnings === null ? (
            <p role="status" className="py-10 text-center text-sm text-[var(--ink-muted)]">{o.earnings.unavailable}</p>
          ) : (
            <div className="space-y-4 pt-4">
              <EarningsBlock window={earnings.week} title={o.earnings.last7} money={money} labels={o.earnings} locale={locale} />
              <EarningsBlock window={earnings.month} title={o.earnings.last30} money={money} labels={o.earnings} locale={locale} />
            </div>
          )}
        </section>
      </div>

      <section className="admin-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
          <h2 className="text-base font-bold text-[var(--ink)]">{o.wallets.title}</h2>
          <Link to={base + "/providers"} className={textAction}>{o.wallets.manage}<ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" /></Link>
        </div>
        {wallets === null ? (
          <p role="status" className="text-sm text-[var(--ink-muted)]">{o.wallets.unavailable}</p>
        ) : wallets.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">{o.wallets.none}</p>
        ) : (
          <WalletCards cards={wallets} locale={locale} labels={{
            syncAll: o.wallets.syncAll, syncingAll: o.wallets.syncingAll, update: o.wallets.update,
            updating: o.wallets.updating, lastSynced: o.wallets.lastSynced, neverSynced: o.wallets.neverSynced,
            failed: o.wallets.unreachable,
          }} />
        )}
      </section>

      <section className="admin-card space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
          <h2 className="text-base font-bold text-[var(--ink)]">{o.latest.title}</h2>
          <Link to={base + "/orders"} className={textAction}>{o.latest.viewAll}<ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" /></Link>
        </div>
        {latest === null ? (
          <p role="status" className="py-6 text-center text-sm text-[var(--ink-muted)]">{o.latest.unavailable}</p>
        ) : latest.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-muted)]">{o.latest.empty}</p>
        ) : (
          <ul className="-mx-2 divide-y divide-[var(--line)] sm:-mx-3">
            {latest.map((order) => (
              <li key={order.id}>
                <Link to={base + "/orders/" + order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-3.5 transition-colors hover:bg-[var(--surface-strong)]">
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]"><bdi>{order.itemName ?? order.orderNumber}</bdi></span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]">
                      <bdi className="font-mono">{order.orderNumber}</bdi>
                      <time dateTime={order.createdAt}>{dateLabel(order.createdAt)}</time>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 sm:gap-4">
                    <bdi dir="ltr" className="text-sm font-bold text-[var(--ink)] tabular-nums">{formatPrice(order.total, order.currency, locale)}</bdi>
                    <OrderStatusBadge messages={getMessages(locale, "checkout")} status={order.status} />
                    <ArrowIcon direction="end" className="size-3.5 text-[var(--ink-muted)] rtl:rotate-180" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-inset)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-[var(--ink-soft)]">
            {lifetimeCounts.map(({ label, value }) => <li key={label}>{label}: <bdi className="font-bold text-[var(--ink)] tabular-nums">{value === null ? "—" : number.format(value)}</bdi></li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <Link to={base + "/appearance"} className={textAction}>{o.actions.appearance}</Link>
            <Link to={"/" + locale} target="_blank" rel="noopener noreferrer" className={textAction}>{o.actions.viewStore}<ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" /></Link>
          </div>
        </div>
      </div>
      {stats.products === 0 ? (
        <EmptyState title={o.emptyCatalogTitle} description={o.emptyCatalogDescription} action={{ href: base + "/providers", label: o.goToProviders }} />
      ) : null}
    </div>
  );
}

function KpiCard({ label, value, icon, iconTone = "neutral", delta, deltaTone = "flat", detail }: {
  label: string;
  value: string;
  icon: ReactNode;
  iconTone?: "success" | "accent" | "neutral";
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  detail?: string;
}) {
  return (
    <div className="admin-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase">{label}</p>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4", iconTone === "success" ? "bg-[var(--success-surface)] text-[var(--success)]" : iconTone === "accent" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-strong)] text-[var(--ink-soft)]")}>{icon}</span>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums"><bdi dir="ltr">{value}</bdi></p>
        {detail ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{detail}</p> : null}
        {delta ? (
          <span className={cn("admin-badge mt-2", deltaTone === "down" ? "admin-badge-danger" : deltaTone === "up" ? "admin-badge-success" : "admin-badge-neutral")}>
            {deltaTone !== "flat" ? <ArrowIcon direction="end" className={cn("size-3", deltaTone === "up" ? "-rotate-90" : "rotate-90")} /> : null}
            <span>{delta}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EarningsBlock({ window, title, money, labels, locale }: {
  window: EarningsWindow;
  title: string;
  money: (value: number | null | undefined) => string;
  labels: { revenue: string; cost: string; profit: string; margin: string; unknownCost: string };
  locale: Locale;
}) {
  const knownCost = window.cost !== null && Number.isFinite(window.cost) && window.unmappedItems === 0;
  const profit = knownCost && window.profit !== null && Number.isFinite(window.profit) ? window.profit : null;
  const margin = profit !== null && window.revenue > 0 && Number.isFinite(window.revenue) ? profit / window.revenue : null;
  const marginText = margin === null ? null : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(margin);

  return (
    <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-[var(--ink)]">{title}</h3>
        {margin !== null ? (
          <span className={cn("admin-badge", margin < 0 ? "admin-badge-danger" : margin > 0 ? "admin-badge-success" : "admin-badge-neutral")}>
            <bdi dir="ltr">{marginText}</bdi><span>{labels.margin}</span>
          </span>
        ) : null}
      </div>
      {margin !== null && margin > 0 ? (
        <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: Math.min(100, margin * 100) + "%" }} />
        </div>
      ) : null}
      <dl className="grid gap-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-muted)]">{labels.revenue}</dt>
          <dd className="font-semibold text-[var(--ink)] tabular-nums"><bdi dir="ltr">{money(window.revenue)}</bdi></dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-muted)]">{labels.cost}</dt>
          <dd className="text-[var(--ink-soft)] tabular-nums">{knownCost ? <bdi dir="ltr">{money(window.cost)}</bdi> : labels.unknownCost}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-2">
          <dt className="font-bold text-[var(--ink)]">{labels.profit}</dt>
          <dd className={cn("text-sm font-bold tabular-nums", profit === null ? "text-[var(--ink-muted)]" : profit < 0 ? "text-[var(--danger)]" : profit > 0 ? "text-[var(--success)]" : "text-[var(--ink)]")}>
            {profit !== null ? <bdi dir="ltr">{money(profit)}</bdi> : labels.unknownCost}
          </dd>
        </div>
      </dl>
    </div>
  );
}
