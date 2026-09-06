import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { getMyOrder, type MyOrderDetail } from "@server/lib/services/orders-read.service";
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
  return data({ locale, order }, { headers: sessionCookieHeaders(jar, isProduction) });
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

export default function LocaleOrderDetail() {
  const { locale, order } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    order: MyOrderDetail;
  };
  const detail = getMessages(locale, "checkout").orderDetail;

  return (
    <>
      <nav aria-label="breadcrumb">
        <Link to={`/${locale}/orders`}>{detail.backToOrders}</Link>
      </nav>
      <h1 className="mt-2 text-2xl font-bold">{detail.title}</h1>
      <dl className="mt-4 grid max-w-md gap-2 text-sm">
        <div className="flex justify-between">
          <dt>{detail.orderNumberLabel}</dt>
          <dd>{order.orderNumber}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{detail.orderStatusLabel}</dt>
          <dd>{order.status}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{detail.paymentStatusLabel}</dt>
          <dd>{order.paymentStatus}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{detail.totalLabel}</dt>
          <dd>
            {order.total} {order.currency}
          </dd>
        </div>
      </dl>
      <h2 className="mt-6 text-lg font-bold">{detail.itemsTitle}</h2>
      <ul className="mt-2 flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <span className="font-medium">{item.name}</span>
            <span className="block text-sm opacity-70">
              {item.quantity} × {item.unitPrice} = {item.totalPrice}
            </span>
            {item.fields.length > 0 ? (
              <dl className="mt-2 text-sm">
                {item.fields.map((field) => (
                  <div key={field.key} className="flex justify-between gap-4">
                    <dt className="opacity-70">{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {item.fulfillment?.state ? (
              <p className="mt-1 text-sm">{item.fulfillment.state}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {order.codes.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold">{detail.codesTitle}</h2>
          <p className="text-sm opacity-70">{detail.codesDescription}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {order.codes.map((code) => (
              <li key={code} className="rounded border p-2 font-mono text-sm">
                {code}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {order.failureMessage ? (
        <p role="alert" className="mt-4 text-red-600">
          {order.failureMessage}
        </p>
      ) : null}
    </>
  );
}
