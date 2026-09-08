import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDownloadActions } from "@/components/account/invoice-download-actions";
import { InvoicePrintButton } from "@/components/account/invoice-print-button";
import { ChevronIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { APP_NAME } from "@/lib/config/app";
import { buildBrandName } from "@/lib/brand";
import { formatNumber, formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getRechargeInvoice } from "@/lib/services/invoice.service";
import { getRechargeConfig } from "@/lib/services/recharge.service";
import { getPublicStoreSettings } from "@/lib/services/settings.service";
import { getPaymentMethodLabel } from "@/lib/settings/recharge-settings";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One wallet recharge's invoice.
 *
 * A recharge is a single transfer, not a basket of items, so the document
 * leads with what was asked, what was credited, and at which rate. It shares
 * the order invoice's paper node and download buttons: what is on screen is
 * exactly what the browser prints or the page exports.
 *
 * Everything rendered comes from the stored snapshot — the status and method
 * keys are recorded raw and translated for the language the reader uses now.
 */
export default async function RechargeInvoicePage({
  params,
}: PageProps<"/[locale]/recharge/[rechargeId]/invoice">) {
  const locale = await resolveLocaleParam(params);
  const { rechargeId } = await params;
  const recharge = getMessages(locale, "recharge");
  const messages = recharge.invoice;
  const shared = getMessages(locale, "checkout").invoice;
  const [invoice, settings, config] = await Promise.all([
    getRechargeInvoice(rechargeId),
    getPublicStoreSettings(),
    getRechargeConfig(),
  ]);

  if (!invoice) {
    notFound();
  }

  const brandName = settings.branding.useEverywhere ? buildBrandName(settings, locale) : APP_NAME;
  const issued = invoice.issuedAt.slice(0, 10);
  const requestedAt = invoice.requestedAt.slice(0, 10);
  const resolvedAt = invoice.resolvedAt ? invoice.resolvedAt.slice(0, 10) : null;
  const methodLabel = getPaymentMethodLabel(invoice.paymentMethod, locale, config.methods);
  const statusLabel =
    (recharge.statuses as Record<string, string>)[invoice.status] ?? invoice.status;

  return (
    <Section spacing="page">
      <div className="mx-auto w-full max-w-3xl">
        <div className="gh-no-print flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/${locale}/recharge`}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
          >
            <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
            {messages.backToRecharge}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <InvoiceDownloadActions orderNumber={invoice.rechargeReference} messages={shared} />
            <InvoicePrintButton label={shared.printAction} />
          </div>
        </div>

        <article
          id="gh-invoice-paper"
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="mt-6 rounded-[var(--radius-shell)] border border-[#e5e7eb] bg-white p-6 text-[#111827] sm:p-10"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5e7eb] pb-6">
            <div>
              <p className="font-brand text-lg font-bold text-[#111827]">{brandName}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#111827]">
                {messages.title}
              </h1>
            </div>

            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-[#6b7280]">{messages.numberLabel}</dt>
                <dd className="font-medium text-[#111827] tabular-nums" dir="ltr">
                  {invoice.invoiceNumber}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[#6b7280]">{messages.issuedLabel}</dt>
                <dd className="text-[#111827] tabular-nums" dir="ltr">
                  {issued}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[#6b7280]">{messages.referenceLabel}</dt>
                <dd className="font-medium text-[#111827] tabular-nums" dir="ltr">
                  {invoice.rechargeReference}
                </dd>
              </div>
            </dl>
          </header>

          <section className="grid gap-4 border-b border-[#e5e7eb] py-6 text-sm sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                {messages.billedTo}
              </h2>
              <p className="mt-2 font-medium text-[#111827]">
                {invoice.customer.name ?? messages.customerFallback}
              </p>
              {invoice.customer.email ? (
                <p className="mt-0.5 text-[#6b7280]" dir="ltr">
                  {invoice.customer.email}
                </p>
              ) : null}
            </div>

            <div className="sm:text-end">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                {messages.paidWith}
              </h2>
              <p className="mt-2 font-medium text-[#111827]">{methodLabel}</p>
              <p className="mt-1 text-[#6b7280]">{statusLabel}</p>
            </div>
          </section>

          <section className="grid gap-4 border-b border-[#e5e7eb] py-6 text-sm sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                {messages.requestedLabel}
              </h2>
              <p className="mt-2 text-lg font-semibold text-[#111827] tabular-nums" dir="ltr">
                {formatPrice(invoice.requestedAmount, invoice.currency, locale)}
              </p>
            </div>

            {invoice.creditedAmount !== null ? (
              <div className="sm:text-end">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                  {messages.creditedLabel}
                </h2>
                <p className="mt-2 text-lg font-semibold text-[#111827] tabular-nums" dir="ltr">
                  {formatPrice(invoice.creditedAmount, invoice.currency, locale)}
                </p>
              </div>
            ) : null}
          </section>

          <section className="grid gap-x-8 gap-y-1.5 border-b border-[#e5e7eb] py-6 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-[#6b7280]">{messages.requestedDateLabel}</dt>
              <dd className="font-medium text-[#111827] tabular-nums" dir="ltr">
                {requestedAt}
              </dd>
            </div>
            {resolvedAt ? (
              <div className="flex gap-2">
                <dt className="text-[#6b7280]">{messages.resolvedDateLabel}</dt>
                <dd className="font-medium text-[#111827] tabular-nums" dir="ltr">
                  {resolvedAt}
                </dd>
              </div>
            ) : null}
            {invoice.exchangeRate !== null ? (
              <div className="flex gap-2">
                <dt className="text-[#6b7280]">{messages.exchangeRateLabel}</dt>
                <dd className="font-medium text-[#111827] tabular-nums" dir="ltr">
                  {formatNumber(invoice.exchangeRate, locale)}
                </dd>
              </div>
            ) : null}
          </section>

          {invoice.adminNote ? (
            <section className="border-b border-[#e5e7eb] py-6 text-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                {messages.adminNoteLabel}
              </h2>
              <p className="mt-2 leading-6 text-[#111827]">{invoice.adminNote}</p>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-[#e5e7eb] pt-4 text-xs leading-5 text-[#6b7280]">
            <p>{messages.keepForSupportNote}</p>
            <p className="mt-1">{messages.footerNote}</p>
          </footer>
        </article>
      </div>
    </Section>
  );
}