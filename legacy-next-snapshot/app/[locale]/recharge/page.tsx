import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RechargeForm } from "@/components/recharge/recharge-form";
import { SamTopUpForm } from "@/components/recharge/sam-topup-form";
import { EmptyState } from "@/components/shared/states";
import { AdminCard } from "@/components/admin/admin-form";
import { BinanceTopUpForm } from "@/components/recharge/binance-top-up-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChevronIcon, WalletIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMyRechargeRequests, getRechargeConfig } from "@/lib/services/recharge.service";
import { getBinancePaymentOptions } from "@/lib/services/binance-recharge.service";
import { getSamPaymentOptions } from "@/lib/services/sam-recharge.service";
import { getSessionSummary } from "@/lib/services/session.service";
import { getMethodLabel } from "@/lib/settings/recharge-settings";
import type { SamMethod } from "@/lib/settings/sam-settings";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const OPEN_STATUSES = new Set(["pending", "payment_sent", "processing"]);

type MethodCard = {
  id: string;
  label: string;
  hint: string;
};

export default async function RechargePage({ params, searchParams }: PageProps<"/[locale]/recharge">) {
  const locale = await resolveLocaleParam(params);
  const query = await searchParams;
  const chosen = typeof query.method === "string" ? query.method : "";
  const messages = getMessages(locale, "recharge");
  const account = getMessages(locale, "account");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/recharge`)}`);
  }

  // The admin has no customer wallet to recharge; gifts are paid on arrival.
  if (session.isAdmin) {
    redirect(`/${locale}/dashboard`);
  }

  const [config, requests, sam, binance] = await Promise.all([
    getRechargeConfig(),
    getMyRechargeRequests(),
    getSamPaymentOptions(),
    getBinancePaymentOptions(),
  ]);
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
          {selected ? (
            <AdminCard
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
                href={`/${locale}/recharge`}
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
            <AdminCard title={messages.title}>
              <EmptyState
                icon={<WalletIcon />}
                title={messages.noMethodsTitle}
                description={messages.noMethodsDescription}
              />
            </AdminCard>
          ) : (
            <AdminCard title={messages.chooseTitle} description={messages.chooseDescription}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {cards.map((card) => (
                  <li key={card.id}>
                    <Link
                      href={`/${locale}/recharge?method=${encodeURIComponent(card.id)}`}
                      className="group flex min-h-20 items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
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
