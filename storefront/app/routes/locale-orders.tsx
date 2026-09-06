import { data, Link, useLoaderData } from "react-router";
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

export default function LocaleOrders() {
  const { locale, orders } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    orders: MyOrderSummary[];
  };
  const messages = getMessages(locale, "checkout").orders;

  return (
    <>
      <h1 className="text-2xl font-bold">{messages.title}</h1>
      <p className="opacity-70">{messages.description}</p>
      {orders.length === 0 ? (
        <>
          <p className="mt-4">{messages.emptyTitle}</p>
          <p className="opacity-70">{messages.emptyDescription}</p>
          <Link to={`/${locale}/games`} className="mt-2 inline-block rounded border px-4 py-2">
            {messages.browseAction}
          </Link>
        </>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border p-4">
              <Link to={`/${locale}/orders/${order.id}`}>
                <span className="font-semibold">
                  {messages.orderNumberLabel} {order.orderNumber}
                </span>
                <span className="block text-sm opacity-70">
                  {order.itemName} ({order.itemCount}) — {order.total} {order.currency}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
