import { getMessages } from "@/i18n/messages";
import { useEffect } from "react";
import { useLoaderData, useActionData } from "react-router";
import { toast } from "@/components/ui/toaster";
import type {
  loadDashboardOperations,
  actDashboardOperations,
} from "@server/dashboard-operations";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import { LogsView } from "./operations-logs";
import { SupportView } from "./operations-support";
import { ReviewsView } from "./operations-reviews";
import { CustomerView } from "./operations-customer";
import { CustomersView } from "./operations-customers";
import { PaymentsView } from "./operations-payments";
import { RechargesView } from "./operations-recharges";
import { OrderView } from "./operations-order";
import { OrdersView } from "./operations-orders";

export default function DashboardOperations() {
  const view = useLoaderData<typeof loadDashboardOperations>();
  const outcome = useActionData<typeof actDashboardOperations>();
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const admin = getMessages(view.locale, "admin");
  const copy =
    admin[
      view.section as
        | "orders"
        | "customers"
        | "recharges"
        | "payments"
        | "reviews"
        | "support"
        | "logs"
    ];

  const title =
    view.kind === "order"
      ? `#${view.order.orderNumber}`
      : view.kind === "customer"
        ? view.detail.customer.fullName ||
          view.detail.customer.username ||
          view.detail.customer.email ||
          copy.title
        : copy.title;

  const showHeader = view.kind !== "order" && view.kind !== "customer";
  useEffect(() => {
    if (!outcome) return;
    if (outcome.ok) {
      toast.success(outcome.detail || (ar ? "تم حفظ التغييرات بنجاح." : "Changes saved successfully."));
    } else {
      toast.error(outcome.error || (ar ? "حدث خطأ أثناء تنفيذ الإجراء." : "Operation failed."));
    }
  }, [outcome, ar]);


  return (
    <div className="space-y-6">
      {showHeader ? (
        <div>
          {copy.eyebrow ? (
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              {copy.eyebrow}
            </div>
          ) : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            {title}
          </h1>
          {copy.description ? (
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {copy.description}
            </p>
          ) : null}
        </div>
      ) : null}

      {outcome ? (
        <div
          role={outcome.ok ? "status" : "alert"}
          className={
            outcome.ok
              ? "rounded-[var(--radius-control)] border border-[var(--success)]/30 bg-[var(--success-surface)] p-3 text-xs sm:text-sm font-medium text-[var(--success)] flex items-center gap-2"
              : "rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger-surface)] p-3 text-xs sm:text-sm font-medium text-[var(--danger)] flex items-center gap-2"
          }
        >
          {outcome.ok ? (
            <CheckIcon className="size-4 shrink-0" />
          ) : (
            <AlertIcon className="size-4 shrink-0" />
          )}
          <span>
            {outcome.ok
              ? outcome.detail || t("Changes saved.", "تم حفظ التغييرات.")
              : outcome.error}
          </span>
        </div>
      ) : null}

      {view.kind === "orders" && <OrdersView view={view} />}
      {view.kind === "order" && <OrderView view={view} />}
      {view.kind === "recharges" && <RechargesView view={view} />}
      {view.kind === "payments" && <PaymentsView view={view} />}
      {view.kind === "customers" && <CustomersView view={view} />}
      {view.kind === "customer" && <CustomerView view={view} />}
      {view.kind === "reviews" && <ReviewsView view={view} />}
      {view.kind === "support" && <SupportView view={view} />}
      {view.kind === "logs" && <LogsView view={view} />}
    </div>
  );
}
