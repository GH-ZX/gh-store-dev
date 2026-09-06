import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
export function CustomerView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "customer" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <Link
        className="text-accent underline"
        to={`/${view.locale}/dashboard/customers`}
      >
        {t("Back to customers", "العودة للعملاء")}
      </Link>
      <section className={UI.panelClass}>
        <h2 className="text-xl font-bold">
          <bdi>
            {view.detail.customer.fullName ||
              view.detail.customer.username ||
              view.detail.customer.email}
          </bdi>
        </h2>
        <bdi>{view.detail.customer.email}</bdi>
        <UI.Money
          amount={view.detail.customer.balance}
          currency={view.detail.customer.currency}
        />
        <UI.Badge>{view.detail.customer.role}</UI.Badge>
        <UI.Badge>
          {view.detail.customer.isActive
            ? t("Active", "نشط")
            : t("Suspended", "موقوف")}
        </UI.Badge>
      </section>
      <section className={UI.panelClass}>
        <h2 className="text-lg font-bold">
          {t("Adjust wallet balance", "تعديل رصيد المحفظة")}
        </h2>
        <Form method="post" className="grid gap-3" key={view.idempotencyKey}>
          <UI.Hidden name="userId" value={view.detail.customer.id} />
          <UI.Hidden name="idempotencyKey" value={view.idempotencyKey} />
          <UI.Field
            label={t("Amount (negative to deduct)", "المبلغ (سالب للخصم)")}
          >
            <input
              className={UI.inputClass}
              name="amount"
              type="number"
              step="0.01"
              required
            />
          </UI.Field>
          <UI.Field label={t("Reason", "السبب")}>
            <textarea
              className={UI.inputClass}
              name="note"
              required
              maxLength={2000}
            />
          </UI.Field>
          <UI.Submit intent="adjust">
            {t("Adjust balance", "تعديل الرصيد")}
          </UI.Submit>
        </Form>
      </section>
      <section className={UI.panelClass}>
        <h2 className="text-lg font-bold">
          {t("Account access", "صلاحيات الحساب")}
        </h2>
        <Form method="post" className="flex flex-wrap gap-3">
          <UI.Hidden name="userId" value={view.detail.customer.id} />
          <UI.Field label={t("Role", "الدور")}>
            <select
              className={UI.inputClass}
              name="role"
              defaultValue={view.detail.customer.role}
            >
              <option value="customer">{t("Customer", "عميل")}</option>
              <option value="admin">{t("Administrator", "مشرف")}</option>
            </select>
          </UI.Field>
          <UI.Submit intent="role">{t("Save role", "حفظ الدور")}</UI.Submit>
        </Form>
        <Form method="post">
          <UI.Hidden name="userId" value={view.detail.customer.id} />
          <UI.Hidden
            name="active"
            value={String(!view.detail.customer.isActive)}
          />
          <UI.Submit intent="active">
            {view.detail.customer.isActive
              ? t("Suspend account", "إيقاف الحساب")
              : t("Reactivate account", "تنشيط الحساب")}
          </UI.Submit>
        </Form>
      </section>
      <section className={UI.panelClass}>
        <h2 className="text-lg font-bold">
          {t("Message customer", "مراسلة العميل")}
        </h2>
        <Form method="post" className="grid gap-3">
          <UI.Hidden name="userId" value={view.detail.customer.id} />
          <UI.Field label={t("Title", "العنوان")}>
            <input
              className={UI.inputClass}
              name="title"
              required
              maxLength={120}
            />
          </UI.Field>
          <UI.Field label={t("Message", "الرسالة")}>
            <textarea
              className={UI.inputClass}
              name="body"
              required
              maxLength={1000}
            />
          </UI.Field>
          <UI.Submit intent="message">
            {t("Send message", "إرسال الرسالة")}
          </UI.Submit>
        </Form>
      </section>
      <h2 className="text-lg font-bold">
        {t("Recent orders", "أحدث الطلبات")}
      </h2>
      <UI.Orders rows={view.detail.orders} locale={view.locale} />
      <h2 className="text-lg font-bold">
        {t("Recent recharges", "أحدث التعبئات")}
      </h2>
      <UI.RechargeRows rows={view.detail.recharges} locale={view.locale} />
      <section className={UI.panelClass}>
        <h2 className="text-lg font-bold">
          {t("Wallet history", "سجل المحفظة")}
        </h2>
        {view.detail.transactions.map((tx) => (
          <p key={tx.id}>
            <UI.DateTime value={tx.createdAt} /> —{" "}
            <UI.Badge>{tx.type}</UI.Badge> <UI.Money amount={tx.amount} /> —{" "}
            {tx.description} ({t("Balance", "الرصيد")}:{" "}
            <UI.Money amount={tx.balanceAfter} />)
          </p>
        ))}
      </section>
    </>
  );
}
