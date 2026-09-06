import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  getMyTransactions,
  getMyWallet,
  type TransactionPage,
  type WalletSummary,
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
  const [wallet, transactions] = await Promise.all([
    getMyWallet(supabase, userId),
    getMyTransactions(supabase, userId),
  ]);
  return data({ locale, wallet, transactions }, { headers: sessionCookieHeaders(jar, isProduction) });
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

export default function LocaleWallet() {
  const { locale, wallet, transactions } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    wallet: WalletSummary | null;
    transactions: TransactionPage;
  };
  const messages = getMessages(locale, "account").wallet;

  return (
    <>
      <h1 className="text-2xl font-bold">{messages.title}</h1>
      <p className="opacity-70">{messages.description}</p>
      <p className="mt-4 text-xl">
        {messages.balanceLabel}: {wallet ? `${wallet.balance} ${wallet.currency}` : "—"}
      </p>
      <Link to={`/${locale}/recharge`} className="mt-2 inline-block rounded border px-4 py-2">
        {messages.rechargeAction}
      </Link>
      <h2 className="mt-8 text-lg font-bold">{messages.historyTitle}</h2>
      {transactions.transactions.length === 0 ? (
        <p className="opacity-70">{messages.emptyDescription}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {transactions.transactions.map((entry) => (
            <li key={entry.id} className="flex justify-between rounded border p-2 text-sm">
              <span>
                {messages.types[entry.type as keyof typeof messages.types] ?? entry.type} —{" "}
                {entry.description}
              </span>
              <span>
                {entry.amount} ({entry.balanceAfter})
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
