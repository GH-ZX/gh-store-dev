import { getMessages } from "@/i18n/messages";
import { OrderStatusBadge, FulfillmentBadge } from "./order-badges";
import { formatPrice } from "@/lib/format/money";
import {
  ArrowIcon,
  ChevronIcon,
  SearchIcon,
  AlertIcon,
} from "@/components/ui/icons";
import {
  Form,
  Link,
  useNavigation,
  useSearchParams,
  useParams,
  useLocation,
} from "react-router";
import type { loadDashboardOperations } from "@server/dashboard-operations";
import type { ReactNode } from "react";
import type { AdminOrderRow } from "@server/lib/services/admin-orders.service";
import type { AdminRechargeRequest } from "@server/lib/services/admin-recharge.service";

export const inputClass =
  "min-h-10 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors";

export const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)] hover:border-[var(--line-strong)] transition-colors disabled:opacity-50 cursor-pointer";

export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[var(--accent-strong)] transition-colors disabled:opacity-50 cursor-pointer shadow-xs";

export const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger-surface)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors disabled:opacity-50 cursor-pointer";

export const panelClass = "admin-card space-y-4";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--ink-soft)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function Submit({
  children,
  intent,
  variant = "secondary",
}: {
  children: ReactNode;
  intent?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const nav = useNavigation();
  const cls =
    variant === "primary"
      ? primaryButtonClass
      : variant === "danger"
        ? dangerButtonClass
        : buttonClass;

  return (
    <button
      className={cls}
      name="intent"
      value={intent}
      type="submit"
      disabled={nav.state !== "idle"}
    >
      {children}
    </button>
  );
}

export function JsonDetails({
  value,
  label = "Details",
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] select-none">
        {label}
      </summary>
      <pre
        dir="ltr"
        className="mt-2 max-h-80 overflow-auto rounded-lg bg-[var(--surface-strong)] p-3 text-[11px] font-mono text-[var(--ink)] whitespace-pre-wrap break-all border border-[var(--line)]"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function statusLabel(value: string, locale: "ar" | "en", section = "") {
  const admin = getMessages(locale, "admin");
  const checkout = getMessages(locale, "checkout");
  const recharge = getMessages(locale, "recharge");
  const map: Record<string, string> = {
    ...checkout.statuses,
    ...checkout.paymentStatuses,
    ...checkout.fulfillmentStates,
    ...getMessages(locale, "account").wallet.types,
    ...admin.support.roles,
    all: locale === "ar" ? "الكل" : "All",
    attention: admin.orders.filterAttention,
    low_funds: locale === "ar" ? "نقص رصيد المزود" : "Low API Funds",
    manual: admin.orders.filterManual,
    ...(section === "recharges" ? recharge.statuses : {}),
    ...(section === "reviews" ? admin.reviews.statuses : {}),
    ...(section === "support" ? admin.support.statuses : {}),
    ...(section === "payments" ? admin.payments.states : {}),
  };
  return map[value] ?? value.replaceAll("_", " ");
}

export function Badge({ children }: { children: ReactNode }) {
  const { locale } = useParams();
  const { pathname } = useLocation();
  const section = pathname.replace(/\.data$/, "").split("/dashboard/")[1]?.split("/")[0] ?? "";
  const value = typeof children === "string" ? children : null;

  let badgeCls = "admin-badge admin-badge-neutral";
  if (value && ["completed", "approved", "paid", "settled", "resolved"].includes(value)) {
    badgeCls = "admin-badge admin-badge-success";
  } else if (value && ["failed", "rejected", "error"].includes(value)) {
    badgeCls = "admin-badge admin-badge-danger";
  } else if (value && ["pending", "fulfilling", "attention", "refunded"].includes(value)) {
    badgeCls = "admin-badge admin-badge-warning";
  } else if (value && ["admin", "processing"].includes(value)) {
    badgeCls = "admin-badge admin-badge-accent";
  }

  return (
    <span className={badgeCls}>
      {value
        ? statusLabel(value, locale === "ar" ? "ar" : "en", section)
        : children}
    </span>
  );
}

export function Money({
  amount,
  currency = "USD",
}: {
  amount: number;
  currency?: string;
}) {
  const { locale } = useParams();
  return (
    <bdi className="font-semibold tabular-nums text-[var(--ink)]" dir="ltr">
      {formatPrice(amount, currency, locale === "ar" ? "ar" : "en")}
    </bdi>
  );
}

export function DateTime({ value }: { value: string | null }) {
  return (
    <time dateTime={value ?? undefined} className="text-xs text-[var(--ink-muted)] font-mono">
      <bdi>{value ? value.replace("T", " ").slice(0, 16) : "—"}</bdi>
    </time>
  );
}

export function Pager({
  page,
  total,
  ar,
}: {
  page: number;
  total: number;
  ar: boolean;
}) {
  const [search] = useSearchParams();
  const href = (next: number) => {
    const p = new URLSearchParams(search);
    p.set("page", String(next));
    return `?${p}`;
  };
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4"
      aria-label={ar ? "الصفحات" : "Pagination"}
    >
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link className={buttonClass} to={href(page - 1)}>
            <ArrowIcon direction={ar ? "end" : "start"} className="size-3.5 me-1" />
            <span>{ar ? "السابق" : "Previous"}</span>
          </Link>
        ) : null}
      </div>

      <span className="text-xs font-semibold text-[var(--ink-muted)] tabular-nums">
        {page} / {totalPages}
      </span>

      <div className="flex items-center gap-2">
        {page * 20 < total ? (
          <Link className={buttonClass} to={href(page + 1)}>
            <span>{ar ? "التالي" : "Next"}</span>
            <ArrowIcon direction={ar ? "start" : "end"} className="size-3.5 ms-1" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function Filters({
  q,
  status,
  options,
  ar,
  search = false,
}: {
  q: string;
  status: string;
  options: string[];
  ar: boolean;
  search?: boolean;
}) {
  const { pathname } = useLocation();
  const section = pathname.replace(/\.data$/, "").split("/dashboard/")[1]?.split("/")[0] ?? "";

  return (
    <div className="admin-card">
      <Form className="flex flex-wrap items-end gap-3" method="get">
        {search && (
          <div className="min-w-0 flex-1 basis-64">
            <Field label={ar ? "البحث" : "Search"}>
              <div className="relative flex items-center">
                <input
                  className={inputClass}
                  name="q"
                  defaultValue={q}
                  placeholder={ar ? "بحث..." : "Search..."}
                />
              </div>
            </Field>
          </div>
        )}

        {options.length > 0 && (
          <div className="min-w-44 flex-1 sm:flex-none">
            <Field label={ar ? "الحالة" : "Status"}>
              <select name="status" defaultValue={status} className={inputClass}>
                {options.map((value) => (
                  <option key={value} value={value}>
                    {value === "all"
                      ? ar
                        ? "الكل"
                        : "All"
                      : statusLabel(value, ar ? "ar" : "en", section)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-strong)] px-4 text-xs sm:text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface)] hover:border-[var(--line-strong)] transition-colors cursor-pointer"
        >
          <SearchIcon className="size-4 text-[var(--ink-muted)]" />
          <span>{ar ? "تصفية" : "Filter"}</span>
        </button>
      </Form>
    </div>
  );
}

export function Orders({
  rows,
  locale,
}: {
  rows: AdminOrderRow[];
  locale: string;
}) {
  const checkout = getMessages(locale === "ar" ? "ar" : "en", "checkout");

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <p className="text-xs font-semibold text-[var(--ink-muted)] tabular-nums">
          {rows.length} {locale === "ar" ? "طلب" : "orders"}
        </p>
      )}

      {!rows.length ? (
        <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
          {locale === "ar"
            ? "لا توجد طلبات مطابقة."
            : "No matching orders found."}
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-[var(--elevation-1)]">
          {rows.map((order) => (
            <Link
              key={order.id}
              to={`/${locale}/dashboard/orders/${order.id}`}
              className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-[var(--surface-strong)] transition-colors duration-150"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs sm:text-sm font-bold text-[var(--ink)] group-hover:text-[var(--accent-strong)] transition-colors" dir="ltr">
                    #{order.orderNumber}
                  </span>
                  <OrderStatusBadge messages={checkout} status={order.status} />
                  {order.fulfillmentState &&
                    order.fulfillmentState !== order.status && (
                      <FulfillmentBadge
                        messages={checkout}
                        state={order.fulfillmentState}
                      />
                    )}
                  {order.hasLowBalanceError ? (
                    <span className="admin-badge admin-badge-danger font-bold text-[11px] flex items-center gap-1">
                      <AlertIcon className="size-3 text-[var(--danger)]" />
                      <span>{locale === "ar" ? "نقص رصيد المزود" : "Low API Funds"}</span>
                    </span>
                  ) : null}
                </div>

                <p className="mt-1.5 truncate text-xs font-medium text-[var(--ink-soft)]">
                  <bdi>
                    {order.customer.name ||
                      order.customer.email ||
                      order.customer.id}
                  </bdi>
                </p>

                <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
                  {order.itemNames.join(" · ")}
                </p>
              </div>

              <div className="flex sm:flex-col sm:items-end sm:justify-center justify-between shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line)]">
                <div className="text-sm font-bold text-[var(--ink)]">
                  <Money amount={order.total} currency={order.currency} />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <DateTime value={order.createdAt} />
                  <ChevronIcon
                    direction={locale === "ar" ? "start" : "end"}
                    className="size-3.5 text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function RechargeRows({
  rows,
  locale,
  review = false,
}: {
  rows: AdminRechargeRequest[];
  locale: string;
  review?: boolean;
}) {
  const ar = locale === "ar";

  if (!rows.length) {
    return (
      <div className="admin-card py-8 text-center text-sm text-[var(--ink-muted)]">
        {ar ? "لا توجد طلبات تعبئة." : "No recharge requests."}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <article className="admin-card space-y-3" key={row.id}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <strong className="font-mono text-sm text-[var(--ink)]" dir="ltr">
                #{row.reference}
              </strong>
              <Money amount={row.requestedAmount} currency={row.currency} />
              <Badge>{row.status}</Badge>
              <span className="admin-badge admin-badge-neutral">
                {row.paymentMethod}
              </span>
            </div>

            <DateTime value={row.createdAt} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <Link
              className="text-[var(--accent)] hover:underline font-medium"
              to={`/${locale}/dashboard/customers/${row.customer.id}`}
            >
              <bdi>{row.customer.name || row.customer.email}</bdi>
            </Link>

            {row.creditedAmount !== null && (
              <p className="text-[var(--ink-soft)]">
                {ar ? "الرصيد المضاف: " : "Credited: "}
                <strong className="text-[var(--success)]">
                  <Money amount={row.creditedAmount} />
                </strong>
              </p>
            )}
          </div>

          {row.adminNote && (
            <p className="rounded-lg bg-[var(--surface-inset)] p-2.5 text-xs text-[var(--ink-soft)] whitespace-pre-wrap border border-[var(--line)]">
              {row.adminNote}
            </p>
          )}

          {review && (
            <Form method="post" className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[var(--line)]">
              <Hidden name="requestId" value={row.id} />
              <Field
                label={
                  ar ? "المبلغ المضاف (اختياري)" : "Credit amount (optional)"
                }
              >
                <input
                  className={inputClass}
                  name="creditAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={String(row.requestedAmount)}
                />
              </Field>
              <Field label={ar ? "ملاحظة" : "Note"}>
                <input
                  className={inputClass}
                  name="note"
                  maxLength={2000}
                  placeholder={ar ? "سبب الموافقة أو الرفض..." : "Reason..."}
                />
              </Field>
              <div className="sm:col-span-2 flex flex-wrap gap-2.5 pt-1">
                <Submit intent="approve" variant="primary">
                  {ar ? "تأكيد وإضافة الرصيد" : "Approve and credit"}
                </Submit>
                <Submit intent="reject" variant="danger">
                  {ar ? "رفض (تتطلب ملاحظة)" : "Reject (note required)"}
                </Submit>
              </div>
            </Form>
          )}
        </article>
      ))}
    </div>
  );
}

export type OperationsView = Awaited<
  ReturnType<typeof loadDashboardOperations>
>["data"];
