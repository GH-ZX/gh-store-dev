import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { APP_NAME } from "@/lib/app-config";
import { buildBrandName } from "@/lib/brand";
import { formatPrice } from "@/lib/format-money";
import { getOrderInvoice, type OrderInvoice } from "@server/lib/services/invoice.service";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import { createServiceClient, createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { InvoiceDownloadActions, InvoicePrintButton } from "@/components/invoice-download-actions";
import type { Route } from "./+types/locale-order-invoice";

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
      redirectToLogin(request, locale, `/${locale}/orders/${orderId}/invoice`),
      jar,
      isProduction,
    );
  }
  const service = createServiceClient(env);
  const [invoice, settings] = await Promise.all([
    getOrderInvoice(supabase, service, userId, locale, orderId),
    getPublicStoreSettings(supabase),
  ]);
  if (!invoice) {
    throw new Response("Not Found", { status: 404 });
  }
  return data({ locale, orderId, invoice, brandName: settings.branding.useEverywhere ? buildBrandName(settings, locale) : APP_NAME }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta() {
  return [{ name: "robots", content: "noindex, nofollow" }];
}

export default function LocaleOrderInvoice() {
  const { locale, orderId, invoice, brandName } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    orderId: string;
    invoice: OrderInvoice;
    brandName: string;
  };
  const messages = getMessages(locale, "checkout").invoice;
  const hasCodes = invoice.lines.some((line) => line.codes.length > 0);
  const hasFields = invoice.lines.some((line) => line.fields.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/${locale}/orders/${orderId}`}>← {messages.backToOrder}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceDownloadActions orderNumber={invoice.orderNumber} messages={messages} />
          <InvoicePrintButton label={messages.printAction} />
        </div>
      </div>
      <article
        id="gh-invoice-paper"
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="mt-6 rounded border bg-white p-6 text-[#111827] sm:p-10"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <p className="text-lg font-bold">{brandName}</p>
            <h1 className="mt-2 text-2xl font-semibold">{messages.title}</h1>
          </div>
          <dl className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.numberLabel}</dt>
              <dd className="font-medium tabular-nums" dir="ltr">{invoice.invoiceNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.issuedLabel}</dt>
              <dd className="tabular-nums" dir="ltr">{invoice.issuedAt.slice(0, 10)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.orderLabel}</dt>
              <dd className="tabular-nums" dir="ltr">{invoice.orderNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.orderDateLabel}</dt>
              <dd className="tabular-nums" dir="ltr">{invoice.orderDate.slice(0, 10)}</dd>
            </div>
          </dl>
        </header>
        <section className="grid gap-4 border-b py-6 text-sm sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.billedTo}</h2>
            <p className="mt-2 font-medium">{invoice.customer.name ?? messages.customerFallback}</p>
            {invoice.customer.email ? (
              <p className="mt-0.5 text-[#6b7280]" dir="ltr">{invoice.customer.email}</p>
            ) : null}
          </div>
          <div className="sm:text-end">
            <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.paidWith}</h2>
            <p className="mt-2 font-medium">{invoice.paymentMethod ?? "—"}</p>
          </div>
        </section>
        {hasCodes ? (
          <section className="border-b py-6">
            <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.codesTitle}</h2>
            <p className="mt-1 text-xs text-[#6b7280]">{messages.codesDescription}</p>
            {invoice.lines.map((line) =>
              line.codes.length > 0 ? (
                <div key={`codes-${line.name}`} className="mt-4">
                  <h3 className="text-sm font-semibold">
                    {formatMessage(messages.codesHeading, { product: line.name }, locale)}
                  </h3>
                  {line.codes.map((code) => (
                    <div key={code} className="mt-2 rounded border bg-[#f9fafb] px-4 py-3 font-mono text-sm break-all select-all" dir="ltr">
                      {code}
                    </div>
                  ))}
                </div>
              ) : null,
            )}
          </section>
        ) : null}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-start text-xs text-[#6b7280]">
              <th scope="col" className="pb-2 text-start font-medium">{messages.itemLabel}</th>
              <th scope="col" className="pb-2 text-end font-medium">{messages.quantityLabel}</th>
              <th scope="col" className="pb-2 text-end font-medium">{messages.unitPriceLabel}</th>
              <th scope="col" className="pb-2 text-end font-medium">{messages.lineTotalLabel}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={`${line.name}-${index}`} className="border-b">
                <td className="py-3">{line.name}</td>
                <td className="py-3 text-end text-[#6b7280] tabular-nums">{line.quantity}</td>
                <td className="py-3 text-end text-[#6b7280] tabular-nums" dir="ltr">
                  {formatPrice(line.unitPrice, invoice.currency, locale)}
                </td>
                <td className="py-3 text-end font-medium tabular-nums" dir="ltr">
                  {formatPrice(line.totalPrice, invoice.currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasFields ? (
          <section className="mt-6 border-b pb-6">
            <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.deliveryDetailsTitle}</h2>
            {invoice.lines.map((line) =>
              line.fields.length > 0 ? (
                <div key={`fields-${line.name}`} className="mt-4">
                  <h3 className="text-sm font-semibold">{line.name}</h3>
                  <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                    {line.fields.map((field) => (
                      <div key={`${line.name}-${field.label}`} className="flex gap-2">
                        <dt className="text-[#6b7280]">{field.label}</dt>
                        <dd className="min-w-0 font-medium break-all">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null,
            )}
          </section>
        ) : null}
        <div className="mt-6 grid justify-end gap-1.5 text-sm">
          <div className="flex justify-between gap-8">
            <span className="text-[#6b7280]">{messages.subtotalLabel}</span>
            <span className="tabular-nums" dir="ltr">{formatPrice(invoice.subtotal, invoice.currency, locale)}</span>
          </div>
          {invoice.discount > 0 ? (
            <div className="flex justify-between gap-8">
              <span className="text-[#6b7280]">{messages.discountLabel}</span>
              <span className="tabular-nums" dir="ltr">−{formatPrice(invoice.discount, invoice.currency, locale)}</span>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between gap-8 border-t pt-2 text-base font-semibold">
            <span>{messages.totalLabel}</span>
            <span className="tabular-nums" dir="ltr">{formatPrice(invoice.total, invoice.currency, locale)}</span>
          </div>
        </div>
        <footer className="mt-8 border-t pt-4 text-xs leading-5 text-[#6b7280]">
          <p>{messages.keepForSupportNote}</p>
          <p className="mt-1">{messages.footerNote}</p>
        </footer>
      </article>
    </div>
  );
}

