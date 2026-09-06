import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
export function OrderView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "order" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <Link
        className="text-accent underline"
        to={`/${view.locale}/dashboard/orders`}
      >
        {t("Back to orders", "العودة للطلبات")}
      </Link>
      <section className={UI.panelClass}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">
            <bdi>{view.order.orderNumber}</bdi>
          </h2>
          <UI.Badge>{view.order.status}</UI.Badge>
          <UI.Badge>{view.order.paymentStatus}</UI.Badge>
          <UI.Money amount={view.order.total} currency={view.order.currency} />
        </div>
        <Link
          className="underline"
          to={`/${view.locale}/dashboard/customers/${view.order.customer.id}`}
        >
          <bdi>{view.order.customer.name || view.order.customer.email}</bdi>
        </Link>
        <UI.DateTime value={view.order.createdAt} />
        {view.order.customerNote && <p>{view.order.customerNote}</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>{t("Subtotal", "المجموع")}</dt>
          <dd>
            <UI.Money
              amount={view.order.subtotal}
              currency={view.order.currency}
            />
          </dd>
          <dt>{t("Discount", "الخصم")}</dt>
          <dd>
            <UI.Money
              amount={view.order.discount}
              currency={view.order.currency}
            />
          </dd>
          <dt>{t("Payment method", "طريقة الدفع")}</dt>
          <dd>{view.order.paymentMethod ?? "—"}</dd>
        </dl>
        <UI.JsonDetails
          value={view.order.metadata}
          label={t("Order metadata", "بيانات الطلب")}
        />
      </section>
      {view.order.items.map((item) => (
        <section className={UI.panelClass} key={item.id}>
          <h2 className="text-lg font-bold">
            {item.name} × {item.quantity}
          </h2>
          <UI.Money amount={item.totalPrice} currency={view.order.currency} />
          <dl className="grid gap-2">
            {item.dynamicFields.map((field) => (
              <div key={field.key} className="flex flex-wrap gap-3">
                <dt>{field.key}</dt>
                <dd>
                  <bdi>{field.value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {item.attempts.map((attempt) => (
            <article
              className="rounded-xl border border-line p-3"
              key={attempt.id}
            >
              <div className="flex flex-wrap gap-3">
                <UI.Badge>{attempt.provider}</UI.Badge>
                <UI.Badge>{attempt.status}</UI.Badge>
                <span>#{attempt.attemptNumber}</span>
                <bdi>{attempt.externalOrderId}</bdi>
                <UI.DateTime value={attempt.createdAt} />
              </div>
              {attempt.errorMessage && (
                <p role="alert" className="mt-2 text-danger">
                  {attempt.errorCode}: {attempt.errorMessage}
                </p>
              )}
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
                  label={t("Delivery", "التسليم")}
                />
              )}
            </article>
          ))}
        </section>
      ))}
      <section className={UI.panelClass}>
        <h2 className="text-lg font-bold">
          {t("Order operations", "إجراءات الطلب")}
        </h2>
        {!["completed", "refunded", "cancelled"].includes(view.order.status) ? (
          <>
            <Form method="post">
              <UI.Hidden name="orderId" value={view.order.id} />
              <UI.Submit intent="retry">
                {t("Retry fulfillment", "إعادة محاولة التنفيذ")}
              </UI.Submit>
            </Form>
            <Form method="post" className="grid gap-3">
              <UI.Hidden name="orderId" value={view.order.id} />
              <UI.Field
                label={t("Operator note (required)", "ملاحظة المشرف (مطلوبة)")}
              >
                <textarea
                  className={UI.inputClass}
                  name="note"
                  required
                  maxLength={2000}
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
                />
              </UI.Field>
              <div className="flex flex-wrap gap-3">
                <UI.Submit intent="deliver">
                  {t("Mark delivered", "تأكيد التسليم")}
                </UI.Submit>
                {view.order.paymentMethod === "wallet" &&
                  view.order.paymentStatus === "paid" && (
                    <UI.Submit intent="refund">
                      {t("Refund to wallet", "استرداد إلى المحفظة")}
                    </UI.Submit>
                  )}
              </div>
            </Form>
          </>
        ) : view.order.status === "completed" ? (
          <Form method="post">
            <UI.Hidden name="orderId" value={view.order.id} />
            <UI.Submit intent="resend">
              {t("Resend delivery notification", "إعادة إرسال إشعار التسليم")}
            </UI.Submit>
          </Form>
        ) : (
          <p>{t("This order is settled.", "تمت تسوية هذا الطلب.")}</p>
        )}
      </section>
      <section className={UI.panelClass}>
        <h2 className="text-lg font-bold">
          {t("Wallet movements", "حركات المحفظة")}
        </h2>
        {view.order.transactions.map((tx) => (
          <p key={tx.id}>
            <UI.DateTime value={tx.createdAt} /> —{" "}
            <UI.Badge>{tx.type}</UI.Badge> <UI.Money amount={tx.amount} /> —{" "}
            {tx.description}
          </p>
        ))}
      </section>
    </>
  );
}
