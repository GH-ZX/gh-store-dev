import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminCard } from "@/components/admin/admin-form";
import { SamPaymentPanel } from "@/components/recharge/sam-payment-panel";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMySamInvoice } from "@/lib/services/sam-recharge.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One invoice, one page.
 *
 * Giving the invoice its own URL means a customer can refresh, come back from
 * their payment app, or reopen the tab and still be looking at the live state of
 * the same payment. The lookup is scoped to the signed-in customer, so an invoice
 * id from somewhere else is a 404 rather than a window into another account.
 */
export default async function SamPaymentPage({
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

  const invoice = await getMySamInvoice(decodeURIComponent(invoiceId));

  if (!invoice) {
    notFound();
  }

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
        <AdminCard title={messages.sam.payTitle}>
          <SamPaymentPanel locale={locale} messages={messages} invoice={invoice} />
        </AdminCard>
      </div>
    </Section>
  );
}
