import { Form } from "react-router";
import * as UI from "./operations-shared";
import { SyncIcon } from "@/components/ui/icons";
import { HeldOrdersPanel } from "./operations-held-orders";
import { RiskHoldsPanel } from "./operations-risk-holds";

import { BrowserNotificationBanner } from "@/components/shared/browser-notification-banner";
export function OrdersView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "orders" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const handleExportCsv = () => {
    const headers = [
      ar ? "رقم الطلب" : "Order #",
      ar ? "العميل" : "Customer",
      ar ? "البريد الإلكتروني" : "Email",
      ar ? "المنتجات" : "Items",
      ar ? "الحالة" : "Status",
      ar ? "الإجمالي" : "Total",
      ar ? "العملة" : "Currency",
      ar ? "التاريخ" : "Date",
    ];

    const lines = [
      headers.join(","),
      ...view.orders.map((o) =>
        [
          `"${o.orderNumber}"`,
          `"${(o.customer.name || "").replace(/"/g, '""')}"`,
          `"${(o.customer.email || "").replace(/"/g, '""')}"`,
          `"${(o.itemNames || []).join(" | ").replace(/"/g, '""')}"`,
          `"${o.status}"`,
          o.total,
          `"${o.currency}"`,
          `"${o.createdAt}"`,
        ].join(","),
      ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <BrowserNotificationBanner locale={view.locale} />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={view.orders.length === 0}
          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)] disabled:opacity-40 transition-colors cursor-pointer"
        >
          <span>{ar ? "تصدير الطلبات CSV" : "Export Orders CSV"}</span>
        </button>
      </div>
      {/* Search & Filter Toolbar */}
      <UI.Filters
        q={view.q}
        status={view.status}
        search
        ar={ar}
        options={[
          "all",
          "held",
          "attention",
          "low_funds",
          "manual",
          "pending",
          "payment_pending",
          "paid",
          "processing",
          "fulfilling",
          "completed",
          "failed",
          "refunded",
          "cancelled",
        ]}
      />

      {/*
        * Always rendered, not only when the chip is selected: a wallet running
        * dry is the one queue the owner must not have to go looking for, and the
        * count is on the overview too.
        */}
      <HeldOrdersPanel locale={view.locale} rows={view.heldOrders} />

      {/* Automated velocity & fraud holds */}
      <RiskHoldsPanel locale={view.locale} rows={view.riskHolds} />

      {/* Delivery Reconciliation Card */}
      <section className="admin-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <SyncIcon className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--ink)]">
                {t("Delivery reconciliation", "مطابقة التسليم")}
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                {t(
                  "Check pending provider deliveries and payments for their latest results.",
                  "تحقق من أحدث نتائج الطلبات والمدفوعات المعلقة لدى المزودين.",
                )}
              </p>
            </div>
          </div>

          <Form method="post">
            <UI.Submit intent="reconcile" variant="primary">
              <span className="flex items-center gap-1.5">
                <SyncIcon className="size-3.5" />
                <span>
                  {t(
                    "Reconcile pending orders",
                    "مطابقة الطلبات المعلقة",
                  )}
                </span>
              </span>
            </UI.Submit>
          </Form>
        </div>

        {view.lastRun ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-soft)] bg-[var(--surface-inset)] p-3 rounded-lg border border-[var(--line)]">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="text-[var(--ink-muted)]">{t("Last check", "آخر فحص")}:</span>
              <UI.DateTime value={view.lastRun.startedAt} />
            </span>
            <UI.Badge>{view.lastRun.status}</UI.Badge>
            <span className="text-[var(--line-strong)] select-none">·</span>
            <span>
              <strong className="text-[var(--ink)]">{view.lastRun.checked}</strong> {t("Checked", "تم فحصها")}
            </span>
            <span className="text-[var(--line-strong)] select-none">·</span>
            <span>
              <strong className="text-[var(--success)]">{view.lastRun.completed}</strong> {t("Completed", "مكتملة")}
            </span>
            <span className="text-[var(--line-strong)] select-none">·</span>
            <span>
              <strong className="text-[var(--ink-soft)]">{view.lastRun.refunded}</strong> {t("Refunded", "مستردة")}
            </span>
            {view.lastRun.escalated > 0 ? (
              <>
                <span className="text-[var(--line-strong)] select-none">·</span>
                <span className="text-[var(--warning)] font-bold">
                  {view.lastRun.escalated} {t("Needs attention", "تحتاج متابعة")}
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">
            {t("No reconciliation has run yet.", "لم تتم المطابقة بعد.")}
          </p>
        )}
      </section>

      {/* Orders Feed */}
      <UI.Orders rows={view.orders} locale={view.locale} />
    </div>
  );
}
