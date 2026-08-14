import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoicePrintButton } from "@/components/account/invoice-print-button";
import { ChevronIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { APP_NAME } from "@/lib/config/app";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getOrderInvoice } from "@/lib/services/invoice.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One order's invoice.
 *
 * A page rather than a download, so it is linkable, readable on a phone, and
 * saved with the browser's own print-to-PDF — which every platform this store
 * targets already has. The chrome hides on paper through `gh-no-print`.
 *
 * Everything rendered comes from the stored snapshot, so an invoice issued in
 * March still says what March cost even after the catalog moved on.
 */
export default async function OrderInvoicePage({
  params,
}: PageProps<"/[locale]/orders/[orderId]/invoice">) {
  const locale = await resolveLocaleParam(params);
  const { orderId } = await params;
  const messages = getMessages(locale, "checkout").invoice;
  const invoice = await getOrderInvoice(locale, orderId);

  if (!invoice) {
    notFound();
  }

  const issued = invoice.issuedAt.slice(0, 10);
  const ordered = invoice.orderDate.slice(0, 10);

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

          <InvoicePrintButton label={messages.printAction} />
        </div>

        <article className="mt-6 rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-6">
            <div>
              <p className="font-brand text-lg font-bold text-[var(--ink)]">{APP_NAME}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">
                {messages.title}
              </h1>
            </div>

            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-[var(--ink-muted)]">{messages.numberLabel}</dt>
                <dd className="font-medium text-[var(--ink)] tabular-nums" dir="ltr">
                  {invoice.invoiceNumber}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--ink-muted)]">{messages.issuedLabel}</dt>
                <dd className="text-[var(--ink)] tabular-nums" dir="ltr">
                  {issued}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--ink-muted)]">{messages.orderLabel}</dt>
                <dd className="text-[var(--ink)] tabular-nums" dir="ltr">
                  {invoice.orderNumber}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--ink-muted)]">{messages.orderDateLabel}</dt>
                <dd className="text-[var(--ink)] tabular-nums" dir="ltr">
                  {ordered}
                </dd>
              </div>
            </dl>
          </header>

          <section className="border-b border-[var(--line)] py-6">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-[var(--ink-faint)] uppercase">
              {messages.billedTo}
            </h2>
            <p className="mt-2 text-sm text-[var(--ink)]">
              {invoice.customer.name ?? messages.customerFallback}
            </p>
            {invoice.customer.email ? (
              <p className="text-sm text-[var(--ink-muted)]" dir="ltr">
                {invoice.customer.email}
              </p>
            ) : null}
          </section>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-start text-xs text-[var(--ink-faint)]">
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
                <tr key={`${line.name}-${index}`} className="border-b border-[var(--line)]">
                  <td className="py-3 text-[var(--ink)]">{line.name}</td>
                  <td className="py-3 text-end text-[var(--ink-muted)] tabular-nums">
                    {line.quantity}
                  </td>
                  <td className="py-3 text-end text-[var(--ink-muted)] tabular-nums" dir="ltr">
                    {formatPrice(line.unitPrice, invoice.currency, locale)}
                  </td>
                  <td className="py-3 text-end text-[var(--ink)] tabular-nums" dir="ltr">
                    {formatPrice(line.totalPrice, invoice.currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 grid justify-end gap-1.5 text-sm">
            <div className="flex justify-between gap-8">
              <span className="text-[var(--ink-muted)]">{messages.subtotalLabel}</span>
              <span className="text-[var(--ink)] tabular-nums" dir="ltr">
                {formatPrice(invoice.subtotal, invoice.currency, locale)}
              </span>
            </div>
            {invoice.discount > 0 ? (
              <div className="flex justify-between gap-8">
                <span className="text-[var(--ink-muted)]">{messages.discountLabel}</span>
                <span className="text-[var(--ink)] tabular-nums" dir="ltr">
                  −{formatPrice(invoice.discount, invoice.currency, locale)}
                </span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between gap-8 border-t border-[var(--line)] pt-2 text-base font-semibold">
              <span className="text-[var(--ink)]">{messages.totalLabel}</span>
              <span className="text-[var(--ink)] tabular-nums" dir="ltr">
                {formatPrice(invoice.total, invoice.currency, locale)}
              </span>
            </div>
          </div>

          <footer className="mt-8 border-t border-[var(--line)] pt-4 text-xs leading-5 text-[var(--ink-faint)]">
            {invoice.paymentMethod ? (
              <p>
                {messages.paidWith}: <span dir="ltr">{invoice.paymentMethod}</span>
              </p>
            ) : null}
            <p className="mt-1">{messages.footerNote}</p>
          </footer>
        </article>
      </div>
    </Section>
  );
}
