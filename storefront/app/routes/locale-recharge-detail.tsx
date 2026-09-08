import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { data, Link, redirect, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { rechargeHref } from "@/lib/recharge-flow";
import { checkoutReturnTo } from "@server/recharge-flow";
import { getMethodLabel } from "@server/lib/settings/recharge-settings";
import {
  getMyRechargeRequest,
  getMyRechargePaymentInvoice,
  getRechargeConfig,
  markRechargePaid,
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
  const url = new URL(request.url);
  const returnTo = checkoutReturnTo(url.searchParams.get("returnTo"), locale);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, url.pathname + url.search),
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
  if (detail.status === "pending") {
    const invoiceId = await getMyRechargePaymentInvoice(supabase, userId, requestId);
    if (invoiceId) return withSessionCookies(
      redirect(rechargeHref(`/${locale}/recharge/pay/${encodeURIComponent(invoiceId)}`, { returnTo })),
      jar, isProduction,
    );
  }
  const method = config.methods.find((candidate) => candidate.id === detail.paymentMethod);
  const methodLabel = method ? getMethodLabel(method, locale) : detail.paymentMethod;
  return data({
      locale,
      detail,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? config.currency,
      methodLabel,
      method: method ?? null,
      returnTo,
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
  const url = new URL(request.url);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, url.pathname + url.search),
      jar,
      isProduction,
    );
  }
  const form = await request.formData();
  if (form.get("intent") !== "markRechargePaid" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)) {
    return data({ error: "invalid_input" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
  }
  const marked = await markRechargePaid(supabase, requestId);
  if (!marked) return data({ error: "not_found" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
  return data({ error: null }, { headers: sessionCookieHeaders(jar, isProduction) });
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

export default function RechargeDetail() {
  const { locale, detail: request, balance, currency, methodLabel, method, returnTo } = useLoaderData<typeof loader>();
  const recharge = getMessages(locale, "recharge");
  const open = OPEN_STATUSES.has(request.status);
  return (
    <Section spacing="page" className="sf-recharge-detail">
      <nav>
        <Link
          to={rechargeHref(`/${locale}/recharge`, { returnTo })}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {recharge.invoice.backToRecharge}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        title={recharge.request.title}
        className="mt-5"
      />

      <div className="sf-payment-content">
        <RechargeRequestPanel
          key={request.id}
          locale={locale}
          messages={recharge}
          request={request}
          open={open}
          approved={request.status === "approved"}
          balance={balance}
          currency={currency}
          methodLabel={methodLabel}
          method={method}
          returnTo={returnTo}
        />
      </div>
    </Section>
  );
}
