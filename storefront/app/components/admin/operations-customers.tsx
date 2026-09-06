import { Link } from "react-router";
import * as UI from "./operations-shared";
export function CustomersView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "customers" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <UI.Filters q={view.q} status="all" options={[]} ar={ar} search />
      {view.customers.length === 0 && (
        <p className="text-ink-muted">
          {t("No customers match your search.", "لا يوجد عملاء يطابقون البحث.")}
        </p>
      )}
      <div className="grid gap-3">
        {view.customers.map((customer) => (
          <Link
            key={customer.id}
            to={`/${view.locale}/dashboard/customers/${customer.id}`}
            className={UI.panelClass}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong>
                <bdi>
                  {customer.fullName || customer.username || customer.email}
                </bdi>
              </strong>
              <UI.Money
                amount={customer.balance}
                currency={customer.currency}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <bdi>{customer.email}</bdi>
              <UI.Badge>{customer.role}</UI.Badge>
              <UI.Badge>
                {customer.isActive
                  ? t("Active", "نشط")
                  : t("Suspended", "موقوف")}
              </UI.Badge>
              <UI.DateTime value={customer.createdAt} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
