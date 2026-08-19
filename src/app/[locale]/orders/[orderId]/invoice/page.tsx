import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDownloadActions } from "@/components/account/invoice-download-actions";
import { InvoicePrintButton } from "@/components/account/invoice-print-button";
import { ChevronIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { APP_NAME } from "@/lib/config/app";
import { buildBrandName } from "@/lib/brand";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getOrderInvoice } from "@/lib/services/invoice.service";
import { getPublicStoreSettings } from "@/lib/services/settings.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One order's invoice.
 *
 * A page rather than a bare download, so it is linkable and readable on a
 * phone — and from it the visitor can save the browser's own print-to-PDF or
 * download a rendered PDF or PNG that matches exactly what is on screen.
 *
 * Everything rendered comes from the stored snapshot: what was bought, what it
 * cost, the account details submitted, and the codes that were delivered. An
 * invoice issued in March still says what March cost even after the catalog
 * moved on.
 *
 * The document forces its own ink-on-white paper palette, so it reads the same
 * on screen, on paper, and in a downloaded PDF regardless of the theme the
 * reader chose — a dark invoice is a cartridge nobody asked to spend.
 */
export default async function OrderInvoicePage({
  params,
}: PageProps<"/[locale]/orders/[orderId]/invoice">) {
  const locale = await resolveLocaleParam(params);
  const { orderId } = await params;
  const messages = getMessages(locale, "checkout").invoice;
  const [invoice, settings] = await Promise.all([getOrderInvoice(locale, orderId), getPublicStoreSettings()]);

  if (!invoice) {
    notFound();
  }

  const issued = invoice.issuedAt.slice(0, 10);
  const ordered = invoice.orderDate.slice(0, 10);
  /*
   * The invoice header follows the chrome's naming rules: the configured name
   * when the owner chose to use it everywhere, else the built-in brand.
   */
  const brandName = settings.branding.useEverywhere ? buildBrandName(settings, locale) : APP_NAME;

  const hasCodes = invoice.lines.some((line) => line.codes.length > 0);
  const hasFields = invoice.lines.some((line) => line.fields.length > 0);

  return (
    <Section spacing="page">
      <div className="mx-auto w-full max-w-3xl">
        <div className="gh-no-print flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/${locale}/orders/${orderId}`}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
          >
            <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
            {messages.backToOrder}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <InvoiceDownloadActions orderNumber={invoice.orderNumber} messages={messages} />
            <InvoicePrintButton label={messages.printAction} />
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
                <dt className="text-[#6b7280]">{messages.orderLabel}</dt>
                <dd className="text-[#111827] tabular-nums" dir="ltr">
                  {invoice.orderNumber}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[#6b7280]">{messages.orderDateLabel}</dt>
                <dd className="text-[#111827] tabular-nums" dir="ltr">
                  {ordered}
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
              <p className="mt-2 font-medium text-[#111827]">{invoice.paymentMethod ?? "—"}</p>
            </div>
          </section>

          {/*
            * The codes are the point of a code product, so they lead the body:
            * a receipt that buries the delivered code at the bottom of a table
            * is a receipt that loses its one job.
            */}
          {hasCodes ? (
            <section className="border-b border-[#e5e7eb] py-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                {messages.codesTitle}
              </h2>
              <p className="mt-1 text-xs text-[#6b7280]">{messages.codesDescription}</p>

              {invoice.lines.map((line) =>
                line.codes.length > 0 ? (
                  <div key={`codes-${line.name}`} className="mt-4">
                    <h3 className="text-sm font-semibold text-[#111827]">
                      {formatMessage(messages.codesHeading, { product: line.name }, locale)}
                    </h3>
                    {line.codes.map((code) => (
                      <div
                        key={code}
                        className="mt-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 font-mono text-sm break-all text-[#111827] select-all"
                        dir="ltr"
                      >
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
              <tr className="border-b border-[#e5e7eb] text-start text-xs text-[#6b7280]">
                <th scope="col" className="pb-2 text-start font-medium">
                  {messages.itemLabel}
                </th>
                <th scope="col" className="pb-2 text-end font-medium">
                  {messages.quantityLabel}
                </th>
                <th scope="col" className="pb-2 text-end font-medium">
                  {messages.unitPriceLabel}
                </th>
                <th scope="col" className="pb-2 text-end font-medium">
                  {messages.lineTotalLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={`${line.name}-${index}`} className="border-b border-[#e5e7eb]">
                  <td className="py-3 text-[#111827]">{line.name}</td>
                  <td className="py-3 text-end text-[#6b7280] tabular-nums">{line.quantity}</td>
                  <td className="py-3 text-end text-[#6b7280] tabular-nums" dir="ltr">
                    {formatPrice(line.unitPrice, invoice.currency, locale)}
                  </td>
                  <td className="py-3 text-end font-medium text-[#111827] tabular-nums" dir="ltr">
                    {formatPrice(line.totalPrice, invoice.currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasFields ? (
            <section className="mt-6 border-b border-[#e5e7eb] pb-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                {messages.deliveryDetailsTitle}
              </h2>

              {invoice.lines.map((line) =>
                line.fields.length > 0 ? (
                  <div key={`fields-${line.name}`} className="mt-4">
                    <h3 className="text-sm font-semibold text-[#111827]">{line.name}</h3>
                    <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                      {line.fields.map((field) => (
                        <div key={`${line.name}-${field.label}`} className="flex gap-2">
                          <dt className="text-[#6b7280]">{field.label}</dt>
                          <dd className="min-w-0 font-medium break-all text-[#111827]">
                            {field.value}
                          </dd>
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
              <span className="text-[#111827] tabular-nums" dir="ltr">
                {formatPrice(invoice.subtotal, invoice.currency, locale)}
              </span>
            </div>
            {invoice.discount > 0 ? (
              <div className="flex justify-between gap-8">
                <span className="text-[#6b7280]">{messages.discountLabel}</span>
                <span className="text-[#111827] tabular-nums" dir="ltr">
                  −{formatPrice(invoice.discount, invoice.currency, locale)}
                </span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between gap-8 border-t border-[#e5e7eb] pt-2 text-base font-semibold">
              <span className="text-[#111827]">{messages.totalLabel}</span>
              <span className="text-[#111827] tabular-nums" dir="ltr">
                {formatPrice(invoice.total, invoice.currency, locale)}
              </span>
            </div>
          </div>

          <footer className="mt-8 border-t border-[#e5e7eb] pt-4 text-xs leading-5 text-[#6b7280]">
            <p>{messages.keepForSupportNote}</p>
            <p className="mt-1">{messages.footerNote}</p>
          </footer>
        </article>
      </div>
    </Section>
  );
}