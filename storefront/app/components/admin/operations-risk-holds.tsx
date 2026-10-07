import { Form } from "react-router";
import * as UI from "./operations-shared";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { RiskHoldRow } from "@server/lib/services/admin-hold.service";

export function RiskHoldsPanel({
  locale,
  rows,
}: {
  locale: Locale;
  rows?: RiskHoldRow[];
}) {
  const ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const pendingRows = (rows || []).filter((r) => r.status === "pending");

  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <section className="admin-card space-y-4" aria-labelledby="risk-holds-title">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <AlertIcon className="size-4" />
          </div>
          <div>
            <h2 id="risk-holds-title" className="text-sm font-bold text-[var(--ink)]">
              {t("Risk & Velocity Holds", "عمليات معلقة بسبب قيود الأمان والسرعة")}
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              {t(
                "Orders, recharges, and redemptions held by automated velocity rules pending review.",
                "طلبات وعمليات شحن معلقة تجاوزت معدلات السرعة وتنتظر المراجعة.",
              )}
            </p>
          </div>
        </div>

        <div className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--surface-strong)] text-[var(--ink-muted)]">
          {pendingRows.length} {t("pending", "قيد المراجعة")}
        </div>
      </div>

      {pendingRows.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--ink-muted)]">
          {t("No pending risk holds. Velocity guards operating normally.", "لا توجد عمليات معلقة. قيود السرعة تعمل بشكل طبيعي.")}
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {pendingRows.map((row) => (
            <div
              key={row.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium text-[var(--ink)]">
                  <span className="uppercase px-1.5 py-0.5 rounded bg-[var(--surface-strong)] text-[10px] font-mono">
                    {row.action}
                  </span>
                  <span>{row.customer?.name || row.customer?.email || row.userId.slice(0, 8)}</span>
                  {row.refId && (
                    <span className="text-[var(--ink-faint)] font-mono text-[11px]">
                      ({row.refId})
                    </span>
                  )}
                </div>
                <div className="text-[var(--ink-muted)]">
                  {t("Reason: ", "السبب: ")}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {row.reason}
                  </span>
                  <span className="mx-2 text-[var(--line)]">•</span>
                  <span>{new Date(row.createdAt).toLocaleTimeString(ar ? "ar-EG" : "en-US")}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Form method="post">
                  <input type="hidden" name="holdId" value={row.id} />
                  <input type="hidden" name="status" value="approved" />
                  <UI.Submit intent="resolve-risk-hold" variant="primary">
                    <span className="flex items-center gap-1">
                      <CheckIcon className="size-3.5" />
                      <span>{t("Approve", "موافقة")}</span>
                    </span>
                  </UI.Submit>
                </Form>

                <Form method="post">
                  <input type="hidden" name="holdId" value={row.id} />
                  <input type="hidden" name="status" value="rejected" />
                  <UI.Submit intent="resolve-risk-hold" variant="danger">
                    <span>{t("Reject", "رفض")}</span>
                  </UI.Submit>
                </Form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
