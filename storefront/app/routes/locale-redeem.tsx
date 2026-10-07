import { useState } from "react";
import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { getMyWallet, type WalletSummary } from "@server/lib/services/wallet.service";
import { redeemCouponToWallet } from "@server/lib/services/coupon.service";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { AccountNavigation } from "@/components/account-ui";
import { formatPrice } from "@/lib/format/money";
import { ChevronIcon, WalletIcon, TagIcon, CheckIcon, AlertIcon, ArrowIcon } from "@/components/ui/icons";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  const url = new URL(request.url);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, url.pathname.replace(/\.data$/, "")),
      jar,
      isProduction,
    );
  }

  const initialCode = (url.searchParams.get("code") || url.searchParams.get("c") || "").trim().toUpperCase();
  const wallet = await getMyWallet(supabase, userId);

  return data(
    { locale, wallet, initialCode },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  if (!userId) {
    return data(
      { ok: false as const, error: "not_signed_in" },
      { status: 401, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  const formData = await request.formData();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();

  if (!code || code.length < 2) {
    return data(
      { ok: false as const, error: "invalid_code" },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  const result = await redeemCouponToWallet(supabase, code);

  if (!result.ok) {
    return data(
      { ok: false as const, error: result.reason },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  return data(
    {
      ok: true as const,
      amount: result.amount,
      balanceAfter: result.balanceAfter,
      code: result.code,
    },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export function meta({ params }: { params: { locale?: string } }) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const messages = getMessages(locale, "account");
  return buildPageMeta({
    locale,
    path: "/redeem",
    title: messages.redeem.title,
    description: messages.redeem.description,
    noIndex: true,
  });
}

export default function LocaleRedeem() {
  const { locale, wallet, initialCode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const messages = getMessages(locale, "account");
  const copy = messages.redeem;
  const currency = wallet?.currency ?? "USD";

  const [inputCode, setInputCode] = useState(initialCode || "");

  const currentBalance = actionData && actionData.ok
    ? actionData.balanceAfter
    : (wallet?.balance ?? 0);

  // Map backend refusal/error reasons to friendly messages
  const getErrorMessage = (errorKey?: string) => {
    if (!errorKey) return copy.errors.failed;
    const errors = copy.errors as Record<string, string | undefined>;
    return errors[errorKey] ?? copy.errors.failed;
  };

  return (
    <Section spacing="page" className="sf-redeem max-w-3xl mx-auto">
      {/* Back link */}
      <nav aria-label={messages.title}>
        <Link
          to={`/${locale}/profile`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          <span>{messages.title}</span>
        </Link>
      </nav>

      {/* Header */}
      <SectionHeader
        as="h1"
        title={copy.title}
        subtitle={copy.description}
        className="mt-5"
      />

      <AccountNavigation locale={locale} messages={messages} />

      <div className="mt-8 space-y-6">
        {/* Wallet Balance Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]">
              <WalletIcon className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--ink-muted)]">
                {copy.currentBalance}
              </p>
              <p className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums">
                {formatPrice(currentBalance, currency, locale)}
              </p>
            </div>
          </div>

          <Link
            to={`/${locale}/wallet`}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            <span>{copy.viewWallet}</span>
            <ArrowIcon direction="end" className="size-3 rtl:rotate-180" />
          </Link>
        </div>

        {/* Success Banner */}
        {actionData?.ok ? (
          <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-6 text-start shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--success)] text-white shadow-sm">
                <CheckIcon className="size-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--ink)]">
                  {copy.successTitle}
                </h3>
                <p className="text-sm text-[var(--ink-soft)]">
                  {copy.successMessage
                    .replace("{amount}", formatPrice(actionData.amount, currency, locale))
                    .replace("{balance}", formatPrice(actionData.balanceAfter, currency, locale))}
                </p>
                <div className="pt-4 flex flex-wrap gap-3">
                  <Link
                    to={`/${locale}/wallet`}
                    className={buttonClassName({ variant: "primary", size: "sm" })}
                  >
                    {copy.viewWallet}
                  </Link>
                  <Link
                    to={`/${locale}/products`}
                    className={buttonClassName({ variant: "secondary", size: "sm" })}
                  >
                    {copy.viewCatalog}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Error Alert */}
        {actionData && !actionData.ok && (
          <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]">
            <AlertIcon className="size-5 shrink-0" />
            <p className="font-medium">{getErrorMessage(actionData.error)}</p>
          </div>
        )}

        {/* Redeem Form */}
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <Form method="post" className="space-y-5">
            <div>
              <label
                htmlFor="redeem-code"
                className="block text-sm font-semibold text-[var(--ink)] mb-2"
              >
                {copy.codeLabel}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none text-[var(--ink-muted)]">
                  <TagIcon className="size-5" />
                </div>
                <input
                  id="redeem-code"
                  type="text"
                  name="code"
                  required
                  autoFocus
                  autoComplete="off"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder={copy.codePlaceholder}
                  className="w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-strong)] ps-12 pe-4 py-3.5 font-mono text-lg font-bold uppercase tracking-wider text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                />
              </div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                {locale === "ar"
                  ? "الكوبون صالح للاستخدام مرة واحدة ويشحن رصيد حسابك تلقائياً."
                  : "Codes are single-use and instantly credit your wallet balance."}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !inputCode.trim()}
              className={cn(
                "w-full",
                buttonClassName({ variant: "primary", size: "lg" }),
              )}
            >
              {isSubmitting ? copy.submitting : copy.submitAction}
            </button>
          </Form>
        </div>
      </div>
    </Section>
  );
}
