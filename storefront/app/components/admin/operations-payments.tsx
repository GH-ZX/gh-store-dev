import { getMessages } from "@/i18n/messages";
import { Link } from "react-router";
import * as UI from "./operations-shared";
import { ArrowIcon, WalletIcon } from "@/components/ui/icons";

export function PaymentsView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "payments" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const copy = getMessages(view.locale, "admin").payments;

  const totalsLabels: Record<string, string> = {
    total: t("Total", "الإجمالي"),
    attention: t("Needs attention", "تحتاج متابعة"),
    awaitingReview: t("Awaiting review", "بانتظار المراجعة"),
    settled: t("Settled", "تمت التسوية"),
  };

  return (
    <div className="space-y-6">
      {/* 1. Metric Stat Cards Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(view.payments.totals).map(([key, value]) => {
          const isAttention = key === "attention" && typeof value === "number" && value > 0;

          return (
            <div
              key={key}
              className={
                isAttention
                  ? "admin-card border-[var(--warning)]/30 bg-[var(--warning-surface)]/20"
                  : "admin-card"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
                  <bdi>{totalsLabels[key] ?? key}</bdi>
                </span>
                <div
                  className={
                    isAttention
                      ? "flex size-7 items-center justify-center rounded-lg bg-[var(--warning)]/20 text-[var(--warning)]"
                      : "flex size-7 items-center justify-center rounded-lg bg-[var(--surface-strong)] text-[var(--ink-muted)]"
                  }
                >
                  <WalletIcon className="size-3.5" />
                </div>
              </div>
              <p
                className={
                  isAttention
                    ? "mt-2 text-2xl font-bold tracking-tight text-[var(--warning)] tabular-nums"
                    : "mt-2 text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums"
                }
              >
                {value}
              </p>
            </div>
          );
        })}
      </div>

      {/* 2. Filter Toolbar */}
      <UI.Filters
        q=""
        status={view.status}
        options={["all", "attention"]}
        ar={ar}
      />

      {/* 3. Payments Feed */}
      {view.payments.rows.length === 0 ? (
        <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
          {t("No payments match this view.", "لا توجد مدفوعات تطابق هذا العرض.")}
        </div>
      ) : (
        <div className="grid gap-3">
          {view.payments.rows.map((row) => (
            <article className="admin-card space-y-3" key={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong className="font-mono text-sm text-[var(--ink)]" dir="ltr">
                    #{row.reference}
                  </strong>
                  <UI.Badge>{row.state}</UI.Badge>
                  <UI.Money amount={row.amount} currency={row.currency} />
                  <span className="admin-badge admin-badge-neutral">
                    {row.paymentMethod}
                  </span>
                </div>

                <UI.DateTime value={row.createdAt} />
              </div>

              <p className="text-xs text-[var(--ink-soft)]">
                {(copy.explain as Record<string, string>)[row.state]}
              </p>

              <div className="grid gap-2 sm:grid-cols-3 text-xs bg-[var(--surface-inset)] p-3 rounded-lg border border-[var(--line)]">
                <div>
                  <span className="text-[var(--ink-muted)] block">{t("Customer", "العميل")}:</span>
                  <Link
                    to={`/${view.locale}/dashboard/customers/${row.customer.id}`}
                    className="font-medium text-[var(--accent)] hover:underline mt-0.5 inline-block"
                  >
                    <bdi>{row.customer.name || row.customer.email}</bdi>
                  </Link>
                </div>

                <div>
                  <span className="text-[var(--ink-muted)] block">
                    {t("Request / invoice", "الطلب / الفاتورة")}:
                  </span>
                  <span className="font-mono text-[var(--ink)] font-semibold mt-0.5 inline-block" dir="ltr">
                    {row.requestStatus} / {row.invoiceStatus ?? "—"}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--ink-muted)] block">
                    {t("Billed / paid", "المطلوب / المدفوع")}:
                  </span>
                  <span className="font-mono text-[var(--ink)] font-semibold mt-0.5 inline-block" dir="ltr">
                    {row.billedAmount ?? "—"} / {row.paidAmount ?? "—"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                {row.creditedAmount !== null ? (
                  <p className="text-[var(--ink-soft)]">
                    {t("Credited", "الرصيد المضاف")}:{" "}
                    <strong className="text-[var(--success)]">
                      <UI.Money amount={row.creditedAmount} />
                    </strong>
                  </p>
                ) : (
                  <span />
                )}

                <Link
                  className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                  to={`/${view.locale}/dashboard/recharges`}
                >
                  <span>{t("Review recharges", "مراجعة التعبئة")}</span>
                  <ArrowIcon
                    direction={ar ? "start" : "end"}
                    className="size-3"
                  />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
