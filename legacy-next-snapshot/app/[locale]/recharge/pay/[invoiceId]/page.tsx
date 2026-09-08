import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminCard } from "@/components/admin/admin-form";
import { BinancePaymentPanel } from "@/components/recharge/binance-payment-panel";
import { SamPaymentPanel } from "@/components/recharge/sam-payment-panel";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages, type RechargeMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMyBinanceInvoice } from "@/lib/services/binance-recharge.service";
import { getMySamInvoice } from "@/lib/services/sam-recharge.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One invoice, one page — Sam or Binance.
 *
 * Giving the invoice its own URL means a customer can refresh, come back from
 * their payment app, or reopen the tab and still be looking at the live state of
 * the same payment. The lookup is scoped to the signed-in customer either way,
 * so an invoice id from somewhere else is a 404 rather than a window into
 * another account.
 *
 * A Binance invoice is found by row id or by trade number, because the return
 * address Binance brings the customer back to is built from the trade number —
 * the one identifier known before the invoice row exists.
 */
export default async function InvoicePaymentPage({
  params,
}: PageProps<"/[locale]/recharge/pay/[invoiceId]">) {
  const { invoiceId } = await params;
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "recharge");
  const session = await getSessionSummary();

  if (!session) {
    redirect(
      `/${locale}/login?next=${encodeURIComponent(`/${locale}/recharge/pay/${invoiceId}`)}`,
    );
  }

  const key = decodeURIComponent(invoiceId);
  const samInvoice = await getMySamInvoice(key);

  if (!samInvoice) {
    const binanceInvoice = await getMyBinanceInvoice(key);

    if (!binanceInvoice) {
      notFound();
    }

    return (
      <PaymentShell locale={locale} messages={messages}>
        <BinancePaymentPanel locale={locale} messages={messages} invoice={binanceInvoice} />
      </PaymentShell>
    );
  }

  return (
    <PaymentShell locale={locale} messages={messages}>
      <SamPaymentPanel locale={locale} messages={messages} invoice={samInvoice} />
    </PaymentShell>
  );
}

function PaymentShell({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: RechargeMessages;
}) {
  return (
    <Section spacing="page" mesh>
      <nav aria-label={messages.title}>
        <Link
          href={`/${locale}/recharge`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.sam.backToTopUp}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        eyebrow={messages.sam.eyebrow}
        title={messages.sam.payTitle}
        subtitle={messages.sam.payDescription}
        className="mt-5"
      />

      <div className="mt-10 max-w-xl">
        <AdminCard title={messages.sam.payTitle}>{children}</AdminCard>
      </div>
    </Section>
  );
}
