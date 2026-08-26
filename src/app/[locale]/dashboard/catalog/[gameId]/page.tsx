import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminCard } from "@/components/admin/admin-form";
import { GameEditForm } from "@/components/admin/game-edit-form";
import { OfferManageForm } from "@/components/admin/offer-manage-form";
import { OfferRowsForm } from "@/components/admin/offer-rows-form";
import { ProviderLinkForm } from "@/components/admin/provider-link-form";
import { StockManager } from "@/components/admin/stock-manager";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon, LinkIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getAdminGame, listAdminCategories } from "@/lib/services/admin-catalog.service";
import { getStockSummaries, listStockItems } from "@/lib/services/stock.service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One game's editor.
 *
 * A Server Component that loads the game once and hands the two forms exactly
 * the data they render, so neither form fetches anything. A missing game is a
 * 404 rather than an empty editor — an id that no longer exists is not a page.
 */
export default async function CatalogGamePage({
  params,
}: PageProps<"/[locale]/dashboard/catalog/[gameId]">) {
  const locale = await resolveLocaleParam(params);
  const { gameId } = await params;
  const messages = getMessages(locale, "admin").catalog;
  const detail = await getAdminGame(gameId);
  const categories = await listAdminCategories();

  if (!detail) {
    notFound();
  }

  const { game, offers } = detail;

  // Load stock for stored offers
  const supabase = createSupabaseServiceClient();
  const storedOffers = offers.filter((o) => o.deliveryKind === "stored");
  const stockSummaries = storedOffers.length > 0
    ? await getStockSummaries(
        supabase,
        storedOffers.map((o) => o.id),
      )
    : new Map();

  const stockItemLists = new Map<string, { id: string; content: string; createdAt: string }[]>();
  for (const offer of storedOffers) {
    const items = await listStockItems(supabase, offer.id);
    stockItemLists.set(
      offer.id,
      items.map((i) => ({
        id: i.id,
        content: i.content,
        createdAt: i.createdAt,
      })),
    );
  }

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={`/${locale}/dashboard/catalog`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToCatalog}
        </Link>

        <SectionHeader as="h1" eyebrow={messages.eyebrow} title={game.nameAr} subtitle={game.nameEn} className="mt-5" />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Badge tone={game.isActive ? "success" : "neutral"}>
            {game.isActive ? messages.published : messages.unpublished}
          </Badge>
          {game.isFeatured ? <Badge tone="accent">{messages.featured}</Badge> : null}
          {game.showInCarousel ? <Badge tone="sale">{messages.inCarousel}</Badge> : null}
          <span className="font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
            {game.slug}
          </span>
          <span className="text-xs text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.offersCount, { count: offers.length }, locale)}
          </span>
          {game.providerCode ? (
            <span className="text-xs text-[var(--ink-faint)]">
              {messages.providerLabel}: <span dir="ltr">{game.providerCode}</span>
            </span>
          ) : null}
          {game.providerCategoryTitle ? (
            <span className="text-xs text-[var(--ink-faint)]">
              {messages.providerCategoryLabel}: {game.providerCategoryTitle}
            </span>
          ) : null}
          {game.providerUrl ? (
            <a
              href={game.providerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-[var(--accent-strong)] underline-offset-4 transition-colors duration-[var(--duration)] hover:underline"
            >
              <LinkIcon className="size-3.5" />
              <span dir="ltr">{messages.supplierLinkTitle}</span>
            </a>
          ) : null}
          <Link
            href={`/${locale}/games/${game.slug}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs text-[var(--accent-strong)] underline-offset-4 transition-colors duration-[var(--duration)] hover:underline"
          >
            <LinkIcon className="size-3.5" />
            {messages.viewOnStore}
          </Link>
        </div>
      </div>

      <AdminCard
        title={messages.supplierLinkTitle}
        description={messages.supplierLinkDescription}
      >
        <ProviderLinkForm
          locale={locale}
          gameId={game.id}
          url={game.providerUrl}
          messages={{
            label: messages.supplierLinkLabel,
            hint: messages.supplierLinkHint,
            save: messages.supplierLinkSave,
            saved: messages.supplierLinkSaved,
            errorInvalid: messages.errors.provider_link_invalid,
            errorUnknown: messages.errors.unknown,
          }}
        />
      </AdminCard>

      <GameEditForm
        locale={locale}
        messages={messages.game}
        errors={messages.errors}
        categories={categories}
        game={game}
      />

      <OfferRowsForm
        locale={locale}
        messages={messages.offers}
        errors={messages.errors}
        offerTypes={getMessages(locale, "catalog").offerTypes}
        gameId={game.id}
        offers={offers}
      />

      <AdminCard
        title={messages.manageOffers.title}
        description={messages.manageOffers.description}
      >
        <OfferManageForm
          locale={locale}
          gameId={game.id}
          offers={offers}
          messages={messages.manageOffers}
          errors={messages.errors}
          offerTypeLabels={getMessages(locale, "catalog").offerTypes}
        />
      </AdminCard>

      {storedOffers.length > 0 && (
        <div className="grid gap-6">
          <SectionHeader as="h2" title={messages.stock.sectionTitle} subtitle={messages.stock.sectionDescription} />
          {storedOffers.map((offer) => (
            <StockManager
              key={offer.id}
              locale={locale}
              messages={messages.stock}
              gameId={game.id}
              offerId={offer.id}
              offerName={offer.nameEn}
              deliveryKind={offer.deliveryKind}
              stockItems={stockItemLists.get(offer.id) ?? []}
              availableCount={stockSummaries.get(offer.id)?.available ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
