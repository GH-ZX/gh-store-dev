import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TransactionList, WalletSummaryPanel } from "@/components/account/wallet-panels";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getSessionSummary } from "@/lib/services/session.service";
import { getMyTransactions, getMyWallet } from "@/lib/services/wallet.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

export default async function WalletPage({ params, searchParams }: PageProps<"/[locale]/wallet">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "account");
  const common = getMessages(locale, "common");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/wallet`)}`);
  }

  // Paging by page number keeps the URL shareable and the query trivial.
  const query = await searchParams;
  const rawPage = Number(typeof query.page === "string" ? query.page : "1");
  const page = Number.isFinite(rawPage) && rawPage > 1 ? Math.floor(rawPage) : 1;

  const [wallet, history] = await Promise.all([
    getMyWallet(),
    getMyTransactions(PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);

  return (
    <Section spacing="page" mesh>
      <nav aria-label={messages.title}>
        <Link
          href={`/${locale}/profile`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.title}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        eyebrow={messages.wallet.eyebrow}
        title={messages.wallet.title}
        subtitle={messages.wallet.description}
        className="mt-5"
      />

      <div className="mt-10 grid gap-8">
        <WalletSummaryPanel locale={locale} messages={messages} wallet={wallet} />

        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">{messages.wallet.historyTitle}</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {messages.wallet.historyDescription}
          </p>

          <div className="mt-5">
            <TransactionList
              locale={locale}
              messages={messages}
              transactions={history.transactions}
            />
          </div>

          {history.hasMore || page > 1 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {page > 1 ? (
                <Link
                  href={`/${locale}/wallet?page=${page - 1}`}
                  className="inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                >
                  {common.actions.previous}
                </Link>
              ) : null}
              {history.hasMore ? (
                <Link
                  href={`/${locale}/wallet?page=${page + 1}`}
                  className="inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                >
                  {messages.wallet.loadMore}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
