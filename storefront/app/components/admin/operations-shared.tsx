import { getMessages } from "@/i18n/messages";
import { Badge as ThemeBadge, type BadgeTone } from "@/components/ui/badge";
import { OrderStatusBadge, FulfillmentBadge } from "./order-badges";
import { formatPrice } from "@/lib/format/money";
import {
  Form,
  Link,
  useNavigation,
  useSearchParams,
  useParams,
  useLocation,
} from "react-router";
import type { ReactNode } from "react";
import type { AdminOrderRow } from "@server/lib/services/admin-orders.service";
import type { AdminRechargeRequest } from "@server/lib/services/admin-recharge.service";

export const inputClass =
  "min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-accent";
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
export const panelClass =
  "grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-6";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
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
}: {
  children: ReactNode;
  intent?: string;
}) {
  const nav = useNavigation();
  return (
    <button
      className={buttonClass}
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
    <details>
      <summary className="cursor-pointer py-2 text-sm font-semibold">
        {label}
      </summary>
      <pre
        dir="ltr"
        className="max-h-80 overflow-auto rounded-xl bg-surface-strong p-3 text-xs whitespace-pre-wrap break-all"
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
  const section = pathname.split("/dashboard/")[1]?.split("/")[0] ?? "";
  const value = typeof children === "string" ? children : null;
  const tone: BadgeTone =
    value &&
    ["completed", "approved", "paid", "settled", "resolved"].includes(value)
      ? "success"
      : value && ["failed", "rejected", "error"].includes(value)
        ? "danger"
        : value &&
            ["pending", "fulfilling", "attention", "refunded"].includes(value)
          ? "warning"
          : "neutral";
  return (
    <ThemeBadge tone={tone}>
      {value
        ? statusLabel(value, locale === "ar" ? "ar" : "en", section)
        : children}
    </ThemeBadge>
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
    <bdi className="font-mono tabular-nums">
      {formatPrice(amount, currency, locale === "ar" ? "ar" : "en")}
    </bdi>
  );
}
export function DateTime({ value }: { value: string | null }) {
  return (
    <time dateTime={value ?? undefined}>
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
  return (
    <nav
      className="flex items-center gap-3"
      aria-label={ar ? "الصفحات" : "Pagination"}
    >
      {page > 1 && (
        <Link className={buttonClass} to={href(page - 1)}>
          {ar ? "السابق" : "Previous"}
        </Link>
      )}
      <span>
        {page} / {Math.max(1, Math.ceil(total / 20))}
      </span>
      {page * 20 < total && (
        <Link className={buttonClass} to={href(page + 1)}>
          {ar ? "التالي" : "Next"}
        </Link>
      )}
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
  const section = pathname.split("/dashboard/")[1]?.split("/")[0] ?? "";
  return (
    <Form className="flex flex-wrap items-end gap-3" method="get">
      {search && (
        <Field label={ar ? "البحث" : "Search"}>
          <input className={inputClass} name="q" defaultValue={q} />
        </Field>
      )}
      {options.length > 0 && (
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
      )}
      <Submit>{ar ? "تصفية" : "Filter"}</Submit>
    </Form>
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
    <div className="grid gap-3">
      {rows.length > 0 && (
        <p className="text-sm text-ink-muted">
          {rows.length} {locale === "ar" ? "طلب" : "orders"}
        </p>
      )}
      <ul className="grid gap-2">
        {rows.map((order) => (
          <li key={order.id}>
            <Link
              to={`/${locale}/dashboard/orders/${order.id}`}
              className="group flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    <bdi>{order.orderNumber}</bdi>
                  </span>
                  <OrderStatusBadge messages={checkout} status={order.status} />
                  {order.fulfillmentState &&
                    order.fulfillmentState !== order.status && (
                      <FulfillmentBadge
                        messages={checkout}
                        state={order.fulfillmentState}
                      />
                    )}
                </div>
                <p className="mt-1 truncate text-xs text-ink-muted">
                  <bdi>
                    {order.customer.name ||
                      order.customer.email ||
                      order.customer.id}
                  </bdi>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {order.itemNames.join(" · ")}
                </p>
              </div>
              <div className="text-end text-sm">
                <Money amount={order.total} currency={order.currency} />
                <p className="mt-0.5 text-xs text-ink-faint">
                  <DateTime value={order.createdAt} />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!rows.length && (
        <p className="p-4 text-ink-muted">
          {locale === "ar"
            ? "لا توجد طلبات مطابقة."
            : "No matching orders found."}
        </p>
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
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <article className={panelClass} key={row.id}>
          <div className="flex flex-wrap items-center gap-3">
            <strong>
              <bdi>{row.reference}</bdi>
            </strong>
            <Money amount={row.requestedAmount} currency={row.currency} />
            <Badge>{row.status}</Badge>
            <Badge>{row.paymentMethod}</Badge>
            <Link
              className="underline"
              to={`/${locale}/dashboard/customers/${row.customer.id}`}
            >
              <bdi>{row.customer.name || row.customer.email}</bdi>
            </Link>
            <DateTime value={row.createdAt} />
          </div>
          {row.creditedAmount !== null && (
            <p>
              {ar ? "الرصيد المضاف: " : "Credited: "}
              <Money amount={row.creditedAmount} />
            </p>
          )}
          {row.adminNote && (
            <p className="whitespace-pre-wrap">{row.adminNote}</p>
          )}
          {review && (
            <Form method="post" className="grid gap-3 sm:grid-cols-2">
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
                />
              </Field>
              <Field label={ar ? "ملاحظة" : "Note"}>
                <input className={inputClass} name="note" maxLength={2000} />
              </Field>
              <Submit intent="approve">
                {ar ? "تأكيد وإضافة الرصيد" : "Approve and credit"}
              </Submit>
              <Submit intent="reject">
                {ar ? "رفض (تتطلب ملاحظة)" : "Reject (note required)"}
              </Submit>
            </Form>
          )}
        </article>
      ))}
      {!rows.length && (
        <p className="text-ink-muted">
          {ar ? "لا توجد طلبات تعبئة." : "No recharge requests."}
        </p>
      )}
    </div>
  );
}

export type OperationsView = Awaited<
  ReturnType<
    typeof import("@server/dashboard-operations").loadDashboardOperations
  >
>["data"];
