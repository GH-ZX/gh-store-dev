import { OrderRefresh } from "@/components/checkout/order-refresh";
import { OrderStatusPanel } from "@/components/checkout/order-status";
import { ReviewForm } from "@/components/reviews/review-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { formatPrice } from "@/lib/format/money";
import type { Locale } from "@/i18n/config";
import type { CheckoutMessages } from "@/i18n/messages";
import type { MyOrderItem } from "@server/lib/services/orders-read.service";
import { getMyReviewForOrder, submitReview } from "@server/lib/services/reviews.service";
import { getSessionSummary } from "@server/lib/services/session.service";
import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { getMyOrder } from "@server/lib/services/orders-read.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/locale-order-detail";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const orderId = params.orderId ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/orders/${orderId}`),
      jar,
      isProduction,
    );
  }
  const order = await getMyOrder(supabase, userId, locale, orderId);
  if (!order) {
    throw new Response("Not Found", { status: 404 });
  }
  const [existingReview, session] = await Promise.all([order.status === "completed" ? getMyReviewForOrder(supabase, orderId) : null, getSessionSummary(supabase, userId)]);
  return data({ locale, order, existingReview, session }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const detail = getMessages(locale, "checkout").orderDetail;
  return buildPageMeta({
    locale,
    path: "/orders",
    title: detail.title,
    description: detail.title,
    noIndex: true,
  });
}

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

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  if (!await getSessionUserId(supabase)) return withSessionCookies(redirectToLogin(request, locale, new URL(request.url).pathname), jar, isProduction);
  const form = await request.formData();
  const result = await submitReview(supabase, { orderId: params.orderId, rating: Number(form.get("rating")), body: String(form.get("body") ?? ""), displayName: String(form.get("displayName") ?? ""), locale });
  return data({ error: result.ok ? null : result.reason, notice: result.ok ? "submitted" : null }, { status: result.ok ? 200 : 400, headers: sessionCookieHeaders(jar, isProduction) });
}
export default function OrderDetailPage() {
  const { locale, order, existingReview, session } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "checkout");
  const detail = messages.orderDetail;
  const submittedFields = order.items.flatMap((item) => item.fields);
  const waitingForFulfillment = ["pending", "paid", "processing", "fulfilling"].includes(order.status) || ["pending", "processing", "reconcile"].includes(order.fulfillmentState ?? "");
  return (
    <Section spacing="page" className="sf-order-detail">
      <nav aria-label={detail.backToOrders}>
        <Link
          to={`/${locale}/orders`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {detail.backToOrders}
        </Link>
      </nav>

      <SectionHeader as="h1" title={detail.title} className="mt-5" />
      <OrderRefresh enabled={waitingForFulfillment} />

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
          <ButtonLink
            href={`/${locale}/orders/${order.id}/invoice`}
            variant="secondary"
            size="sm"
            className="mt-1"
          >
            {messages.invoice.viewInvoice}
          </ButtonLink>
        ) : null}
      </div>

      <div className="sf-commerce-columns sf-order-detail-columns">
        <div className="grid gap-6">
          <section className="sf-commerce-panel">
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

          <section className="sf-commerce-panel">
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

        <section className="sf-commerce-panel">
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
                    : order.paymentMethod === "gift"
                      ? detail.paymentMethodGift
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
                defaultName={session?.displayName ?? ""}
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
