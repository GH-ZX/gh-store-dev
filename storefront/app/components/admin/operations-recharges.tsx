import { Form } from "react-router";
import * as UI from "./operations-shared";
export function RechargesView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "recharges" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <h2 className="text-xl font-bold">
        {t("Awaiting review", "بانتظار المراجعة")}
      </h2>
      <UI.RechargeRows rows={view.queues.open} locale={view.locale} review />
      <details className={UI.panelClass}>
        <summary className="cursor-pointer font-bold">
          {t("Recharge settings", "إعدادات التعبئة")}
        </summary>
        <Form method="post" className="grid gap-3">
          <UI.Field label={t("Minimum amount", "الحد الأدنى")}>
            <input
              className={UI.inputClass}
              name="minAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={view.queues.config.minAmount}
            />
          </UI.Field>
          <UI.Field label={t("Maximum amount", "الحد الأعلى")}>
            <input
              className={UI.inputClass}
              name="maxAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={view.queues.config.maxAmount}
            />
          </UI.Field>
          <UI.Hidden
            name="methodCount"
            value={String(view.queues.config.methods.length + 1)}
          />
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
            <fieldset className={UI.panelClass} key={index}>
              <legend className="font-semibold">
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
              <UI.Field label={t("Arabic instructions", "التعليمات بالعربية")}>
                <textarea
                  className={UI.inputClass}
                  name={`method.${index}.instructions_ar`}
                  defaultValue={method.instructionsAr}
                  maxLength={600}
                  dir="rtl"
                />
              </UI.Field>
              <UI.Field
                label={t("English instructions", "التعليمات بالإنجليزية")}
              >
                <textarea
                  className={UI.inputClass}
                  name={`method.${index}.instructions_en`}
                  defaultValue={method.instructionsEn}
                  maxLength={600}
                  dir="ltr"
                />
              </UI.Field>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name={`method.${index}.enabled`}
                  defaultChecked={method.enabled}
                />
                {t("Enabled", "مفعلة")}
              </label>
              {method.id && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name={`method.${index}.remove`} />
                  {t("Remove this method", "حذف هذه الطريقة")}
                </label>
              )}
            </fieldset>
          ))}
          <UI.Submit intent="recharge-settings">
            {t("Save settings", "حفظ الإعدادات")}
          </UI.Submit>
        </Form>
      </details>
      <h2 className="text-xl font-bold">
        {t("Recently settled", "تمت تسويتها مؤخراً")}
      </h2>
      <UI.RechargeRows rows={view.queues.settled} locale={view.locale} />
    </>
  );
}
