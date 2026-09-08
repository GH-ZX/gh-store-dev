import { Form } from "react-router";
import * as UI from "./operations-shared";
import { DepositIcon, GearIcon } from "@/components/ui/icons";

export function RechargesView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "recharges" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const openCount = view.queues.open.length;

  return (
    <div className="space-y-8">
      {/* 1. Queue: Awaiting Review */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--warning-surface)] text-[var(--warning)]">
              <DepositIcon className="size-4" />
            </div>
            <h2 className="text-lg font-bold text-[var(--ink)]">
              {t("Awaiting review", "بانتظار المراجعة")}
            </h2>
          </div>

          <span
            className={
              openCount > 0
                ? "admin-badge admin-badge-warning"
                : "admin-badge admin-badge-neutral"
            }
          >
            {openCount} {ar ? "طلب" : "requests"}
          </span>
        </div>

        <UI.RechargeRows rows={view.queues.open} locale={view.locale} review />
      </section>

      {/* 2. Recharge Settings Drawer / Panel */}
      <details className="admin-card space-y-4">
        <summary className="cursor-pointer flex items-center justify-between font-bold text-sm text-[var(--ink)] select-none">
          <div className="flex items-center gap-2">
            <GearIcon className="size-4 text-[var(--ink-muted)]" />
            <span>{t("Recharge settings", "إعدادات التعبئة")}</span>
          </div>
          <span className="text-xs text-[var(--accent)] font-semibold">
            {t("Configure methods & limits", "تعديل الطرق والحدود")}
          </span>
        </summary>

        <Form method="post" className="space-y-4 pt-4 border-t border-[var(--line)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <UI.Field label={t("Minimum amount", "الحد الأدنى")}>
              <input
                className={UI.inputClass}
                name="minAmount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={view.queues.config.minAmount}
              />
            </UI.Field>
            <UI.Field label={t("Maximum amount", "الحد الأعلى")}>
              <input
                className={UI.inputClass}
                name="maxAmount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={view.queues.config.maxAmount}
              />
            </UI.Field>
          </div>

          <UI.Hidden
            name="methodCount"
            value={String(view.queues.config.methods.length + 1)}
          />

          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              {t("Payment methods", "طرق الدفع")}
            </h3>

            {[
              ...view.queues.config.methods,
              {
                id: "",
                labelAr: "",
                labelEn: "",
                account: "",
                instructionsAr: "",
                instructionsEn: "",
                enabled: false,
              },
            ].map((method, index) => (
              <fieldset
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] p-4 space-y-3"
                key={index}
              >
                <legend className="px-2 text-xs font-bold text-[var(--ink)]">
                  {method.id ||
                    t(
                      "Add a payment method (optional)",
                      "إضافة طريقة دفع (اختياري)",
                    )}
                </legend>

                <UI.Field label={t("Method identifier", "معرف الطريقة")}>
                  <input
                    className={UI.inputClass}
                    name={`method.${index}.id`}
                    defaultValue={method.id}
                    maxLength={40}
                    dir="ltr"
                  />
                </UI.Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <UI.Field label={t("Arabic label", "الاسم بالعربية")}>
                    <input
                      className={UI.inputClass}
                      name={`method.${index}.label_ar`}
                      defaultValue={method.labelAr}
                      maxLength={80}
                      dir="rtl"
                    />
                  </UI.Field>
                  <UI.Field label={t("English label", "الاسم بالإنجليزية")}>
                    <input
                      className={UI.inputClass}
                      name={`method.${index}.label_en`}
                      defaultValue={method.labelEn}
                      maxLength={80}
                      dir="ltr"
                    />
                  </UI.Field>
                </div>

                <UI.Field label={t("Receiving account", "حساب الاستلام")}>
                  <input
                    className={UI.inputClass}
                    name={`method.${index}.account`}
                    defaultValue={method.account ?? ""}
                    maxLength={160}
                    dir="ltr"
                  />
                </UI.Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <UI.Field label={t("Arabic instructions", "التعليمات بالعربية")}>
                    <textarea
                      className={UI.inputClass}
                      name={`method.${index}.instructions_ar`}
                      defaultValue={method.instructionsAr}
                      maxLength={600}
                      dir="rtl"
                      rows={2}
                    />
                  </UI.Field>
                  <UI.Field label={t("English instructions", "التعليمات بالإنجليزية")}>
                    <textarea
                      className={UI.inputClass}
                      name={`method.${index}.instructions_en`}
                      defaultValue={method.instructionsEn}
                      maxLength={600}
                      dir="ltr"
                      rows={2}
                    />
                  </UI.Field>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink)] cursor-pointer">
                    <input
                      type="checkbox"
                      name={`method.${index}.enabled`}
                      defaultChecked={method.enabled}
                      className="size-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <span>{t("Enabled", "مفعلة")}</span>
                  </label>
                  {method.id && (
                    <label className="flex items-center gap-2 text-xs font-medium text-[var(--danger)] cursor-pointer">
                      <input
                        type="checkbox"
                        name={`method.${index}.remove`}
                        className="size-4 rounded border-[var(--line)] text-[var(--danger)] focus:ring-[var(--danger)]"
                      />
                      <span>{t("Remove this method", "حذف هذه الطريقة")}</span>
                    </label>
                  )}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="pt-2">
            <UI.Submit intent="recharge-settings" variant="primary">
              {t("Save settings", "حفظ الإعدادات")}
            </UI.Submit>
          </div>
        </Form>
      </details>

      {/* 3. Recently Settled Queue */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--ink)]">
          {t("Recently settled", "تمت تسويتها مؤخراً")}
        </h2>
        <UI.RechargeRows rows={view.queues.settled} locale={view.locale} />
      </section>
    </div>
  );
}
