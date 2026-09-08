import { Link } from "react-router";
import * as UI from "./operations-shared";
import { ChevronIcon } from "@/components/ui/icons";

export function CustomersView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "customers" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  return (
    <div className="space-y-6">
      {/* Search Toolbar */}
      <UI.Filters q={view.q} status="all" options={[]} ar={ar} search />

      {view.customers.length > 0 && (
        <p className="text-xs font-semibold text-[var(--ink-muted)] tabular-nums">
          {view.customers.length} {ar ? "عميل" : "customers"}
        </p>
      )}

      {view.customers.length === 0 ? (
        <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
          {t("No customers match your search.", "لا يوجد عملاء يطابقون البحث.")}
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-[var(--elevation-1)]">
          {view.customers.map((customer) => {
            const displayName =
              customer.fullName || customer.username || customer.email || "Customer";
            const initial = (displayName.charAt(0) || "U").toUpperCase();

            return (
              <Link
                key={customer.id}
                to={`/${view.locale}/dashboard/customers/${customer.id}`}
                className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-[var(--surface-strong)] transition-colors duration-150"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-xs border border-[var(--accent-line)]">
                    {initial}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-semibold text-[var(--ink)] group-hover:text-[var(--accent-strong)] transition-colors truncate">
                        <bdi>{displayName}</bdi>
                      </strong>
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
                      <span className="truncate">{customer.email}</span>
                      <span className="text-[var(--line-strong)] select-none">·</span>
                      <UI.DateTime value={customer.createdAt} />
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col sm:items-end sm:justify-center justify-between shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line)]">
                  <div className="text-sm font-bold text-[var(--ink)]">
                    <UI.Money
                      amount={customer.balance}
                      currency={customer.currency}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ChevronIcon
                      direction={ar ? "start" : "end"}
                      className="size-3.5 text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors"
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
