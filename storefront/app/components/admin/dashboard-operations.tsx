import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { useLoaderData, useActionData } from "react-router";
import type {
  loadDashboardOperations,
  actDashboardOperations,
} from "@server/dashboard-operations";
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
      ? view.order.orderNumber
      : view.kind === "customer"
        ? view.detail.customer.fullName ||
          view.detail.customer.username ||
          view.detail.customer.email ||
          copy.title
        : copy.title;
  return (
    <div className="grid gap-6">
      <SectionHeader
        as="h1"
        eyebrow={copy.eyebrow}
        title={title}
        subtitle={
          view.kind === "customer" || view.kind === "order"
            ? undefined
            : copy.description
        }
      />
      {outcome && (
        <p
          role={outcome.ok ? "status" : "alert"}
          className={`rounded-xl border p-4 ${outcome.ok ? "border-success text-success" : "border-danger text-danger"}`}
        >
          {outcome.ok
            ? outcome.detail || t("Changes saved.", "تم حفظ التغييرات.")
            : outcome.error}
        </p>
      )}
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
