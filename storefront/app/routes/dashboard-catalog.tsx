import { Link } from "react-router";
import { z } from "zod";
import { EmptyState } from "@/components/shared/states";
import { StoreImage } from "@/components/store/store-image";
import {
  ChevronIcon,
  GamepadIcon,
  LinkIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import {
  listAdminProducts,
  listAdminProviderCategories,
} from "@server/legacy/lib/services/admin-catalog.service";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { requireDashboardAdmin } from "@server/dashboard-access";

const MAX_QUERY_LENGTH = 80;

const filtersSchema = z.object({
  q: z.string().max(400).optional(),
  published: z.string().max(8).optional(),
  category: z.string().max(120).optional(),
});

type CatalogFilters = { query: string; publishedOnly: boolean; category: string };

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

function requireLocale(value: string | undefined) {
  if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 });
  return value;
}

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
    <div className="space-y-6">
      {/* 1. Header with Title & Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            <GamepadIcon className="size-4 text-[var(--accent)]" />
            <span>{messages.eyebrow}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            {messages.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {messages.description}
          </p>
        </div>

        <div>
          <Link
            to={`/${locale}/dashboard/catalog/new`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--accent-strong)] transition-colors"
          >
            <PlusIcon className="size-4" />
            <span>{messages.create.action}</span>
          </Link>
        </div>
      </div>

      {/* 2. Modern Filter & Search Toolbar */}
      <div className="admin-card space-y-4">
        <form
          method="get"
          action={`/${locale}/dashboard/catalog`}
          className="flex flex-wrap items-end gap-3"
        >
          {filters.publishedOnly ? <input type="hidden" name="published" value="1" /> : null}

          {/* Category Filter */}
          <div className="grid min-w-48 flex-1 sm:flex-none gap-1.5">
            <label
              htmlFor="catalog-category-select"
              className="text-xs font-semibold text-[var(--ink-soft)]"
            >
              {messages.categoryFilterLabel}
            </label>
            <select
              id="catalog-category-select"
              name="category"
              defaultValue={filters.category}
              className="h-10 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
            >
              <option value="">{messages.allCategories}</option>
              {providerCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title} ({category.count})
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
            <label
              htmlFor="catalog-search-input"
              className="text-xs font-semibold text-[var(--ink-soft)]"
            >
              {messages.searchLabel}
            </label>
            <div className="relative flex items-center">
              <input
                id="catalog-search-input"
                name="q"
                type="search"
                defaultValue={filters.query}
                placeholder={messages.searchPlaceholder}
                maxLength={MAX_QUERY_LENGTH}
                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          {/* Submit Search Button */}
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)] hover:border-[var(--line-strong)] transition-colors cursor-pointer"
          >
            <SearchIcon className="size-4 text-[var(--ink-muted)]" />
            <span>{messages.searchLabel}</span>
          </button>
        </form>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
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
                  "inline-flex h-8 items-center rounded-full px-3.5 text-xs font-semibold transition-all duration-150",
                  active
                    ? "bg-[var(--accent)] text-white shadow-xs"
                    : "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]",
                )}
              >
                {option.label}
              </Link>
            );
          })}

          <div className="ms-auto text-xs font-semibold text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.countLabel, { count: products.length }, locale)}
          </div>
        </div>
      </div>

      {/* 3. Products List / Grid */}
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
        <div className="divide-y divide-[var(--line)] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-[var(--elevation-1)]">
          {products.map((product) => (
            <div
              key={product.id}
              className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 hover:bg-[var(--surface-strong)] transition-colors duration-150"
            >
              {/* Product Artwork Thumbnail */}
              <div className="size-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)]">
                <StoreImage src={product.imageUrl} alt="" sizes="56px" />
              </div>

              {/* Product Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/${locale}/dashboard/catalog/${product.id}`}
                    className="font-bold text-sm text-[var(--ink)] hover:text-[var(--accent-strong)] transition-colors"
                  >
                    {locale === "ar" ? product.nameAr : product.nameEn}
                  </Link>
                  <span className="text-xs text-[var(--ink-muted)] font-medium" dir="ltr">
                    ({locale === "ar" ? product.nameEn : product.nameAr})
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-soft)]">
                  <span dir="ltr" className="font-mono text-[var(--ink-muted)] bg-[var(--surface-inset)] px-1.5 py-0.5 rounded border border-[var(--line)] text-[11px]">
                    {product.slug}
                  </span>
                  <span className="font-semibold text-[var(--ink)] tabular-nums">
                    {formatMessage(messages.offersCount, { count: product.offerCount }, locale)}
                  </span>
                  {product.providerCode ? (
                    <span className="text-[var(--ink-muted)]">
                      {messages.providerLabel}: <span dir="ltr" className="font-semibold text-[var(--ink)]">{product.providerCode}</span>
                    </span>
                  ) : null}
                  {product.providerUrl ? (
                    <a
                      href={product.providerUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                    >
                      <LinkIcon className="size-3" />
                      <span dir="ltr">{messages.supplierLinkTitle}</span>
                    </a>
                  ) : null}
                  {product.providerCategoryTitle ? (
                    <span className="text-[var(--ink-muted)]">
                      {product.providerCategoryTitle}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Badges & Edit Arrow */}
              <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line)]">
                <span
                  className={cn(
                    "admin-badge",
                    product.isActive ? "admin-badge-success" : "admin-badge-neutral",
                  )}
                >
                  {product.isActive ? messages.published : messages.unpublished}
                </span>

                {product.activeOfferCount === 0 ? (
                  <span className="admin-badge admin-badge-warning">
                    {messages.noActiveOffers}
                  </span>
                ) : null}

                {product.isFeatured ? (
                  <span className="admin-badge admin-badge-accent">
                    {messages.featured}
                  </span>
                ) : null}
                <Link
                  to={`/${locale}/dashboard/catalog/${product.id}`}
                  className="ms-1 inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-inset)] transition-colors"
                  aria-label={`${messages.editAction}: ${locale === "ar" ? product.nameAr : product.nameEn}`}
                >
                  <span className="hidden md:inline">{messages.editAction}</span>
                  <ChevronIcon
                    direction={locale === "ar" ? "start" : "end"}
                    className="size-4"
                  />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
