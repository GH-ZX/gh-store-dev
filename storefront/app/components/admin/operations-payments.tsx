import { getMessages } from "@/i18n/messages";
import { Link } from "react-router";
import * as UI from "./operations-shared";
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
    <>
      <div className="flex flex-wrap gap-4">
        {Object.entries(view.payments.totals).map(([key, value]) => (
          <span className={UI.panelClass} key={key}>
            <bdi>{totalsLabels[key] ?? key}</bdi>
            <strong className="text-2xl">{value}</strong>
          </span>
        ))}
      </div>
      <UI.Filters
        q=""
        status={view.status}
        options={["all", "attention"]}
        ar={ar}
      />
      {view.payments.rows.length === 0 && (
        <p className="text-ink-muted">
          {t(
            "No payments match this view.",
            "لا توجد مدفوعات تطابق هذا العرض.",
          )}
        </p>
      )}
      <div className="grid gap-3">
        {view.payments.rows.map((row) => (
          <article className={UI.panelClass} key={row.id}>
            <div className="flex flex-wrap gap-3">
              <strong>
                <bdi>{row.reference}</bdi>
              </strong>
              <UI.Badge>{row.state}</UI.Badge>
              <UI.Money amount={row.amount} currency={row.currency} />
              <UI.Badge>{row.paymentMethod}</UI.Badge>
            </div>
            <p className="text-sm text-ink-muted">
              {(copy.explain as Record<string, string>)[row.state]}
            </p>
            <Link
              to={`/${view.locale}/dashboard/customers/${row.customer.id}`}
              className="underline"
            >
              <bdi>{row.customer.name || row.customer.email}</bdi>
            </Link>
            <p>
              {t("Request / invoice", "الطلب / الفاتورة")}:{" "}
              <bdi>
                {row.requestStatus} / {row.invoiceStatus ?? "—"}
              </bdi>
            </p>
            <p>
              {t("Credited", "الرصيد المضاف")}:{" "}
              {row.creditedAmount === null ? (
                "—"
              ) : (
                <UI.Money amount={row.creditedAmount} />
              )}
            </p>
            <p>
              {t("Billed / paid", "المطلوب / المدفوع")}:{" "}
              <bdi>
                {row.billedAmount ?? "—"} / {row.paidAmount ?? "—"}
              </bdi>
            </p>
            <UI.DateTime value={row.createdAt} />
            <Link
              className="text-accent underline"
              to={`/${view.locale}/dashboard/recharges`}
            >
              {t("Review recharges", "مراجعة التعبئة")}
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
