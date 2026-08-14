import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderStatusPanel } from "@/components/checkout/order-status";
import { ReviewForm } from "@/components/reviews/review-form";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { getMessages, type CheckoutMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getMyOrder, type MyOrderItem } from "@/lib/services/orders-read.service";
import { getMyReviewForOrder } from "@/lib/services/reviews.service";
import { getSessionSummary } from "@/lib/services/session.service";

/**
 * One of the caller's own orders.
 *
 * The read is scoped to the signed-in customer twice over — by RLS and by an
 * explicit `user_id` filter — so another customer's order id is a 404 here rather
 * than a page that leaks whether it exists.
 */

const STATUS_TONES = {
  pending: "neutral",
  payment_pending: "neutral",
  paid: "accent",
  processing: "accent",
  fulfilling: "accent",
  completed: "success",
  failed: "danger",
  refunded: "warning",
  cancelled: "danger",
} as const;

const PAYMENT_TONES = {
  pending: "neutral",
  paid: "success",
  failed: "danger",
  refunded: "warning",
  cancelled: "danger",
} as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/orders/[orderId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const { orderId } = await params;
  const messages = getMessages(locale, "checkout");

  return buildPageMetadata({
    locale,
    path: `/orders/${orderId}`,
    title: messages.orderDetail.title,
    description: messages.orders.description,
    noIndex: true,
  });
}

function ItemCard({
  item,
  currency,
  locale,
  messages,
}: {
  item: MyOrderItem;
  currency: string;
  locale: Locale;
  messages: CheckoutMessages;
}) {
  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{item.name}</h3>
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
          {formatPrice(item.totalPrice, currency, locale)}
        </p>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-[var(--ink-faint)]">
            {messages.orderDetail.quantityLabel}
          </dt>
          <dd className="text-xs font-semibold text-[var(--ink-soft)] tabular-nums" dir="ltr">
            {item.quantity}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-[var(--ink-faint)]">
            {messages.orderDetail.unitPriceLabel}
          </dt>
          <dd className="text-xs font-semibold text-[var(--ink-soft)] tabular-nums" dir="ltr">
            {formatPrice(item.unitPrice, currency, locale)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export default async function OrderDetailPage({
  params,
}: PageProps<"/[locale]/orders/[orderId]">) {
  const locale = await resolveLocaleParam(params);
  const { orderId } = await params;
  const messages = getMessages(locale, "checkout");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders/${orderId}`)}`);
  }

  const order = await getMyOrder(locale, orderId);

  if (!order) {
    notFound();
  }

  const detail = messages.orderDetail;
  const submittedFields = order.items.flatMap((item) => item.fields);

  /*
   * Only a delivered order can be reviewed, so nothing is asked of the reviews
   * table until the order is complete. The existing review is fetched in the
   * same breath: the form and "what you already wrote" are the same slot, and
   * deciding between them needs the answer either way.
   */
  const existingReview = order.status === "completed" ? await getMyReviewForOrder(orderId) : null;

  return (
    <Section spacing="page" mesh>
      <nav aria-label={detail.backToOrders}>
        <Link
          href={`/${locale}/orders`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {detail.backToOrders}
        </Link>
      </nav>

      <SectionHeader as="h1" eyebrow={detail.eyebrow} title={detail.title} className="mt-5" />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[var(--ink)]">
          <span className="sr-only">{detail.orderNumberLabel}: </span>
          <span dir="ltr">{order.orderNumber}</span>
        </span>
        <Badge tone={STATUS_TONES[order.status]}>{messages.statuses[order.status]}</Badge>
        <Badge tone={PAYMENT_TONES[order.paymentStatus]}>
          {`${detail.paymentStatusLabel}: ${messages.paymentStatuses[order.paymentStatus]}`}
        </Badge>
        <span className="text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
          {detail.placedAtLabel}: {order.createdAt.slice(0, 16).replace("T", " ")}
        </span>

        {/*
          * Only for an order that has actually been paid for. An invoice for
          * something nobody paid is a document that says nothing true, and the
          * service refuses to issue one — so offering the link would be offering
          * a 404.
          */}
        {order.paymentStatus === "paid" || order.paymentStatus === "refunded" ? (
          <Link
            href={`/${locale}/orders/${order.id}/invoice`}
            className="text-xs font-medium text-[var(--accent)] underline underline-offset-4"
          >
            {messages.invoice.viewInvoice}
          </Link>
        ) : null}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <div className="grid gap-6">
          <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">{detail.itemsTitle}</h2>
            <ul className="mt-4 grid gap-2">
              {order.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currency={order.currency}
                  locale={locale}
                  messages={messages}
                />
              ))}
            </ul>
          </section>

          <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">{detail.accountTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              {detail.accountDescription}
            </p>

            {submittedFields.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ink-muted)]">{detail.noAccountFields}</p>
            ) : (
              <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                {submittedFields.map((field) => (
                  <div
                    key={`${field.key}-${field.value}`}
                    className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                  >
                    <dt className="text-xs font-medium text-[var(--ink-faint)]">{field.label}</dt>
                    {/* A player id, server id, or character name is a Latin value. */}
                    <dd className="mt-1 text-sm font-semibold break-all text-[var(--ink)]" dir="ltr">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <OrderStatusPanel
            messages={messages}
            status={order.status}
            fulfillmentState={order.fulfillmentState}
            isRefunded={order.paymentStatus === "refunded"}
            failureMessage={order.failureMessage}
            codes={order.codes}
            supportHref={`/${locale}/contact`}
            walletHref={`/${locale}/wallet`}
          />
        </div>

        <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
          <h2 className="text-base font-semibold text-[var(--ink)]">{detail.paymentTitle}</h2>

          <dl className="mt-4 divide-y divide-[var(--line)]">
            <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
              <dt className="text-xs font-medium text-[var(--ink-faint)]">{detail.totalLabel}</dt>
              <dd className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                {formatPrice(order.total, order.currency, locale)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
              <dt className="text-xs font-medium text-[var(--ink-faint)]">
                {detail.paymentStatusLabel}
              </dt>
              <dd className="text-sm font-semibold text-[var(--ink)]">
                {messages.paymentStatuses[order.paymentStatus]}
              </dd>
            </div>
            {order.paymentMethod ? (
              <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <dt className="text-xs font-medium text-[var(--ink-faint)]">
                  {detail.paymentMethodLabel}
                </dt>
                <dd className="text-sm font-semibold text-[var(--ink)]">
                  {order.paymentMethod === "wallet"
                    ? detail.paymentMethodWallet
                    : order.paymentMethod}
                </dd>
              </div>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
              <dt className="text-xs font-medium text-[var(--ink-faint)]">
                {detail.orderStatusLabel}
              </dt>
              <dd className="text-sm font-semibold text-[var(--ink)]">
                {messages.statuses[order.status]}
              </dd>
            </div>
            {order.completedAt ? (
              <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <dt className="text-xs font-medium text-[var(--ink-faint)]">
                  {detail.completedAtLabel}
                </dt>
                <dd className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                  {order.completedAt.slice(0, 16).replace("T", " ")}
                </dd>
              </div>
            ) : null}
          </dl>

          {order.customerNote ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--ink-faint)]">{detail.noteLabel}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{order.customerNote}</p>
            </div>
          ) : null}

          {order.status === "completed" ? (
            <div className="mt-6 border-t border-[var(--line)] pt-6">
              <ReviewForm
                locale={locale}
                orderId={order.id}
                defaultName={session.displayName}
                existing={existingReview}
                messages={messages.review}
              />
            </div>
          ) : null}
        </section>
      </div>
    </Section>
  );
}
