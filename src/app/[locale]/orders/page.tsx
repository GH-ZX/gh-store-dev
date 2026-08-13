import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, GamepadIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages, type CheckoutMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getMyOrders, type MyOrderSummary } from "@/lib/services/orders-read.service";
import { getSessionSummary } from "@/lib/services/session.service";

/** Status tones. Colour only reinforces the word inside the pill. */
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

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/orders">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "checkout");

  return buildPageMetadata({
    locale,
    path: "/orders",
    title: messages.orders.title,
    description: messages.orders.description,
    noIndex: true,
  });
}

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
        href={href}
        className="group flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition-[border-color,transform] duration-[var(--duration)] ease-[var(--ease-spring)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] sm:px-5"
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

export default async function OrdersPage({ params }: PageProps<"/[locale]/orders">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "checkout");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders`)}`);
  }

  const orders = await getMyOrders(locale);

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.orders.eyebrow}
        title={messages.orders.title}
        subtitle={messages.orders.description}
      />

      {orders.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<GamepadIcon />}
          title={messages.orders.emptyTitle}
          description={messages.orders.emptyDescription}
          action={{ href: `/${locale}/games`, label: messages.orders.browseAction }}
        />
      ) : (
        <ul className="mt-10 grid gap-2">
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
