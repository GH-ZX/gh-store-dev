import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RechargeForm } from "@/components/recharge/recharge-form";
import { SamTopUpForm } from "@/components/recharge/sam-topup-form";
import { EmptyState } from "@/components/shared/states";
import { AdminCard } from "@/components/admin/admin-form";
import { BinanceTopUpForm } from "@/components/recharge/binance-top-up-form";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon, WalletIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMyRechargeRequests, getRechargeConfig } from "@/lib/services/recharge.service";
import { getBinancePaymentOptions } from "@/lib/services/binance-recharge.service";
import { getSamPaymentOptions } from "@/lib/services/sam-recharge.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const OPEN_STATUSES = new Set(["pending", "payment_sent", "processing"]);

export default async function RechargePage({ params }: PageProps<"/[locale]/recharge">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "recharge");
  const account = getMessages(locale, "account");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/recharge`)}`);
  }

  const [config, requests, sam, binance] = await Promise.all([
    getRechargeConfig(),
    getMyRechargeRequests(),
    getSamPaymentOptions(),
    getBinancePaymentOptions(),
  ]);
  const hasMethods = config.methods.some((method) => method.enabled);

  return (
    <Section spacing="page" mesh>
      <nav aria-label={account.wallet.title}>
        <Link
          href={`/${locale}/wallet`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToWallet}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
        className="mt-5"
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-6">
          {/*
            * Instant first: it is the only route where a payment credits without
            * waiting for the owner, so burying it under a manual form would push
            * customers towards the slower path.
            */}
          {sam.enabled ? (
            <AdminCard title={messages.sam.title} description={messages.sam.description}>
              <SamTopUpForm
                locale={locale}
                messages={messages}
                methods={sam.methods}
                minAmount={config.minAmount}
                maxAmount={config.maxAmount}
                currency={config.currency}
              />
            </AdminCard>
          ) : null}

          {binance.enabled ? (
            <AdminCard
              title={messages.binance.title}
              description={messages.binance.description}
            >
              <BinanceTopUpForm
                locale={locale}
                messages={messages}
                currency={binance.currency}
                minAmount={config.minAmount}
                maxAmount={config.maxAmount}
              />
            </AdminCard>
          ) : null}

          {hasMethods ? (
            <AdminCard title={messages.title}>
              <RechargeForm locale={locale} messages={messages} config={config} />
            </AdminCard>
          ) : sam.enabled ? null : (
            <AdminCard title={messages.title}>
              <EmptyState
                icon={<WalletIcon />}
                title={messages.noMethodsTitle}
                description={messages.noMethodsDescription}
              />
            </AdminCard>
          )}
        </div>

        <AdminCard title={messages.requestsTitle} description={messages.requestsDescription}>
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
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </Section>
  );
}
