import { AccountNavigation } from "@/components/account-ui";
import { getSessionSummary } from "@server/lib/services/session.service";
import { RechargeForm } from "@/components/recharge/recharge-form";
import { SamTopUpForm } from "@/components/recharge/sam-topup-form";
import { BinanceTopUpForm } from "@/components/recharge/binance-top-up-form";
import { EmptyState } from "@/components/shared/states";
import { AdminCard } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChevronIcon, WalletIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { formatPrice } from "@/lib/format/money";
import { getMethodLabel } from "@/lib/recharge-settings";
import type { SamMethod } from "@server/lib/settings/sam-settings";
import { getSamPaymentOptions, startSamTopUp } from "@server/lib/services/sam-recharge.service";
import { getBinancePaymentOptions, startBinanceTopUp } from "@server/lib/services/binance-recharge.service";
import { data, Link, redirect, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  getMyRechargeRequests,
  getRechargeConfig,
  submitRechargeRequest,
} from "@server/lib/services/recharge.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/locale-recharge";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(redirectToLogin(request, locale, `/${locale}/recharge`), jar, isProduction);
  }
  const session = await getSessionSummary(supabase, userId);
  if (session?.isAdmin) return withSessionCookies(redirect(`/${locale}/dashboard`), jar, isProduction);
  const [config, requests, sam, binance] = await Promise.all([
    getRechargeConfig(supabase),
    getMyRechargeRequests(supabase, userId),
    getSamPaymentOptions(supabase),
    getBinancePaymentOptions(),
  ]);
  return data({ locale, config, requests, sam, binance, chosen: new URL(request.url).searchParams.get("method") ?? "" }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(redirectToLogin(request, locale, `/${locale}/recharge`), jar, isProduction);
  }
  const form = await request.formData();
  const amount = Number(form.get("amount"));
  const method = String(form.get("method") ?? "");
  const intent = String(form.get("intent") ?? "submitRechargeAction");
  const headers = sessionCookieHeaders(jar, isProduction);
  const initial = { error: null, notice: null, detail: null, status: "idle", reference: null, requestId: null, credited: false, invoiceId: null, checkoutUrl: null };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return data({ ...initial, error: "invalid_input" }, { status: 400, headers });
  if (intent === "startSamTopUpAction") {
    if (method !== "shamcash" && method !== "syriatel") return data({ ...initial, error: "invalid_input" }, { status: 400, headers });
    const result = await startSamTopUp(supabase, { amount, method });
    if (!result.ok) return data({ ...initial, error: result.reason }, { status: 400, headers });
    return withSessionCookies(redirect(`/${locale}/recharge/pay/${encodeURIComponent(result.invoice.samInvoiceId)}`), jar, isProduction);
  }
  if (intent === "startBinanceTopUpAction") {
    const result = await startBinanceTopUp(supabase, { amount, locale });
    if (!result.ok) return data({ ...initial, error: result.reason }, { status: 400, headers });
    return withSessionCookies(redirect(`/${locale}/recharge/pay/${encodeURIComponent(result.invoiceId)}`), jar, isProduction);
  }
  if (intent !== "submitRechargeAction") return data({ ...initial, error: "invalid_input" }, { status: 400, headers });
  const result = await submitRechargeRequest(supabase, { amount, method });
  if (!result.ok) return data({ ...initial, error: result.reason }, { status: 400, headers });
  return withSessionCookies(redirect(`/${locale}/recharge/${result.requestId}`), jar, isProduction);
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const messages = getMessages(locale, "recharge");
  return buildPageMeta({
    locale,
    path: "/recharge",
    title: messages.title,
    description: messages.description,
    noIndex: true,
  });
}

