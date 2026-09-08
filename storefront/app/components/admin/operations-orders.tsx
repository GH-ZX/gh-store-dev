import { Form } from "react-router";
import * as UI from "./operations-shared";
import { SyncIcon } from "@/components/ui/icons";

import { BrowserNotificationBanner } from "@/components/shared/browser-notification-banner";
export function OrdersView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "orders" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  return (
    <div className="space-y-6">
      <BrowserNotificationBanner locale={view.locale} />
      {/* Search & Filter Toolbar */}
      <UI.Filters
        q={view.q}
        status={view.status}
        search
        ar={ar}
        options={[
          "all",
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
