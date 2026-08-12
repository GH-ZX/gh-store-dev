import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameEditForm } from "@/components/admin/game-edit-form";
import { OfferRowsForm } from "@/components/admin/offer-rows-form";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getAdminGame } from "@/lib/services/admin-catalog.service";

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

  if (!detail) {
    notFound();
  }

  const { game, offers } = detail;

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
        </div>
      </div>

      <GameEditForm locale={locale} messages={messages.game} errors={messages.errors} game={game} />

      <OfferRowsForm
        locale={locale}
        messages={messages.offers}
        errors={messages.errors}
        offerTypes={getMessages(locale, "catalog").offerTypes}
        gameId={game.id}
        offers={offers}
      />
    </div>
  );
}
