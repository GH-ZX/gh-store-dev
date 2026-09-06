import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { getMethodLabel } from "@server/lib/settings/recharge-settings";
import {
  getMyRechargeRequest,
  getRechargeConfig,
  markRechargePaid,
  type MyRechargeRequestDetail,
} from "@server/lib/services/recharge.service";
import { getMyWallet } from "@server/lib/services/wallet.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { RechargeRequestPanel } from "@/components/recharge-request-panel";
import type { Route } from "./+types/locale-recharge-detail";

const OPEN_STATUSES = new Set(["pending", "payment_sent", "processing"]);

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
      redirectToLogin(request, locale, `/${locale}/recharge/${requestId}`),
      jar,
      isProduction,
    );
  }
  const [detail, wallet, config] = await Promise.all([
    getMyRechargeRequest(supabase, userId, requestId),
    getMyWallet(supabase, userId),
    getRechargeConfig(supabase),
  ]);
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  const method = config.methods.find((candidate) => candidate.id === detail.paymentMethod);
  const methodLabel = method ? getMethodLabel(method, locale) : detail.paymentMethod;
  return data({
      locale,
      detail,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? config.currency,
      methodLabel,
    }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export async function action({ params, request, context }: Route.ActionArgs) {
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
      redirectToLogin(request, locale, `/${locale}/recharge/${requestId}`),
      jar,
      isProduction,
    );
  }
  await markRechargePaid(supabase, requestId);
  const [detail, wallet, config] = await Promise.all([
    getMyRechargeRequest(supabase, userId, requestId),
    getMyWallet(supabase, userId),
    getRechargeConfig(supabase),
  ]);
  const method = config.methods.find((candidate) => candidate.id === detail?.paymentMethod);
  return data({
      locale,
      detail,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? config.currency,
      methodLabel: method && detail ? getMethodLabel(method, locale) : (detail?.paymentMethod ?? ""),
    }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const messages = getMessages(locale, "recharge");
  return buildPageMeta({
    locale,
    path: "/recharge",
    title: messages.request.title,
    description: messages.request.waitingDescription,
    noIndex: true,
  });
}

export default function LocaleRechargeDetail() {
  const { locale, detail, balance, currency, methodLabel } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    detail: MyRechargeRequestDetail;
    balance: number;
    currency: string;
    methodLabel: string;
  };
  const messages = getMessages(locale, "recharge");

  return (
    <>
      <Link to={`/${locale}/recharge`}>← {messages.invoice.backToRecharge}</Link>
      <h1 className="mt-5 text-2xl font-bold">{messages.request.title}</h1>
      <div className="mx-auto mt-8 w-full max-w-2xl">
        <RechargeRequestPanel
          locale={locale}
          messages={messages as unknown as Record<string, any>}
          request={detail}
          open={OPEN_STATUSES.has(detail.status)}
          approved={detail.status === "approved"}
          balance={balance}
          currency={currency}
          methodLabel={methodLabel}
        />
      </div>
    </>
  );
}
