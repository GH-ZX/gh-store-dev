import { useState } from "react";
import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
import { ChevronIcon, UserIcon, WalletIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toaster";

export function CustomerView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "customer" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const customer = view.detail.customer;
  const displayName =
    customer.fullName || customer.username || customer.email || "Customer";
  const initial = (displayName.charAt(0) || "U").toUpperCase();
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");

  const fillTestNotification = () => {
    setMsgTitle(ar ? "إشعار تجريبي من إدارة المتجر" : "Test notification from Store Admin");
    setMsgBody(
      ar
        ? "هذا إشعار تجريبي لاختبار وصول التنبيهات والإشعارات بنجاح إلى حسابك في متجر GH."
        : "This is a test notification to verify that notifications and alerts are delivered successfully to your GH Store account.",
    );
    toast.info(ar ? "تم ملء بيانات الإشعار التجريبي" : "Test notification fields prefilled");
  };


  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          to={`/${view.locale}/dashboard/customers`}
        >
          <ChevronIcon
            direction={ar ? "end" : "start"}
            className="size-4"
          />
          <span>{t("Back to customers", "العودة للعملاء")}</span>
        </Link>
      </div>

      {/* Customer Hero Profile Card */}
      <section className="admin-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-base border border-[var(--accent-line)]">
              {initial}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--ink)]">
                  <bdi>{displayName}</bdi>
                </h2>
                <UI.Badge>{customer.role}</UI.Badge>
                <span
                  className={
                    customer.isActive
                      ? "admin-badge admin-badge-success"
                      : "admin-badge admin-badge-danger"
                  }
                >
                  {customer.isActive
                    ? t("Active", "نشط")
                    : t("Suspended", "موقوف")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[var(--ink-muted)]">
                <span>{customer.email}</span>
                {customer.username ? (
                  <>
                    <span className="text-[var(--line-strong)] select-none">·</span>
                    <span className="font-mono">@{customer.username}</span>
                  </>
                ) : null}
                <span className="text-[var(--line-strong)] select-none">·</span>
                <span>
                  {t("Joined", "انضم")}: <UI.DateTime value={customer.createdAt} />
                </span>
              </div>
            </div>
          </div>

          <div className="sm:text-end rounded-lg bg-[var(--surface-inset)] p-3 border border-[var(--line)]">
            <span className="text-xs text-[var(--ink-muted)] block">
              {t("Wallet balance", "رصيد المحفظة")}
            </span>
            <span className="text-xl font-bold text-[var(--ink)] mt-0.5 block">
              <UI.Money
                amount={customer.balance}
                currency={customer.currency}
              />
            </span>
          </div>
        </div>

        {/* Action Form Grid: Balance Adjust & Account Permissions */}
        <div className="grid gap-6 md:grid-cols-2 pt-2">
          {/* 1. Wallet Balance Adjustment */}
          <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] p-4">
            <div className="flex items-center gap-2">
              <WalletIcon className="size-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-[var(--ink)]">
                {t("Adjust wallet balance", "تعديل رصيد المحفظة")}
              </h3>
            </div>

            <Form method="post" className="space-y-3" key={view.idempotencyKey}>
              <UI.Hidden name="userId" value={customer.id} />
              <UI.Hidden name="idempotencyKey" value={view.idempotencyKey} />

              <UI.Field
                label={t("Amount (positive to add, negative to deduct)", "المبلغ (موجب للإضافة، سالب للخصم)")}
              >
                <input
                  className={UI.inputClass}
                  name="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                />
              </UI.Field>

              <UI.Field label={t("Reason / note", "السبب أو الملاحظة")}>
                <textarea
                  className={UI.inputClass}
                  name="note"
                  required
                  rows={2}
                  maxLength={2000}
                  placeholder={t("Reason for balance change...", "سبب تعديل الرصيد...")}
                />
              </UI.Field>

              <UI.Submit intent="adjust" variant="primary">
                {t("Apply adjustment", "تطبيق التعديل")}
              </UI.Submit>
            </Form>
          </div>

          {/* 2. Account Access & Role */}
          <div className="space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] p-4">
            <div className="flex items-center gap-2">
              <UserIcon className="size-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-[var(--ink)]">
                {t("Account access & status", "صلاحيات وحالة الحساب")}
              </h3>
            </div>

            {/* Change Role Form */}
            <Form method="post" className="space-y-3">
              <UI.Hidden name="userId" value={customer.id} />
              <UI.Field label={t("Role", "الدور")}>
                <select
                  className={UI.inputClass}
                  name="role"
                  defaultValue={customer.role}
                >
                  <option value="customer">{t("Customer", "عميل")}</option>
                  <option value="admin">{t("Administrator", "مشرف")}</option>
                </select>
              </UI.Field>

              <UI.Submit intent="role">
                {t("Save role", "حفظ الدور")}
              </UI.Submit>
            </Form>

            {/* Suspend / Reactivate Form */}
            <div className="pt-3 border-t border-[var(--line)]">
              <Form method="post">
                <UI.Hidden name="userId" value={customer.id} />
                <UI.Hidden
                  name="active"
                  value={String(!customer.isActive)}
                />
                <UI.Submit
                  intent="active"
                  variant={customer.isActive ? "danger" : "secondary"}
                >
                  {customer.isActive
                    ? t("Suspend account", "إيقاف الحساب")
                    : t("Reactivate account", "تنشيط الحساب")}
                </UI.Submit>
              </Form>
            </div>
          </div>
        </div>

        {/* 3. Message Customer Form */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--ink)]">
              {t("Message customer", "مراسلة العميل")}
            </h3>
            <button
              type="button"
              onClick={fillTestNotification}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors cursor-pointer"
            >
              <span>{t("Fill test notification", "تعبئة بإشعار تجريبي")}</span>
            </button>
          </div>

          <Form method="post" className="grid gap-3">
            <UI.Hidden name="userId" value={customer.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <UI.Field label={t("Subject / title", "العنوان")}>
                <input
                  className={UI.inputClass}
                  name="title"
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  required
                  maxLength={120}
                  placeholder={t("Notification title...", "عنوان الإشعار...")}
                />
              </UI.Field>
            </div>

            <UI.Field label={t("Message body", "نص الرسالة")}>
              <textarea
                className={UI.inputClass}
                name="body"
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                required
                rows={3}
                maxLength={1000}
                placeholder={t("Enter message body...", "نص الرسالة أو التنبيه للعميل...")}
              />
            </UI.Field>

            <div>
              <UI.Submit intent="message">
                {t("Send message", "إرسال الرسالة")}
              </UI.Submit>
            </div>
          </Form>
        </div>
      </section>

      {/* Recent Orders by Customer */}
      <section className="space-y-3">
        <h3 className="text-base font-bold text-[var(--ink)]">
          {t("Recent orders", "أحدث الطلبات")} ({view.detail.orders.length})
        </h3>
        <UI.Orders rows={view.detail.orders} locale={view.locale} />
      </section>

      {/* Recent Recharges by Customer */}
      <section className="space-y-3">
        <h3 className="text-base font-bold text-[var(--ink)]">
          {t("Recent recharges", "أحدث التعبئات")} ({view.detail.recharges.length})
        </h3>
        <UI.RechargeRows rows={view.detail.recharges} locale={view.locale} />
      </section>

      {/* Wallet Transaction Ledger */}
      {view.detail.transactions.length > 0 && (
        <section className="admin-card space-y-3">
          <h3 className="text-base font-bold text-[var(--ink)]">
            {t("Wallet history", "سجل المحفظة")} ({view.detail.transactions.length})
          </h3>

          <div className="divide-y divide-[var(--line)]">
            {view.detail.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <UI.Badge>{tx.type}</UI.Badge>
                  <span className="text-[var(--ink-soft)]">{tx.description}</span>
                </div>

                <div className="flex items-center gap-3">
                  <strong className="text-[var(--ink)]">
                    <UI.Money amount={tx.amount} />
                  </strong>
                  <span className="text-[var(--ink-muted)]">
                    ({t("Balance", "الرصيد")}: <UI.Money amount={tx.balanceAfter} />)
                  </span>
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
