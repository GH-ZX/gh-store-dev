import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
import { ChevronIcon, UserIcon } from "@/components/ui/icons";

export function OrderView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "order" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  return (
    <div className="space-y-6">
      {/* Back Navigation Link */}
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          to={`/${view.locale}/dashboard/orders`}
        >
          <ChevronIcon
            direction={ar ? "end" : "start"}
            className="size-4"
          />
          <span>{t("Back to orders", "العودة للطلبات")}</span>
        </Link>
      </div>

      {/* Main Order Overview Card */}
      <section className="admin-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold font-mono text-[var(--ink)]" dir="ltr">
              #{view.order.orderNumber}
            </h2>
            <UI.Badge>{view.order.status}</UI.Badge>
            <UI.Badge>{view.order.paymentStatus}</UI.Badge>
          </div>

          <div className="text-xl font-bold text-[var(--ink)]">
            <UI.Money amount={view.order.total} currency={view.order.currency} />
          </div>
        </div>

        {/* Customer & Timestamp Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[var(--surface-inset)] p-3 rounded-lg border border-[var(--line)]">
          <Link
            className="flex items-center gap-2 font-medium text-[var(--accent)] hover:underline"
            to={`/${view.locale}/dashboard/customers/${view.order.customer.id}`}
          >
            <UserIcon className="size-3.5 text-[var(--ink-muted)]" />
            <bdi>{view.order.customer.name || view.order.customer.email}</bdi>
          </Link>

          <UI.DateTime value={view.order.createdAt} />
        </div>

        {view.order.customerNote && (
          <div className="rounded-lg bg-[var(--surface-inset)] p-3 text-xs text-[var(--ink-soft)] border border-[var(--line)]">
            <span className="font-semibold text-[var(--ink)] block mb-1">
              {t("Customer note", "ملاحظة العميل")}:
            </span>
            <p className="whitespace-pre-wrap">{view.order.customerNote}</p>
          </div>
        )}

        {/* Financial Breakdown */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5">
            <dt className="text-[var(--ink-muted)]">{t("Subtotal", "المجموع الفرعي")}</dt>
            <dd className="font-semibold text-[var(--ink)] mt-0.5">
              <UI.Money amount={view.order.subtotal} currency={view.order.currency} />
            </dd>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5">
            <dt className="text-[var(--ink-muted)]">{t("Discount", "الخصم")}</dt>
            <dd className="font-semibold text-[var(--ink)] mt-0.5">
              <UI.Money amount={view.order.discount} currency={view.order.currency} />
            </dd>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2.5 col-span-2 sm:col-span-1">
            <dt className="text-[var(--ink-muted)]">{t("Payment method", "طريقة الدفع")}</dt>
            <dd className="font-semibold text-[var(--ink)] mt-0.5">
              {view.order.paymentMethod ?? "—"}
            </dd>
          </div>
        </dl>

        <UI.JsonDetails
          value={view.order.metadata}
          label={t("Order metadata", "بيانات الطلب")}
        />
      </section>

      {/* Ordered Items & Fulfillment Attempts */}
      {view.order.items.map((item) => (
        <section className="admin-card space-y-4" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
            <h3 className="text-base font-bold text-[var(--ink)]">
              {item.name} <span className="text-[var(--ink-muted)]">× {item.quantity}</span>
            </h3>
            <div className="text-sm font-bold text-[var(--ink)]">
              <UI.Money amount={item.totalPrice} currency={view.order.currency} />
            </div>
          </div>

          {/* Dynamic Top-up Fields */}
          {item.dynamicFields.length > 0 && (
            <dl className="grid gap-2 text-xs bg-[var(--surface-inset)] p-3 rounded-lg border border-[var(--line)]">
              {item.dynamicFields.map((field) => (
                <div key={field.key} className="flex flex-wrap justify-between gap-2">
                  <dt className="font-medium text-[var(--ink-muted)]">{field.key}:</dt>
                  <dd className="font-mono font-semibold text-[var(--ink)]">
                    <bdi>{field.value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* Provider Fulfillment Attempts */}
          {item.attempts.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                {t("Fulfillment attempts", "محاولات التنفيذ")} ({item.attempts.length})
              </h4>

              {item.attempts.map((attempt) => (
                <article
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] p-3 space-y-2.5 text-xs"
                  key={attempt.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--ink)]">
                        #{attempt.attemptNumber}
                      </span>
                      <UI.Badge>{attempt.provider}</UI.Badge>
                      <UI.Badge>{attempt.status}</UI.Badge>
                      {attempt.externalOrderId ? (
                        <span className="font-mono text-[var(--ink-muted)]" dir="ltr">
                          ID: {attempt.externalOrderId}
                        </span>
                      ) : null}
                    </div>

                    <UI.DateTime value={attempt.createdAt} />
                  </div>

                  {attempt.errorMessage && (
                    <div
                      role="alert"
                      className="rounded-md bg-[var(--danger-surface)] border border-[var(--danger)]/20 p-2 text-xs text-[var(--danger)]"
                    >
                      <strong className="font-bold">{attempt.errorCode}:</strong> {attempt.errorMessage}
                    </div>
                  )}

                  <div className="space-y-1.5 pt-1">
                    <UI.JsonDetails
                      value={attempt.request}
                      label={t("Provider request", "طلب المزود")}
                    />
                    <UI.JsonDetails
                      value={attempt.response}
                      label={t("Provider response", "رد المزود")}
                    />
                    {attempt.delivered && (
                      <UI.JsonDetails
                        value={attempt.delivered}
                        label={t("Delivery details", "تفاصيل التسليم")}
                      />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* Operator Actions Section */}
      <section className="admin-card space-y-4">
        <h3 className="text-base font-bold text-[var(--ink)]">
          {t("Order operations", "إجراءات الطلب")}
        </h3>

        {!["completed", "refunded", "cancelled"].includes(view.order.status) ? (
          <div className="space-y-4">
            <Form method="post">
              <UI.Hidden name="orderId" value={view.order.id} />
              <UI.Submit intent="retry" variant="secondary">
                {t("Retry fulfillment", "إعادة محاولة التنفيذ")}
              </UI.Submit>
            </Form>

            <Form method="post" className="grid gap-3 pt-3 border-t border-[var(--line)]">
              <UI.Hidden name="orderId" value={view.order.id} />
              <UI.Field
                label={t("Operator note (required)", "ملاحظة المشرف (مطلوبة)")}
              >
                <textarea
                  className={UI.inputClass}
                  name="note"
                  required
                  maxLength={2000}
                  placeholder={t("Enter internal operator reason...", "أدخل سبب أو ملاحظة الإجراء...")}
                />
              </UI.Field>

              <UI.Field
                label={t(
                  "Delivery codes or URLs (one per line)",
                  "رموز أو روابط التسليم (واحد في كل سطر)",
                )}
              >
                <textarea
                  className={UI.inputClass}
                  name="deliveredPayload"
                  maxLength={20000}
                  dir="ltr"
                  placeholder="CODE-12345-XXXXX&#10;CODE-67890-YYYYY"
                />
              </UI.Field>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <UI.Submit intent="deliver" variant="primary">
                  {t("Mark delivered", "تأكيد التسليم")}
                </UI.Submit>
                {view.order.paymentMethod === "wallet" &&
                  view.order.paymentStatus === "paid" && (
                    <UI.Submit intent="refund" variant="danger">
                      {t("Refund to wallet", "استرداد إلى المحفظة")}
                    </UI.Submit>
                  )}
              </div>
            </Form>
          </div>
        ) : view.order.status === "completed" ? (
          <Form method="post">
            <UI.Hidden name="orderId" value={view.order.id} />
            <UI.Submit intent="resend" variant="secondary">
              {t("Resend delivery notification", "إعادة إرسال إشعار التسليم")}
            </UI.Submit>
          </Form>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">
            {t("This order is settled.", "تمت تسوية هذا الطلب.")}
          </p>
        )}
      </section>

      {/* Wallet Movements Ledger */}
      {view.order.transactions.length > 0 && (
        <section className="admin-card space-y-3">
          <h3 className="text-base font-bold text-[var(--ink)]">
            {t("Wallet movements", "حركات المحفظة")} ({view.order.transactions.length})
          </h3>

          <div className="divide-y divide-[var(--line)]">
            {view.order.transactions.map((tx) => (
              <div key={tx.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <UI.Badge>{tx.type}</UI.Badge>
                  <span className="text-[var(--ink-soft)]">{tx.description}</span>
                </div>

                <div className="flex items-center gap-3">
                  <strong className="text-[var(--ink)]">
                    <UI.Money amount={tx.amount} />
                  </strong>
                  <UI.DateTime value={tx.createdAt} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
