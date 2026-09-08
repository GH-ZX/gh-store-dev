import { Link } from "react-router";
import { z } from "zod";
import { TextField } from "@/components/admin/admin-form";
import { EmptyState } from "@/components/shared/states";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChevronIcon, GamepadIcon, LinkIcon, SearchIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import {
  listAdminProducts,
  listAdminProviderCategories,
} from "@server/legacy/lib/services/admin-catalog.service";


/**
 * Catalog list.
 *
 * Search and the published filter live in the URL, not in component state: an
 * operator can bookmark unpublished imports that still need pricing.
 */

const MAX_QUERY_LENGTH = 80;

const filtersSchema = z.object({
  q: z.string().max(400).optional(),
  published: z.string().max(8).optional(),
  category: z.string().max(120).optional(),
});

type CatalogFilters = { query: string; publishedOnly: boolean; category: string };

/** A malformed query string degrades to the unfiltered list rather than an error page. */
function parseFilters(input: unknown): CatalogFilters {
  const parsed = filtersSchema.safeParse(input ?? {});

  if (!parsed.success) {
    return { query: "", publishedOnly: false, category: "" };
  }

  return {
    query: (parsed.data.q ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    publishedOnly: parsed.data.published === "1",
    category: (parsed.data.category ?? "").trim().slice(0, 120),
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

  if (filters.category) {
    search.set("category", filters.category);
  }

  const queryString = search.toString();

  return queryString
    ? `/${locale}/dashboard/catalog?${queryString}`
    : `/${locale}/dashboard/catalog`;
}

const FILTER_LINK_CLASSES =
  "inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-sm font-semibold transition-colors duration-[var(--duration)]";


import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
function requireLocale(value: string | undefined) { if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 }); return value; }
import { requireDashboardAdmin } from "@server/dashboard-access";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);
  const filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const [products, providerCategories] = await Promise.all([
    listAdminProducts({
      query: filters.query,
      publishedOnly: filters.publishedOnly,
      category: filters.category,
    }),
    listAdminProviderCategories(),
  ]);

  return { locale, filters, products, providerCategories };
}

export default function Page() {
 const { locale, filters, products, providerCategories } = useLoaderData<typeof loader>();
const messages = getMessages(locale, "admin").catalog;
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          as="h1"
          eyebrow={messages.eyebrow}
          title={messages.title}
          subtitle={messages.description}
        />

        {/* Beside the list, not inside it: creating is a different errand. */}
        <ButtonLink href={`/${locale}/dashboard/catalog/new`} variant="secondary">
          {messages.create.action}
        </ButtonLink>
      </div>

      <div className="grid gap-4 rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
        <form method="get" action={`/${locale}/dashboard/catalog`} className="flex flex-wrap items-end gap-3">
          {filters.publishedOnly ? <input type="hidden" name="published" value="1" /> : null}

          <label className="grid min-w-48 gap-1.5">
            <span className="text-xs font-semibold text-[var(--ink-soft)]">{messages.categoryFilterLabel}</span>
            <select
              name="category"
              defaultValue={filters.category}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">{messages.allCategories}</option>
              {providerCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title} ({category.count})
                </option>
              ))}
            </select>
          </label>

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
                to={catalogPath(locale, {
                  query: filters.query,
                  publishedOnly: option.publishedOnly,
                  category: filters.category,
                })}
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
        {formatMessage(messages.countLabel, { count: products.length }, locale)}
      </p>

      {products.length === 0 ? (
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
          {products.map((product) => (
            <li key={product.id}>
              <div className="flex min-h-11 flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-3 transition-colors duration-[var(--duration)] ease-[var(--ease-spring)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] sm:p-4">
                <div className="size-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)]">
                  <StoreImage src={product.imageUrl} alt="" sizes="56px" />
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/${locale}/dashboard/catalog/${product.id}`}
                    className="block min-h-11 rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  >
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">{locale === "ar" ? product.nameAr : product.nameEn}</span>
                    <span className="block truncate text-xs text-[var(--ink-soft)]" dir={locale === "ar" ? "ltr" : "rtl"}>
                      {locale === "ar" ? product.nameEn : product.nameAr}
                    </span>
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-faint)]">
                    <span dir="ltr" className="font-mono">
                      {product.slug}
                    </span>
                    <span className="text-[var(--ink-muted)] tabular-nums">
                      {formatMessage(messages.offersCount, { count: product.offerCount }, locale)}
                    </span>
                    {product.providerCode ? (
                      <span>
                        {messages.providerLabel}: <span dir="ltr">{product.providerCode}</span>
                      </span>
                    ) : null}
                    {product.providerUrl ? (
                      <a
                        href={product.providerUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[var(--accent-strong)] underline-offset-4 transition-colors duration-[var(--duration)] hover:underline"
                      >
                        <LinkIcon className="size-3" />
                        <span dir="ltr">{messages.supplierLinkTitle}</span>
                      </a>
                    ) : null}
                    {product.providerCategoryTitle ? (
                      <span>
                        {messages.providerCategoryLabel}: {product.providerCategoryTitle}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge tone={product.isActive ? "success" : "neutral"}>
                    {product.isActive ? messages.published : messages.unpublished}
                  </Badge>
                  {product.activeOfferCount === 0 ? <Badge tone="warning">{messages.noActiveOffers}</Badge> : null}
                  {product.isFeatured ? <Badge tone="accent">{messages.featured}</Badge> : null}
                  {product.showInCarousel ? <Badge tone="sale">{messages.inCarousel}</Badge> : null}
                  <Link
                    to={`/${locale}/dashboard/catalog/${product.id}`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 text-xs font-semibold text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    aria-label={`${messages.editAction}: ${locale === "ar" ? product.nameAr : product.nameEn}`}
                  >
                    {messages.editAction}
                    <ChevronIcon direction="end" className="size-4 rtl:rotate-180" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
