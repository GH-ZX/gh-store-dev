import { Link, redirect, useLoaderData } from "react-router";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { WalletCards } from "@/components/admin/wallet-cards";
import { EmptyState } from "@/components/shared/states";
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  DepositIcon,
  PlusIcon,
  ReceiptIcon,
  SparkIcon,
  StarIcon,
  SupportIcon,
  SyncIcon,
  UserIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { formatMessage, getMessages } from "@/i18n/messages";
import { isLocale } from "@/i18n/config";
import { buildPageMeta } from "@/lib/seo";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@server/lib/auth/guards";
import type { Route } from "./+types/dashboard-index";
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
} from "@server/lib/services/admin-overview.service";

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({
    locale,
    path: "/dashboard",
    title: getMessages(locale, "admin").overview.title,
    description: "",
    noIndex: true,
  });
}

async function authorize(locale: string, request: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const url = new URL(request.url);
      throw redirect(`/${locale}/login?next=${encodeURIComponent(url.pathname)}`);
    }
    if (error instanceof ForbiddenError) throw new Response("Forbidden", { status: 403 });
    throw error;
  }
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  await authorize(locale, request);
  const [stats, attention, kpis, earnings, series, latest, wallets] = await Promise.all([
    getAdminOverviewStats(),
    getAttentionCounts(),
    getSalesKpis(),
    getEarnings(),
    getDailySeries(14),
    getLatestOrders(5),
    getWalletCards(),
  ]);
  return { locale, stats, attention, kpis, earnings, series, latest, wallets };
}

