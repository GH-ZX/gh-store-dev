import { Form } from "react-router";
import * as UI from "./operations-shared";
export function OrdersView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "orders" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <UI.Filters
        q={view.q}
        status={view.status}
        search
        ar={ar}
        options={[
          "all",
          "attention",
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
      <section className={UI.panelClass}>
        <h2 className="text-lg font-semibold">
          {t("Delivery reconciliation", "مطابقة التسليم")}
        </h2>
        <p className="text-sm text-ink-muted">
          {t(
            "Check pending provider deliveries and payments for their latest results.",
            "تحقق من أحدث نتائج الطلبات والمدفوعات المعلقة لدى المزودين.",
          )}
        </p>
        {view.lastRun ? (
          <p className="text-sm">
            <UI.DateTime value={view.lastRun.startedAt} /> —{" "}
            <UI.Badge>{view.lastRun.status}</UI.Badge> ·{" "}
            {t("Checked", "تم فحصها")}: {view.lastRun.checked} ·{" "}
            {t("Completed", "مكتملة")}: {view.lastRun.completed} ·{" "}
            {t("Refunded", "مستردة")}: {view.lastRun.refunded} ·{" "}
            {t("Needs attention", "تحتاج متابعة")}: {view.lastRun.escalated}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            {t("No reconciliation has run yet.", "لم تتم المطابقة بعد.")}
          </p>
        )}
        <Form method="post">
          <UI.Submit intent="reconcile">
            {t(
              "Reconcile pending orders and payments",
              "مطابقة الطلبات والمدفوعات المعلقة",
            )}
          </UI.Submit>
        </Form>
      </section>
      <UI.Orders rows={view.orders} locale={view.locale} />
    </>
  );
}
