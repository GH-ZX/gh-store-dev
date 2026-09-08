import { Link } from "react-router";
import { AlertIcon, ArrowIcon, CheckIcon, DepositIcon, StarIcon, SupportIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import type { AttentionCounts } from "@server/lib/services/admin-overview.service";

export function OverviewAttention({ locale, attention }: { locale: Locale; attention: AttentionCounts }) {
  const copy = getMessages(locale, "admin").overview.attention;
  const items = [
    { key: "orders", count: attention.stuckOrders, href: "/orders?status=attention", label: copy.stuck, hint: copy.ordersHint, icon: AlertIcon },
    { key: "recharges", count: attention.pendingRecharges, href: "/recharges", label: copy.recharges, hint: copy.rechargesHint, icon: DepositIcon },
    { key: "payments", count: attention.paymentIssues, href: "/payments?status=attention", label: copy.payments, hint: copy.paymentsHint, icon: WalletIcon },
    { key: "support", count: attention.openSupportThreads, href: "/support", label: copy.support, hint: copy.supportHint, icon: SupportIcon },
    { key: "reviews", count: attention.pendingReviews, href: "/reviews?status=pending", label: copy.reviews, hint: copy.reviewsHint, icon: StarIcon },
  ];
  const total = items.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const complete = items.every((item) => item.count !== null);
  const number = new Intl.NumberFormat(locale);

  return (
    <section aria-labelledby="overview-attention-title" className="admin-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="overview-attention-title" className="text-sm font-bold tracking-wide text-[var(--ink)] uppercase">{copy.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{copy.description}</p>
        </div>
        {!complete ? <span className="admin-badge admin-badge-neutral">{copy.incomplete}</span> : total === 0 ? (
          <span className="admin-badge admin-badge-success"><CheckIcon className="size-3.5" />{copy.allClear}</span>
        ) : <span className="admin-badge admin-badge-warning">{formatMessage(copy.totalHint, { count: total }, locale)}</span>}
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const hasItems = item.count !== null && item.count > 0;
          return (
          <li key={item.key}>
            <Link to={`/${locale}/dashboard${item.href}`} className={cn("group relative grid h-full grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[var(--radius-card)] border p-4 pe-9 transition-colors duration-150 sm:flex sm:flex-col sm:gap-3 sm:pe-4", hasItems ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-surface)] hover:border-[var(--warning)]" : "border-[var(--line)] bg-[var(--surface-inset)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]")}>
              <span className="row-span-2 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", hasItems ? "bg-[var(--warning-surface)] text-[var(--warning)]" : "bg-[var(--surface-strong)] text-[var(--ink-muted)]")}><Icon className="size-4" /></span>
                <bdi className={cn("text-xl font-bold tabular-nums", hasItems ? "text-[var(--warning)]" : "text-[var(--ink-muted)]")}>{item.count === null ? "—" : number.format(item.count)}</bdi>
              </span>
              <span className="text-sm font-semibold leading-5 text-[var(--ink)]">{item.label}</span>
              <span className="col-start-2 text-xs leading-5 text-[var(--ink-muted)] sm:mt-auto">{item.count === null ? copy.unavailable : item.count === 0 ? copy.none : item.hint}</span>
              <ArrowIcon direction="end" className="absolute top-5 end-4 size-4 text-[var(--ink-muted)] sm:hidden rtl:rotate-180" />
            </Link>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
