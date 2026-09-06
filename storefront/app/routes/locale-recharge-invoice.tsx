import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { APP_NAME } from "@/lib/app-config";
import { buildBrandName } from "@/lib/brand";
import { formatNumber, formatPrice } from "@/lib/format-money";
import { getRechargeConfig } from "@server/lib/services/recharge.service";
import { getRechargeInvoice, type RechargeInvoice } from "@server/lib/services/invoice.service";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import { getPaymentMethodLabel } from "@server/lib/settings/recharge-settings";
import { createServiceClient, createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { InvoiceDownloadActions, InvoicePrintButton } from "@/components/invoice-download-actions";
import type { Route } from "./+types/locale-recharge-invoice";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const requestId = params.requestId ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/recharge/${requestId}/invoice`),
      jar,
      isProduction,
    );
  }
  const service = createServiceClient(env);
  const [invoice, settings, config] = await Promise.all([
    getRechargeInvoice(supabase, service, userId, requestId),
    getPublicStoreSettings(supabase),
    getRechargeConfig(supabase),
  ]);
  if (!invoice) {
    throw new Response("Not Found", { status: 404 });
  }
  return data({
      locale,
      invoice,
      brandName: settings.branding.useEverywhere ? buildBrandName(settings, locale) : APP_NAME,
      methodLabel: getPaymentMethodLabel(invoice.paymentMethod, locale, config.methods),
    }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta() {
  return [{ name: "robots", content: "noindex, nofollow" }];
}

export default function LocaleRechargeInvoice() {
  const { locale, invoice, brandName, methodLabel } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    invoice: RechargeInvoice;
    brandName: string;
    methodLabel: string;
  };
  const messages = getMessages(locale, "recharge").invoice;
  const shared = getMessages(locale, "checkout").invoice;
  const statuses = getMessages(locale, "recharge").statuses as Record<string, string>;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/${locale}/recharge`}>← {messages.backToRecharge}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceDownloadActions orderNumber={invoice.rechargeReference} messages={shared} />
          <InvoicePrintButton label={shared.printAction} />
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
              <dt className="text-[#6b7280]">{messages.referenceLabel}</dt>
              <dd className="font-medium tabular-nums" dir="ltr">{invoice.rechargeReference}</dd>
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
            <p className="mt-2 font-medium">{methodLabel}</p>
            <p className="mt-1 text-[#6b7280]">{statuses[invoice.status] ?? invoice.status}</p>
          </div>
        </section>
        <section className="grid gap-4 border-b py-6 text-sm sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.requestedLabel}</h2>
            <p className="mt-2 text-lg font-semibold tabular-nums" dir="ltr">
              {formatPrice(invoice.requestedAmount, invoice.currency, locale)}
            </p>
          </div>
          {invoice.creditedAmount !== null ? (
            <div className="sm:text-end">
              <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.creditedLabel}</h2>
              <p className="mt-2 text-lg font-semibold tabular-nums" dir="ltr">
                {formatPrice(invoice.creditedAmount, invoice.currency, locale)}
              </p>
            </div>
          ) : null}
        </section>
        <section className="grid gap-x-8 gap-y-1.5 border-b py-6 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-[#6b7280]">{messages.requestedDateLabel}</dt>
            <dd className="font-medium tabular-nums" dir="ltr">{invoice.requestedAt.slice(0, 10)}</dd>
          </div>
          {invoice.resolvedAt ? (
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.resolvedDateLabel}</dt>
              <dd className="font-medium tabular-nums" dir="ltr">{invoice.resolvedAt.slice(0, 10)}</dd>
            </div>
          ) : null}
          {invoice.exchangeRate !== null ? (
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.exchangeRateLabel}</dt>
              <dd className="font-medium tabular-nums" dir="ltr">{formatNumber(invoice.exchangeRate, locale)}</dd>
            </div>
          ) : null}
        </section>
        {invoice.adminNote ? (
          <section className="border-b py-6 text-sm">
            <h2 className="text-xs font-semibold uppercase text-[#6b7280]">{messages.adminNoteLabel}</h2>
            <p className="mt-2 leading-6">{invoice.adminNote}</p>
          </section>
        ) : null}
        <footer className="mt-8 border-t pt-4 text-xs leading-5 text-[#6b7280]">
          <p>{messages.keepForSupportNote}</p>
          <p className="mt-1">{messages.footerNote}</p>
        </footer>
      </article>
    </div>
  );
}
