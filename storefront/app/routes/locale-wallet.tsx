import { AccountNavigation } from "@/components/account-ui";
import { getSessionSummary } from "@server/lib/services/session.service";
import { TransactionList, WalletSummaryPanel } from "@/components/account/wallet-panels";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { data, redirect, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  getMyTransactions,
  getMyWallet,
} from "@server/lib/services/wallet.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/locale-wallet";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(redirectToLogin(request, locale, `/${locale}/wallet`), jar, isProduction);
  }
  const session = await getSessionSummary(supabase, userId);
  if (session?.isAdmin) return withSessionCookies(redirect(`/${locale}/dashboard`), jar, isProduction);
  const page = Math.min(500, Math.max(1, Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1)));
  const [wallet, transactions] = await Promise.all([
    getMyWallet(supabase, userId),
    getMyTransactions(supabase, userId, 20, (page - 1) * 20),
  ]);
  return data({ locale, wallet, transactions, page }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const wallet = getMessages(locale, "account").wallet;
  return buildPageMeta({
    locale,
    path: "/wallet",
    title: wallet.title,
    description: wallet.description,
    noIndex: true,
  });
}


export default function Page() {
  const { locale, wallet, transactions: history, page } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "account");
  const common = getMessages(locale, "common");
  return (
    <Section spacing="page" className="sf-wallet">
      <nav aria-label={messages.title}>
        <Link
          to={`/${locale}/profile`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.title}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        title={messages.wallet.title}
        subtitle={messages.wallet.description}
        className="mt-5"
      />

      <AccountNavigation locale={locale} messages={getMessages(locale, "account")} />

      <div className="sf-wallet-layout">
        <WalletSummaryPanel
          locale={locale}
          messages={messages}
          wallet={wallet}
          rechargeHref={`/${locale}/recharge`}
        />

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
                  to={`/${locale}/wallet?page=${page - 1}`}
                  className="inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                >
                  {common.actions.previous}
                </Link>
              ) : null}
              {history.hasMore ? (
                <Link
                  to={`/${locale}/wallet?page=${page + 1}`}
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
