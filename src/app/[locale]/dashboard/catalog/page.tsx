import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { TextField } from "@/components/admin/admin-form";
import { EmptyState } from "@/components/shared/states";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronIcon, GamepadIcon, SearchIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { listAdminGames } from "@/lib/services/admin-catalog.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Catalog list.
 *
 * Search and the published filter live in the URL, not in component state: an
 * operator can bookmark "unpublished imports I still have to price", and the
 * whole page stays a Server Component with no client bundle at all.
 */

const MAX_QUERY_LENGTH = 80;

const filtersSchema = z.object({
  q: z.string().max(400).optional(),
  published: z.string().max(8).optional(),
});

type CatalogFilters = { query: string; publishedOnly: boolean };

/** A malformed query string degrades to the unfiltered list rather than an error page. */
function parseFilters(input: unknown): CatalogFilters {
  const parsed = filtersSchema.safeParse(input ?? {});

  if (!parsed.success) {
    return { query: "", publishedOnly: false };
  }

  return {
    query: (parsed.data.q ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    publishedOnly: parsed.data.published === "1",
  };
}

function catalogPath(locale: Locale, filters: CatalogFilters): string {
  const search = new URLSearchParams();

  if (filters.query) {
    search.set("q", filters.query);
  }

  if (filters.publishedOnly) {
    search.set("published", "1");
  }

  const queryString = search.toString();

  return queryString
    ? `/${locale}/dashboard/catalog?${queryString}`
    : `/${locale}/dashboard/catalog`;
}

const FILTER_LINK_CLASSES =
  "inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm font-semibold transition-colors duration-[var(--duration)]";

export default async function CatalogPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/catalog">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").catalog;
  const filters = parseFilters(await searchParams);
  const games = await listAdminGames({
    query: filters.query,
    publishedOnly: filters.publishedOnly,
  });

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <div className="grid gap-4 rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
        <form method="get" action={`/${locale}/dashboard/catalog`} className="flex flex-wrap items-end gap-3">
          {filters.publishedOnly ? <input type="hidden" name="published" value="1" /> : null}

          <TextField
            label={messages.searchLabel}
            name="q"
            type="search"
            defaultValue={filters.query}
            placeholder={messages.searchPlaceholder}
            maxLength={MAX_QUERY_LENGTH}
            fieldClassName="min-w-0 flex-1 basis-64"
          />

          <Button type="submit" variant="secondary" leadingIcon={<SearchIcon />}>
            {messages.searchLabel}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: messages.allFilter, publishedOnly: false },
            { label: messages.publishedFilter, publishedOnly: true },
          ].map((option) => {
            const active = option.publishedOnly === filters.publishedOnly;

            return (
              <Link
                key={option.label}
                href={catalogPath(locale, { query: filters.query, publishedOnly: option.publishedOnly })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  FILTER_LINK_CLASSES,
                  active
                    ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-strong)]"
                    : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]",
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-[var(--ink-muted)] tabular-nums">
        {formatMessage(messages.countLabel, { count: games.length }, locale)}
      </p>

      {games.length === 0 ? (
        <EmptyState
          icon={<GamepadIcon />}
          title={messages.emptyTitle}
          description={messages.emptyDescription}
          action={{
            href: `/${locale}/dashboard/providers/g2bulk/import`,
            label: messages.goToImport,
          }}
        />
      ) : (
        <ul className="grid gap-2">
          {games.map((game) => (
            <li key={game.id}>
              <Link
                href={`/${locale}/dashboard/catalog/${game.id}`}
                className="flex min-h-11 flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-3 transition-colors duration-[var(--duration)] ease-[var(--ease-spring)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] sm:p-4"
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)]">
                  <StoreImage src={game.imageUrl} alt="" sizes="56px" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{game.nameAr}</p>
                  <p className="truncate text-xs text-[var(--ink-soft)]" dir="ltr">
                    {game.nameEn}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-faint)]">
                    <span dir="ltr" className="font-mono">
                      {game.slug}
                    </span>
                    <span className="text-[var(--ink-muted)] tabular-nums">
                      {formatMessage(messages.offersCount, { count: game.offerCount }, locale)}
                    </span>
                    {game.providerCode ? (
                      <span>
                        {messages.providerLabel}: <span dir="ltr">{game.providerCode}</span>
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge tone={game.isActive ? "success" : "neutral"}>
                    {game.isActive ? messages.published : messages.unpublished}
                  </Badge>
                  {game.isFeatured ? <Badge tone="accent">{messages.featured}</Badge> : null}
                  {game.showInCarousel ? <Badge tone="sale">{messages.inCarousel}</Badge> : null}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-soft)]">
                    {messages.editAction}
                    <ChevronIcon direction="end" className="size-4 rtl:rotate-180" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
