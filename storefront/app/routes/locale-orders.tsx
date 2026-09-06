import { AccountNavigation } from "@/components/account-ui";
import { getSessionSummary } from "@server/lib/services/session.service";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, GamepadIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { formatPrice } from "@/lib/format/money";
import { formatMessage, type CheckoutMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { data, redirect, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { getMyOrders, type MyOrderSummary } from "@server/lib/services/orders-read.service";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
  sessionCookieHeaders,
  withSessionCookies,
} from "@server/session";
import type { Route } from "./+types/locale-orders";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(redirectToLogin(request, locale, `/${locale}/orders`), jar, isProduction);
  }
  const session = await getSessionSummary(supabase, userId);
  if (session?.isAdmin) return withSessionCookies(redirect(`/${locale}/dashboard`), jar, isProduction);
  const orders = await getMyOrders(supabase, userId, locale);
  return data({ locale, orders }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const orders = getMessages(locale, "checkout").orders;
  return buildPageMeta({
    locale,
    path: "/orders",
    title: orders.title,
    description: orders.description,
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

function OrderRow({
  order,
  href,
  messages,
  locale,
}: {
  order: MyOrderSummary;
  href: string;
  messages: CheckoutMessages;
  locale: Locale;
}) {
  const extraItems = order.itemCount - 1;

  return (
    <li>
      <Link
        to={href}
        className="sf-order-row group"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--ink)]">
              <span className="sr-only">{messages.orders.orderNumberLabel}: </span>
              <span dir="ltr">{order.orderNumber}</span>
            </span>
            <Badge tone={STATUS_TONES[order.status]}>{messages.statuses[order.status]}</Badge>
          </div>

          <p className="mt-1.5 truncate text-sm text-[var(--ink-soft)]">
            {order.itemName ?? messages.orderDetail.itemsTitle}
            {extraItems > 0 ? (
              <span className="text-[var(--ink-faint)]">
                {" "}
                {formatMessage(messages.orders.itemsMore, { count: extraItems }, locale)}
              </span>
            ) : null}
          </p>

          <p className="mt-1 text-xs text-[var(--ink-faint)]">
            <span className="sr-only">{messages.orders.dateLabel}: </span>
            <time className="tabular-nums" dateTime={order.createdAt} dir="ltr">
              {order.createdAt.slice(0, 16).replace("T", " ")}
            </time>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--ink)]">
            <span className="sr-only">{messages.orders.totalLabel}: </span>
            <span className="tabular-nums" dir="ltr">
              {formatPrice(order.total, order.currency, locale)}
            </span>
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--shell)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
            <span className="sr-only">{messages.orders.viewAction}</span>
            <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
          </span>
        </div>
      </Link>
    </li>
  );
}


export default function Page() {
  const { locale, orders } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "checkout");
  return (
    <Section spacing="page" className="sf-orders">
      <SectionHeader
        as="h1"
        title={messages.orders.title}
        subtitle={messages.orders.description}
      />

      <AccountNavigation locale={locale} messages={getMessages(locale, "account")} />

      {orders.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<GamepadIcon />}
          title={messages.orders.emptyTitle}
          description={messages.orders.emptyDescription}
          action={{ href: `/${locale}/products`, label: messages.orders.browseAction }}
        />
      ) : (
        <ul className="sf-order-list">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              href={`/${locale}/orders/${order.id}`}
              messages={messages}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