const OPEN_STATUSES = new Set(["pending", "payment_sent", "processing"]);
type MethodCard = { id: string; label: string; hint: string };
export default function Page() {
  const { locale, config, requests, sam, binance, chosen } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "recharge");
  const account = getMessages(locale, "account");
  const manualMethods = config.methods.filter((method) => method.enabled);

  /*
   * One method per screen. The old page stacked every form at once, which read
   * as three different stores; now the customer picks a method first and only
   * then sees the amount field and the instructions for that one method.
   */
  const cards: MethodCard[] = [
    ...(sam.enabled
      ? sam.methods.map((method) => ({
          id: method,
          label: method === "shamcash" ? messages.sam.methodShamcash : messages.sam.methodSyriatel,
          hint: messages.instantHint,
        }))
      : []),
    ...(binance.enabled ? [{ id: "binance", label: messages.methodBinance, hint: messages.cryptoHint }] : []),
    ...manualMethods.map((method) => ({
      id: `manual:${method.id}`,
      label: getMethodLabel(method, locale),
      hint: messages.manualHint,
    })),
  ];
  const selected = cards.find((card) => card.id === chosen) ?? null;
  const selectedManual = selected?.id.startsWith("manual:")
    ? manualMethods.find((method) => `manual:${method.id}` === selected.id) ?? null
    : null;


  return (
    <Section spacing="page" className="sf-recharge">
      <nav aria-label={account.wallet.title}>
        <Link
          to={`/${locale}/wallet`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToWallet}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        title={messages.title}
        subtitle={messages.description}
        className="mt-5"
      />

      <AccountNavigation locale={locale} messages={getMessages(locale, "account")} />

      <div className="sf-commerce-columns sf-recharge-columns">
        <div className="grid gap-6">
          {selected ? (
            <AdminCard
              className="sf-commerce-panel sf-recharge-method"
              title={selected.label}
              description={
                selectedManual
                  ? undefined
                  : selected.id === "binance"
                    ? messages.binance.description
                    : messages.sam.description
              }
            >
              <Link
                to={`/${locale}/recharge`}
                className="mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
              >
                <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
                {messages.backToMethods}
              </Link>

              {selectedManual ? (
                <RechargeForm
                  locale={locale}
                  messages={messages}
                  config={{ ...config, methods: [selectedManual] }}
                />
              ) : selected.id === "binance" ? (
                <BinanceTopUpForm
                  locale={locale}
                  messages={messages}
                  currency={binance.currency}
                  minAmount={config.minAmount}
                  maxAmount={config.maxAmount}
                />
              ) : (
                <SamTopUpForm
                  locale={locale}
                  messages={messages}
                  methods={[selected.id as SamMethod]}
                  minAmount={config.minAmount}
                  maxAmount={config.maxAmount}
                  currency={config.currency}
                />
              )}
            </AdminCard>
          ) : cards.length === 0 ? (
            <AdminCard className="sf-commerce-panel" title={messages.title}>
              <EmptyState
                icon={<WalletIcon />}
                title={messages.noMethodsTitle}
                description={messages.noMethodsDescription}
              />
            </AdminCard>
          ) : (
            <AdminCard className="sf-commerce-panel" title={messages.chooseTitle} description={messages.chooseDescription}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {cards.map((card) => (
                  <li key={card.id}>
                    <Link
                      to={`/${locale}/recharge?method=${encodeURIComponent(card.id)}`}
                      className="sf-payment-method group"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--ink)]">{card.label}</span>
                        <span className="mt-1 block text-xs text-[var(--ink-muted)]">{card.hint}</span>
                      </span>
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                        aria-hidden="true"
                      >
                        <ChevronIcon direction="end" className="size-3.5 rtl:rotate-180" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}
        </div>

        <AdminCard className="sf-commerce-panel" title={messages.requestsTitle} description={messages.requestsDescription}>
          {requests.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">{messages.emptyDescription}</p>
          ) : (
            <ul className="grid gap-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[var(--ink-muted)]" dir="ltr">
                      {request.reference}
                    </span>
                    <Badge
                      tone={
                        request.status === "approved"
                          ? "success"
                          : request.status === "rejected"
                            ? "danger"
                            : OPEN_STATUSES.has(request.status)
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {messages.statuses[request.status]}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                    {formatPrice(request.creditedAmount ?? request.requestedAmount, request.currency, locale)}
                  </p>

                  {request.adminNote ? (
                    <p className="mt-1.5 text-xs leading-5 text-[var(--ink-muted)]">
                      {messages.noteLabel}: {request.adminNote}
                    </p>
                  ) : null}

                  {request.status === "approved" ? (
                    <div className="mt-3">
                      <ButtonLink
                        href={`/${locale}/recharge/${request.id}/invoice`}
                        variant="secondary"
                        size="sm"
                      >
                        {messages.invoice.viewInvoice}
                      </ButtonLink>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <ButtonLink
                        href={`/${locale}/recharge/${request.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        {messages.request.trackAction}
                      </ButtonLink>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </Section>
  );
}
