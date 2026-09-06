import { data, Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { AdminCard } from "@/components/admin/admin-form";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { SamPaymentPanel } from "@/components/recharge/sam-payment-panel";
import { BinancePaymentPanel } from "@/components/recharge/binance-payment-panel";
import { getMySamInvoice, syncSamInvoice, verifySamPayment } from "@server/lib/services/sam-recharge.service";
import { getMyBinanceInvoice, syncMyBinanceInvoice } from "@server/lib/services/binance-recharge.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/locale-recharge-pay";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { locale, invoiceId } = params;
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  if (!await getSessionUserId(supabase)) return withSessionCookies(redirectToLogin(request, locale, new URL(request.url).pathname), jar, isProduction);
  const sam = await getMySamInvoice(supabase, invoiceId);
  const binance = sam ? null : await getMyBinanceInvoice(supabase, invoiceId);
  if (!sam && !binance) throw new Response("Not Found", { status: 404 });
  return data({ locale, sam, binance }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { locale, invoiceId } = params;
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  if (!await getSessionUserId(supabase)) return withSessionCookies(redirectToLogin(request, locale, new URL(request.url).pathname), jar, isProduction);
  const form = await request.formData();
  const intent = form.get("intent");
  const headers = sessionCookieHeaders(jar, isProduction);
  const initial = { error: null, notice: null, detail: null, status: "idle", invoiceId: null, checkoutUrl: null };
  if (intent === "checkBinanceInvoiceAction") {
    const result = await syncMyBinanceInvoice(supabase, invoiceId);
    return data(result.ok ? { ...initial, status: result.status } : { ...initial, error: result.reason }, { headers });
  }
  if (intent !== "checkSamInvoiceAction" && intent !== "verifySamPaymentAction") return data({ ...initial, error: "invalid_input" }, { status: 400, headers });
  const transactionRef = String(form.get("transactionRef") ?? "").trim();
  if (intent === "verifySamPaymentAction" && (transactionRef.length < 2 || transactionRef.length > 120)) return data({ ...initial, error: "invalid_reference" }, { status: 400, headers });
  const result = intent === "verifySamPaymentAction"
    ? await verifySamPayment(supabase, { samInvoiceId: invoiceId, transactionRef })
    : await syncSamInvoice(supabase, invoiceId);
  return data(result.ok ? { ...initial, status: result.status, notice: result.status === "pending" ? "still_pending" : result.status } : { ...initial, error: result.reason, detail: result.message ?? null, status: result.reason === "expired" ? "expired" : "pending" }, { headers });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = isLocale(params.locale) ? params.locale : "ar";
  const messages = getMessages(locale, "recharge");
  return buildPageMeta({ locale, path: "/recharge/pay", title: messages.sam.payTitle, description: messages.sam.payDescription, noIndex: true });
}

export default function PaymentPage() {
  const { locale, sam, binance } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "recharge");
  return <Section spacing="page" className="sf-recharge-pay">
    <Link className="inline-flex min-h-9 items-center text-sm text-[var(--ink-muted)]" to={`/${locale}/recharge`}>{messages.sam.backToTopUp}</Link>
    <SectionHeader as="h1" title={messages.sam.payTitle} subtitle={messages.sam.payDescription} className="mt-5" />
    <div className="sf-payment-content"><AdminCard className="sf-commerce-panel" title={messages.sam.payTitle}>
      {sam ? <SamPaymentPanel locale={locale} messages={messages} invoice={sam} /> : binance ? <BinancePaymentPanel locale={locale} messages={messages} invoice={binance} /> : null}
    </AdminCard></div>
  </Section>;
}
