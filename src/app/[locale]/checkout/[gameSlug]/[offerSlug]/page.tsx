import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderSummary } from "@/components/checkout/order-summary";
import { DescriptionText } from "@/components/store/description-text";
import { ErrorState, NoticePanel } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getOfferBySlug, tryCatalogRead } from "@/lib/services/catalog.service";
import { getMyProfile } from "@/lib/services/profile.service";
import { getSessionSummary } from "@/lib/services/session.service";
import { getMyWallet } from "@/lib/services/wallet.service";

/**
 * Wallet checkout for one offer.
 *
 * Every number on this page is read on the server and shown as a quote. The
 * authority for what a customer is charged is the checkout transaction, which
 * re-reads the price while holding the wallet lock — so a stale page cannot lock
 * in an old price, and the browser is never asked to do arithmetic about money.
 */

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/checkout/[gameSlug]/[offerSlug]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const { gameSlug, offerSlug } = await params;
  const messages = getMessages(locale, "checkout");

  return buildPageMetadata({
    locale,
    path: `/checkout/${gameSlug}/${offerSlug}`,
    title: messages.title,
    description: messages.description,
    noIndex: true,
  });
}

export default async function CheckoutPage({
  params,
}: PageProps<"/[locale]/checkout/[gameSlug]/[offerSlug]">) {
  const locale = await resolveLocaleParam(params);
  const { gameSlug, offerSlug } = await params;
  const common = getMessages(locale, "common");
  const account = getMessages(locale, "account");
  const messages = getMessages(locale, "checkout");
  const session = await getSessionSummary();

  if (!session) {
    redirect(
      `/${locale}/login?next=${encodeURIComponent(`/${locale}/checkout/${gameSlug}/${offerSlug}`)}`,
    );
  }

  const profile = await getMyProfile();

  /*
   * A suspended account sees why and nothing else. The checkout transaction
   * refuses it anyway, and offering the form would invite a customer to type
   * their account details for an order that cannot be placed.
   */
  if (profile && !profile.isActive) {
    return (
      <Section spacing="page" mesh>
        <SectionHeader as="h1" eyebrow={account.eyebrow} title={account.banned.title} />
        <ErrorState
          className="mt-8"
          title={account.banned.title}
          description={account.banned.description}
          action={{ href: `/${locale}/contact`, label: common.links.contact }}
        />
      </Section>
    );
  }

  const read = await tryCatalogRead(() => getOfferBySlug(locale, gameSlug, offerSlug));

  if (!read.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={common.states.errorTitle}
          description={common.states.errorDescription}
          action={{ href: `/${locale}/games/${gameSlug}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  if (!read.data) {
    notFound();
  }

  const { offer, game, inputFields } = read.data;

  // The admin has no customer wallet: their orders are gifts, paid on arrival
  // and counted as normal invoices. Balance math never applies to that path.
  const isGift = session.isAdmin;
  const wallet = isGift ? null : await getMyWallet();
  const balance = wallet?.balance ?? 0;
  const quantity = 1;
  const total = offer.price * quantity;
  const insufficient = !isGift && balance < total;

  return (
    <Section spacing="page" mesh>
      <nav aria-label={offer.name}>
        <Link
          href={`/${locale}/games/${game.slug}/${offer.slug}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {offer.name}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={isGift ? messages.giftDescription : messages.description}
        className="mt-5"
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <div className="grid gap-6">
          <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              {inputFields.length > 0 ? messages.fields.title : messages.fields.noFieldsTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              {inputFields.length > 0
                ? messages.fields.description
                : messages.fields.noFieldsDescription}
            </p>

            <div className="mt-5">
              <CheckoutForm
                locale={locale}
                messages={messages}
                gameSlug={game.slug}
                offerSlug={offer.slug}
                fields={inputFields}
                disabled={insufficient}
                gift={isGift}
              />
            </div>

            <NoticePanel
              className="mt-5"
              description={isGift ? messages.fields.giftNotice : messages.fields.lockedNotice}
            />
          </section>

          {offer.description ? (
            <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--ink)]">
                {messages.instructionsHeading}
              </h2>
              <DescriptionText text={offer.description} className="mt-3" />
            </section>
          ) : null}
        </div>

        <OrderSummary
          locale={locale}
          messages={messages}
          offerName={offer.name}
          gameName={game.name}
          unitPrice={offer.price}
          quantity={quantity}
          total={total}
          currency={offer.currency}
          balance={balance}
          insufficient={insufficient}
          shortfall={total - balance}
          walletHref={`/${locale}/wallet`}
          gift={isGift}
        />
      </div>
    </Section>
  );
}