export default function DashboardIndex() {
  const { locale, stats, attention, kpis, earnings, series, latest, wallets } =
    useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin");
  const o = messages.overview;

  const catalogIsEmpty = stats.products === 0;
  const money = (value: number | null | undefined) =>
    typeof value === "number" ? formatPrice(value, "USD", locale) : "—";

  const attentionItems = [
    {
      key: "stuck",
      count: attention.stuckOrders,
      href: `/${locale}/dashboard/orders?status=attention`,
      label: o.attention.stuck,
      icon: AlertIcon,
      tone: "danger" as const,
    },
    {
      key: "recharges",
      count: attention.pendingRecharges,
      href: `/${locale}/dashboard/recharges`,
      label: o.attention.recharges,
      icon: DepositIcon,
      tone: "warning" as const,
    },
    {
      key: "payments",
      count: attention.paymentIssues,
      href: `/${locale}/dashboard/payments`,
      label: o.attention.payments,
      icon: WalletIcon,
      tone: "warning" as const,
    },
    {
      key: "support",
      count: attention.openSupportThreads,
      href: `/${locale}/dashboard/support`,
      label: o.attention.support,
      icon: SupportIcon,
      tone: "accent" as const,
    },
    {
      key: "reviews",
      count: attention.pendingReviews,
      href: `/${locale}/dashboard/reviews`,
      label: o.attention.reviews,
      icon: StarIcon,
      tone: "accent" as const,
    },
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
  const lifetimeItems = [
    { label: messages.overview.stats.games, value: stats.products ?? "—" },
    { label: messages.overview.stats.activeGames, value: stats.activeProducts ?? "—" },
    { label: messages.overview.stats.offers, value: stats.offers ?? "—" },
    { label: messages.overview.stats.activeOffers, value: stats.activeOffers ?? "—" },
    { label: messages.overview.stats.customers, value: stats.customers ?? "—" },
  ];

  return (
    <div className="space-y-8">
      {/* 1. Modern Page Header & Top Action Cluster */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            {o.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {o.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`/${locale}/dashboard/catalog/new`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--accent-strong)] transition-colors"
          >
            <PlusIcon className="size-4" />
            <span>{o.actions.addGame}</span>
          </Link>
          <Link
            to={`/${locale}/dashboard/providers/g2bulk/import`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors"
          >
            <SyncIcon className="size-4 text-[var(--ink-muted)]" />
            <span>{o.actions.importG2B}</span>
          </Link>
          <Link
            to={`/${locale}/dashboard/recharges`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors"
          >
            <DepositIcon className="size-4 text-[var(--ink-muted)]" />
            <span>{o.actions.recharges}</span>
          </Link>
        </div>
      </div>

      {/* 2. Needs Attention Row / Actionable Items */}
      <section className="admin-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wide">
              {o.attention.title}
            </h2>
            {attentionTotal > 0 ? (
              <span className="admin-badge admin-badge-warning">
                {formatMessage(o.attention.totalHint, { count: attentionTotal }, locale)}
              </span>
            ) : null}
          </div>

          {attentionTotal === 0 ? (
            <span className="admin-badge admin-badge-success">
              <CheckIcon className="size-3.5" />
              <span>{o.attention.allClear}</span>
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {attentionItems.map((item) => {
            const hasItems = item.count !== null && item.count > 0;
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                to={item.href}
                className={cn(
                  "group flex flex-col justify-between rounded-[var(--radius-card)] border p-4 transition-all duration-150",
                  hasItems
                    ? "border-[var(--warning)]/30 bg-[var(--warning-surface)]/20 hover:border-[var(--warning)] hover:shadow-xs"
                    : "border-[var(--line)] bg-[var(--surface-inset)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      hasItems
                        ? "bg-[var(--warning)]/15 text-[var(--warning)]"
                        : "bg-[var(--surface-strong)] text-[var(--ink-muted)] group-hover:text-[var(--ink)]",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>

                  <span
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      item.count === null
                        ? "text-[var(--ink-faint)]"
                        : hasItems
                          ? "text-[var(--warning)]"
                          : "text-[var(--ink-muted)]",
                    )}
                  >
                    {item.count === null ? "—" : item.count}
                  </span>
                </div>

                <div className="mt-3">
                  <p className="text-xs font-medium text-[var(--ink-soft)] leading-snug group-hover:text-[var(--ink)] transition-colors">
                    {item.label}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 3. KPI Metric Stat Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Today */}
        <div className="admin-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
              {o.kpis.revenueToday}
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--success-surface)] text-[var(--success)]">
              <WalletIcon className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums" dir="ltr">
              {money(kpis.revenueToday)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">
              {locale === "ar" ? "إجمالي مبيعات اليوم" : "Total sales today"}
            </p>
          </div>
        </div>

        {/* 7-Day Revenue with Trend */}
        <div className="admin-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
              {o.kpis.revenue7}
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <SparkIcon className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums" dir="ltr">
              {money(kpis.revenue7)}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {weekDelta !== null ? (
                <span
                  className={cn(
                    "admin-badge px-2 py-0 text-[11px]",
                    weekDelta < 0 ? "admin-badge-danger" : "admin-badge-success",
                  )}
                >
                  <ArrowIcon
                    direction={weekDelta < 0 ? "end" : "start"}
                    className={cn("size-3 rotate-90", weekDelta < 0 && "rotate-270")}
                  />
                  <span>
                    {formatMessage(o.kpis.vsPrev, { percent: Math.abs(weekDelta) }, locale)}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-[var(--ink-faint)]">
                  {locale === "ar" ? "آخر ٧ أيام" : "Past 7 days"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* New Customers */}
        <div className="admin-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
              {o.kpis.newCustomers}
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-strong)] text-[var(--ink-soft)]">
              <UserIcon className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums">
              {kpis.newCustomers7 === null ? "—" : String(kpis.newCustomers7)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">
              {locale === "ar" ? "عملاء جدد هذا الأسبوع" : "New accounts this week"}
            </p>
          </div>
        </div>

        {/* Average Order Value */}
        <div className="admin-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
              {o.kpis.avgOrder}
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-strong)] text-[var(--ink-soft)]">
              <ReceiptIcon className="size-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums" dir="ltr">
              {money(kpis.avgOrder7)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">
              {locale === "ar" ? "متوسط السلة ٧ أيام" : "7-day average cart"}
            </p>
          </div>
        </div>
      </section>

      {/* 4. Analytics & Financial Performance Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* 14-Day Sales Velocity */}
        <section className="admin-card flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">{o.chart.title}</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">{o.chart.hint}</p>
            </div>
            <span className="admin-badge admin-badge-neutral text-xs">
              {locale === "ar" ? "١٤ يوماً" : "14 Days"}
            </span>
          </div>

          {!series ? (
            <p className="py-12 text-center text-sm text-[var(--ink-muted)]">{o.chart.unavailable}</p>
          ) : (
            <div className="pt-6">
              <div
                className="flex h-44 items-end gap-1.5 sm:gap-2 px-1"
                role="img"
                aria-label={o.chart.title}
              >
                {series.map((point) => {
                  const barHeight = Math.max(4, Math.round((point.orders / maxOrders) * 100));

                  return (
                    <div
                      key={point.date}
                      className="group relative flex h-full flex-1 flex-col items-center justify-end"
                    >
                      {/* Bar with hover effect */}
                      <div
                        className="w-full rounded-t-md bg-[var(--accent)]/70 transition-all duration-150 group-hover:bg-[var(--accent)] group-hover:shadow-md"
                        style={{ height: `${barHeight}%` }}
                      />

                      {/* Tooltip */}
                      <span className="pointer-events-none absolute -top-9 z-20 whitespace-nowrap rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                        {point.label} · {point.orders} {locale === "ar" ? "طلب" : "orders"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Date labels at boundaries */}
              <div className="mt-3 flex justify-between border-t border-[var(--line)] pt-2 text-[11px] text-[var(--ink-muted)] font-medium tabular-nums">
                <span>{series[0]?.label}</span>
                <span className="text-center font-semibold text-[var(--ink-soft)]">
                  {series.reduce((sum, p) => sum + p.orders, 0)} {locale === "ar" ? "طلب إجمالي" : "total orders"}
                </span>
                <span>{series[series.length - 1]?.label}</span>
              </div>
            </div>
          )}
        </section>

        {/* Earnings & Margin Breakdown */}
        <section className="admin-card flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
            <h2 className="text-base font-bold text-[var(--ink)]">{o.earnings.title}</h2>
            <span className="admin-badge admin-badge-accent text-xs">
              {locale === "ar" ? "الأرباح" : "Margins"}
            </span>
          </div>

          {!earnings ? (
            <p className="py-12 text-center text-sm text-[var(--ink-muted)]">{o.earnings.unavailable}</p>
          ) : (
            <div className="space-y-4 pt-4">
              <EarningsBlock
                window={earnings.week}
                title={o.earnings.last7}
                money={money}
                labels={{
                  revenue: o.earnings.revenue,
                  cost: o.earnings.cost,
                  profit: o.earnings.profit,
                }}
                unknownNote={o.earnings.unknownCost}
                locale={locale}
              />

              <EarningsBlock
                window={earnings.month}
                title={o.earnings.last30}
                money={money}
                labels={{
                  revenue: o.earnings.revenue,
                  cost: o.earnings.cost,
                  profit: o.earnings.profit,
                }}
                unknownNote={o.earnings.unknownCost}
                locale={locale}
              />
            </div>
          )}
        </section>
      </div>

      {/* 5. Supplier Wallets Section */}
      <section className="admin-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">{o.wallets.title}</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              {locale === "ar"
                ? "أرصدة المزودين المحدثة للمزامنة والشحن الفوري"
                : "Real-time provider balances for fulfillment and auto-sync"}
            </p>
          </div>
          <Link
            to={`/${locale}/dashboard/providers`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors"
          >
            <span>{o.wallets.manage}</span>
            <ArrowIcon
              direction={locale === "ar" ? "start" : "end"}
              className="size-3.5"
            />
          </Link>
        </div>

        {wallets.length === 0 ? (
          <p className="py-6 text-sm text-[var(--ink-muted)]">{o.wallets.none}</p>
        ) : (
          <div className="pt-2">
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

      {/* 6. Recent Orders Feed */}
      <section className="admin-card space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">{o.latest.title}</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              {locale === "ar"
                ? "آخر الطلبات المسجلة في المتجر"
                : "Most recent purchases across all products"}
            </p>
          </div>
          <Link
            to={`/${locale}/dashboard/orders`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors"
          >
            <span>{o.latest.viewAll}</span>
            <ArrowIcon
              direction={locale === "ar" ? "start" : "end"}
              className="size-3.5"
            />
          </Link>
        </div>

        {!latest || latest.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">{o.latest.empty}</p>
        ) : (
          <div className="divide-y divide-[var(--line)] -mx-2 sm:-mx-3">
            {latest.map((order) => (
              <Link
                key={order.id}
                to={`/${locale}/dashboard/orders/${order.id}`}
                className="flex items-center justify-between gap-3 px-3 py-3.5 rounded-[var(--radius-control)] hover:bg-[var(--surface-strong)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">
                    {order.itemName ?? order.orderNumber}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
                      #{order.orderNumber}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                  <span
                    className="text-sm font-bold text-[var(--ink)] tabular-nums"
                    dir="ltr"
                  >
                    {formatPrice(order.total, order.currency, locale)}
                  </span>
                  <OrderStatusBadge
                    messages={getMessages(locale, "checkout")}
                    status={order.status}
                  />
                  <ArrowIcon
                    direction={locale === "ar" ? "start" : "end"}
                    className="size-3.5 text-[var(--ink-muted)] opacity-60"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 7. Lifetime Overview & Catalog Summary Pill */}
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-inset)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-[var(--ink-soft)] font-medium">
            {lifetimeItems.map((item, idx) => (
              <div key={item.label} className="flex items-center gap-2">
                <span>{item.label}:</span>
                <span className="font-bold text-[var(--ink)] tabular-nums">{item.value}</span>
                {idx < lifetimeItems.length - 1 ? (
                  <span className="text-[var(--line-strong)] select-none">·</span>
                ) : null}
              </div>
            ))}
          </div>

          <Link
            to={`/${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            <span>{o.actions.viewStore}</span>
            <ArrowIcon direction={locale === "ar" ? "start" : "end"} className="size-3" />
          </Link>
        </div>
      </div>

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

function EarningsBlock({
  window,
  title,
  money,
  labels,
  unknownNote,
  locale,
}: {
  window: EarningsWindow;
  title: string;
  money: (value: number | null | undefined) => string;
  labels: { revenue: string; cost: string; profit: string };
  unknownNote: string;
  locale: string;
}) {
  const marginPercent =
    window.revenue && window.profit !== null && window.revenue > 0
      ? Math.round((window.profit / window.revenue) * 100)
      : null;

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--ink)]">{title}</span>
        {marginPercent !== null ? (
          <span
            className={cn(
              "admin-badge text-[11px] font-semibold",
              marginPercent > 20
                ? "admin-badge-success"
                : marginPercent > 0
                  ? "admin-badge-accent"
                  : "admin-badge-danger",
            )}
          >
            {marginPercent}% {locale === "ar" ? "هامش ربح" : "margin"}
          </span>
        ) : null}
      </div>

      {/* Simple margin bar indicator */}
      {marginPercent !== null && marginPercent > 0 ? (
        <div className="h-1.5 w-full rounded-full bg-[var(--surface-strong)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(2, marginPercent))}%` }}
          />
        </div>
      ) : null}

      <dl className="grid gap-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-muted)]">{labels.revenue}</dt>
          <dd className="font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
            {money(window.revenue)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-muted)]">{labels.cost}</dt>
          <dd className="tabular-nums text-[var(--ink-soft)]" dir="ltr">
            {window.cost === null ? unknownNote : money(window.cost)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-2">
          <dt className="font-bold text-[var(--ink)]">{labels.profit}</dt>
          <dd
            className="font-bold text-[var(--success)] tabular-nums text-sm"
            dir="ltr"
          >
            {window.profit === null ? unknownNote : money(window.profit)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
